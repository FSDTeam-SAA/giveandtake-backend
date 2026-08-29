import path from 'path'
import axios from 'axios'
import type { Request, Response } from 'express'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import catchAsync from '../utils/catchAsync'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import {
  deleteFromS3,
  getSignedS3Url,
  getSignedUploadUrl,
} from '../services/s3.service'
import {
  enqueueElevatorPitchTranscode,
  removeElevatorPitchArtifacts,
} from '../services/videoProcessing.queue'
import { createNotification } from '../sockets/notification.service'
import { User } from '../models/user.model'
import { getVideoMetadata } from '../services/ffmpeg.service'
import { validateElevatorPitchAccess } from '../helper/validateElevatorPitchAccess'
import { createToken } from '../utils/authToken'
import {
  canViewCandidatePitch,
  PITCH_PLAYBACK_SCOPE,
  PITCH_PLAYBACK_SECRET,
} from '../middlewares/checkVideoAccess.middleware'
import { isCandidatePitchAvailable } from '../services/candidatePitchEntitlement.service'

const PUBLIC_OWNER_ROLES = ['recruiter', 'company']

// Read the `?t=` playback token off a stream request so it can be propagated
// into rewritten playlist URLs (segments + key). Empty string when absent.
const getPlaybackTokenParam = (req: Request, pitchId?: string): string => {
  const raw = Array.isArray(req.query.t) ? req.query.t[0] : req.query.t
  if (typeof raw === 'string' && raw) return raw

  // Older Flutter builds put the access JWT in `?token=` on the initial
  // master-playlist request. optionalAuth has already verified that token and
  // populated req.user. Mint the proper scoped token for every child URL.
  const legacy = Array.isArray(req.query.token)
    ? req.query.token[0]
    : req.query.token
  const viewer = req.user as any
  if (typeof legacy === 'string' && legacy && pitchId && viewer?._id) {
    return createToken(
      {
        scope: PITCH_PLAYBACK_SCOPE,
        pitchId,
        viewerId: viewer._id.toString(),
        viewerRole: viewer.role,
      },
      PITCH_PLAYBACK_SECRET,
      '2h'
    )
  }

  return ''
}

const appendPlaybackToken = (urlPath: string, token: string): string =>
  token
    ? `${urlPath}${urlPath.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`
    : urlPath

const BUCKET = process.env.R2_BUCKET_NAME || process.env.AWS_BUCKET_NAME || "";

// Turn any stored asset URL into a plain R2 object key. Handles every host the
// pitches are stored behind (S3 API host, pub-*.r2.dev, custom CDN domain) and
// strips a leading bucket segment when the URL is path-style.
const extractR2Key = (url: string): string => {
  if (!url) return "";
  let key: string;
  try {
    key = new URL(url).pathname;
  } catch {
    // Already a bare key, not an absolute URL.
    key = url;
  }
  key = decodeURIComponent(key).replace(/^\/+/, "");
  return BUCKET && key.startsWith(`${BUCKET}/`)
    ? key.slice(BUCKET.length + 1)
    : key;
};


const ensureString = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `${field} is required and must be a string`
    )
  }
  return value.trim()
}

const resolveUserId = (req: Request): string => {
  if (typeof req.query.userId === 'string' && req.query.userId.trim()) {
    return req.query.userId.trim()
  }
  // @ts-ignore - added by auth middleware
  if (req.user?._id) {
    // @ts-ignore
    return req.user._id.toString()
  }
  throw new AppError(httpStatus.BAD_REQUEST, 'User ID is required')
}

const resolveDeleteUserId = (req: Request): string => {
  // @ts-ignore - added by auth middleware
  const authenticatedUserId = req.user?._id?.toString()
  if (!authenticatedUserId) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Authenticated user is required')
  }

  const requestedUserId =
    typeof req.query.userId === 'string' && req.query.userId.trim()
      ? req.query.userId.trim()
      : authenticatedUserId
  // @ts-ignore - added by auth middleware
  const role = req.user?.role
  const isAdmin = role === 'admin' || role === 'super-admin'

  if (requestedUserId !== authenticatedUserId && !isAdmin) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You can only delete your own elevator pitch'
    )
  }

  return requestedUserId
}

const resolveUploadUserId = (req: Request): string => {
  // @ts-ignore - added by auth middleware
  if (req.user?._id) {
    // @ts-ignore
    return req.user._id.toString()
  }
  throw new AppError(httpStatus.BAD_REQUEST, 'Authenticated user is required')
}

const sanitizeFileName = (name: string) =>
  name
    .trim()
    .replace(/[^a-zA-Z0-9.\-_]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()

const inferExtensionFromMime = (mime: string) => {
  if (!mime) return ''
  const map: Record<string, string> = {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/webm': '.webm',
    'video/ogg': '.ogv',
    'video/x-matroska': '.mkv',
  }
  return map[mime] ?? ''
}

const ensureFileExtension = (fileName: string, mime: string) => {
  const ext = path.extname(fileName)
  if (ext) return fileName
  const inferred = inferExtensionFromMime(mime)
  return inferred ? `${fileName}${inferred}` : `${fileName}.mp4`
}

const buildRawS3Key = (userId: string, fileName: string) => {
  const token = Math.random().toString(36).slice(2, 10)
  return `elevator_pitches/${userId}/source/${Date.now()}-${token}-${fileName}`
}

const assertUploadKeyMatchesSession = (
  userId: string,
  fileKey: string,
  expectedKey?: string | null
) => {
  const expectedPrefix = `elevator_pitches/${userId}/source/`

  if (!fileKey.startsWith(expectedPrefix)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid upload file key')
  }

  if (!expectedKey) {
    throw new AppError(
      httpStatus.CONFLICT,
      'Upload session is no longer valid. Request a new upload URL.'
    )
  }

  if (fileKey !== expectedKey) {
    throw new AppError(
      httpStatus.CONFLICT,
      'Upload session mismatch. Request a new upload URL and retry.'
    )
  }
}

export const requestElevatorPitchUploadUrl = catchAsync(
  async (req: Request, res: Response) => {
    const userId = resolveUploadUserId(req)

    const fileNameRaw = ensureString(req.body?.fileName, 'fileName')
    const fileType = ensureString(req.body?.fileType, 'fileType')
    if (!fileType.startsWith('video/')) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Only video uploads are supported'
      )
    }

    const fileSizeRaw = req.body?.fileSize
    const fileSize =
      typeof fileSizeRaw === 'number'
        ? fileSizeRaw
        : typeof fileSizeRaw === 'string'
        ? Number.parseInt(fileSizeRaw, 10)
        : undefined

    const existingPitch = await ElevatorPitch.findOne({ userId })
    if (existingPitch) {
      await removeElevatorPitchArtifacts({
        userId,
        rawKey: existingPitch.video?.rawKey ?? existingPitch.video?.url ?? undefined,
      })
      await ElevatorPitch.deleteMany({ userId })
    }

    const sanitizedName = ensureFileExtension(
      sanitizeFileName(fileNameRaw),
      fileType
    )
    const rawKey = buildRawS3Key(userId, sanitizedName)

    const pitch = await ElevatorPitch.create({
      userId,
      status: 'deactivate',
      video: {
        url: null,
        hlsUrl: null,
        encryptionKeyUrl: null,
        rawKey: null,
        rawBucket: null,
        localPaths: {
          original: null,
          hls: null,
          key: null,
        },
      },
      processing: {
        state: 'pending',
        updatedAt: new Date(),
        retries: 0,
      },
    })

    pitch.video = {
      ...(pitch.video ?? {}),
      rawKey,
      rawBucket: process.env.AWS_BUCKET_NAME ?? null,
      localPaths: {
        original: pitch.video?.localPaths?.original ?? null,
        hls: pitch.video?.localPaths?.hls ?? null,
        key: pitch.video?.localPaths?.key ?? null,
      },
    }
    pitch.processing = {
      ...(pitch.processing ?? { retries: 0 }),
      state: 'pending',
      updatedAt: new Date(),
      completedAt: null,
      error: null,
      fileSize: fileSize ?? null,
      fileName: sanitizedName,
    }
    pitch.video.hlsUrl = null
    pitch.video.encryptionKeyUrl = null
    pitch.status = 'deactivate'
    await pitch.save()

    const signedUpload = await getSignedUploadUrl({
      key: rawKey,
      contentType: fileType,
    })

    res.status(httpStatus.OK).json({
      success: true,
      data: {
        uploadUrl: signedUpload.uploadUrl,
        key: rawKey,
        bucket: signedUpload.bucket,
        fileName: sanitizedName,
      },
    })
  }
)

export const completeElevatorPitchUpload = catchAsync(
  async (req: Request, res: Response) => {
    const userId = resolveUploadUserId(req)
    const fileKey = ensureString(req.body?.fileKey, 'fileKey')
    const fileName =
      typeof req.body?.fileName === 'string' ? req.body.fileName : undefined
    const fileSize =
      typeof req.body?.fileSize === 'number'
        ? req.body.fileSize
        : typeof req.body?.fileSize === 'string'
        ? Number.parseInt(req.body.fileSize, 10)
        : undefined

    const pitch = await ElevatorPitch.findOne({ userId })
    if (!pitch) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Upload session not found. Request a new upload URL.'
      )
    }

    if (pitch.processing?.state === 'ready' && pitch.video?.hlsUrl) {
      throw new AppError(
        httpStatus.CONFLICT,
        'Elevator pitch already completed. Delete the existing video to re-upload.'
      )
    }

    assertUploadKeyMatchesSession(userId, fileKey, pitch.video?.rawKey)

    // Save raw reference early so failures can be audited & cleaned up.
    pitch.video = {
      ...(pitch.video ?? {}),
      rawKey: fileKey,
      rawBucket: process.env.AWS_BUCKET_NAME ?? null,
      localPaths: {
        original: pitch.video?.localPaths?.original ?? null,
        hls: pitch.video?.localPaths?.hls ?? null,
        key: pitch.video?.localPaths?.key ?? null,
      },
    }
    pitch.processing = {
      ...(pitch.processing ?? { retries: 0 }),
      state: 'pending',
      updatedAt: new Date(),
      completedAt: null,
      error: null,
      fileName: fileName ?? pitch.processing?.fileName ?? null,
      fileSize: fileSize ?? pitch.processing?.fileSize ?? null,
    }
    pitch.status = 'deactivate'
    await pitch.save()

    // --- NEW: Probe and validate BEFORE queueing ---
    try {
      // Use a short-lived signed URL so ffprobe can read from S3 without downloading the whole file.
      const signedGetUrl = await getSignedS3Url(fileKey, 10 * 60) // 10 minutes
      const meta = await getVideoMetadata(signedGetUrl)

      pitch.metadata = {
        duration: meta.duration,
        format: meta.format,
        vcodec: meta.vcodec,
        rotation: meta.rotation,
        width: meta.width,
        height: meta.height,
      }
      await pitch.save()

      // Enforce access limits here so the client gets an immediate error (not 202).
      await validateElevatorPitchAccess(userId.toString(), meta.duration)
    } catch (error) {
      const message =
        (error as Error)?.message ?? 'Validation failed for uploaded video'

      // mark as failed so the UI can reflect the error state
      pitch.processing = {
        ...(pitch.processing ?? {}),
        state: 'failed',
        updatedAt: new Date(),
        error: message,
        retries: (pitch.processing?.retries ?? 0) + 1,
      }
      await pitch.save()

      // Remove only this failed source object. Deleting whole prefixes here can
      // race with a retry or an already-ready HLS output for the same user.
      try {
        await deleteFromS3(fileKey)
      } catch (deleteError) {
        console.warn(
          `Failed to delete invalid elevator pitch source "${fileKey}":`,
          deleteError
        )
      }

      // Re-throw so catchAsync sends the proper HTTP status (from AppError)
      throw error
    }
    // --- END NEW ---

    // If we got here, validation passed -> queue the job
    pitch.processing = {
      ...(pitch.processing ?? { retries: 0 }),
      state: 'queued',
      updatedAt: new Date(),
      completedAt: null,
      error: null,
      fileName: fileName ?? pitch.processing?.fileName ?? null,
      fileSize: fileSize ?? pitch.processing?.fileSize ?? null,
    }
    pitch.status = 'deactivate'
    await pitch.save()

    enqueueElevatorPitchTranscode({
      userId,
      s3Key: fileKey,
      fileName: pitch.processing?.fileName ?? fileName,
      fileSize: pitch.processing?.fileSize ?? fileSize,
    })

    res.status(httpStatus.ACCEPTED).json({
      success: true,
      message: 'Upload received. Video processing has started.',
      data: { processingState: 'queued' },
    })
  }
)


export const getElevatorPitchForUser = catchAsync(
  async (req: Request, res: Response) => {
    const userId = resolveUserId(req)
    const pitch = await ElevatorPitch.findOne({ userId })
    if (!pitch) {
      res.status(httpStatus.OK).json({ success: true, data: null })
      return
    }

    const owner = await User.findById(userId).select('role')
    if (
      owner?.role === 'candidate' &&
      !(await isCandidatePitchAvailable(pitch, owner._id as any))
    ) {
      res.status(httpStatus.OK).json({ success: true, data: null })
      return
    }

    res.status(httpStatus.OK).json({
      success: true,
      data: pitch,
    })
  }
)

export const deleteResume = catchAsync(async (req: Request, res: Response) => {
  const userId = resolveDeleteUserId(req)

  const pitch = await ElevatorPitch.findOne({ userId })
  if (!pitch) {
    // DELETE is idempotent: the requested end state has already been reached.
    // Keep a JSON 200 response for compatibility with clients that parse the
    // standard API response envelope (notably the Flutter application).
    res.status(httpStatus.OK).json({
      success: true,
      message: 'Elevator pitch deleted successfully',
    })
    return
  }

  await removeElevatorPitchArtifacts({
    userId,
    rawKey: pitch.video?.rawKey ?? pitch.video?.url ?? undefined,
  })

  await ElevatorPitch.deleteOne({ _id: pitch._id })

  // @ts-ignore - admin roles set by auth middleware
  if (req.user?.role === 'admin' || req.user?.role === 'super-admin') {
    await createNotification({
      to: userId as any,
      message:
        'Admin has removed your elevator pitch video. Please upload again.',
      type: 'Update elevator pitch',
      id: pitch._id as any,
    })
  }

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Elevator pitch deleted successfully',
  })
})

/**
 * Mint a short-lived playback token for a pitch the authenticated user is
 * allowed to watch. Company/recruiter pitches are public → returns
 * { public: true } and the client uses the plain stream URL. Candidate pitches
 * → returns { token } if authorized, else 403. Enables native-HLS/iOS playback
 * where an Authorization header cannot be attached.
 */
export const getPitchPlaybackToken = catchAsync(
  async (req: Request, res: Response) => {
    const { pitchId } = req.params
    const pitch = await ElevatorPitch.findById(pitchId).populate('userId', 'role')
    if (!pitch) {
      throw new AppError(httpStatus.NOT_FOUND, 'Elevator pitch not found')
    }

    const ownerRole = (pitch.userId as any)?.role
    if (PUBLIC_OWNER_ROLES.includes(ownerRole)) {
      res.status(httpStatus.OK).json({ success: true, public: true })
      return
    }

    const ownerId = (pitch.userId as any)?._id ?? pitch.userId
    if (!(await isCandidatePitchAvailable(pitch, ownerId))) {
      throw new AppError(httpStatus.NOT_FOUND, 'Elevator pitch not found')
    }

    const viewer = req.user as any
    const allowed = await canViewCandidatePitch(pitch as any, viewer)
    if (!allowed) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'You do not have access to this video'
      )
    }

    const token = createToken(
      {
        scope: PITCH_PLAYBACK_SCOPE,
        pitchId: (pitch._id as any).toString(),
        viewerId: viewer._id.toString(),
        viewerRole: viewer.role,
      },
      PITCH_PLAYBACK_SECRET,
      '2h'
    )

    res.status(httpStatus.OK).json({ success: true, public: false, token })
  }
)

export const streamElevatorPitch = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const pitch = await ElevatorPitch.findById(id);

  if (!pitch || pitch.status !== 'active' || !pitch.video?.hlsUrl) {
    throw new AppError(httpStatus.NOT_FOUND, "Elevator pitch not found");
  }

  if (pitch.processing?.state !== "ready") {
    throw new AppError(httpStatus.CONFLICT, "Elevator pitch is still processing.");
  }

  const hlsUrl = pitch.video.hlsUrl;
  const isPrivateBucket = process.env.AWS_BUCKET_VISIBILITY === "private";

  if (isPrivateBucket) {
    // ✅ Use R2-aware key extraction
    const s3Key = extractR2Key(hlsUrl);
    console.log("Resolved R2 key:", s3Key);

    const signedUrl = await getSignedS3Url(s3Key, 3600);
    console.log("Signed R2 URL:", signedUrl);

    // Fetch and rewrite playlist
    const playlistRes = await axios.get(signedUrl);
    let playlistContent = playlistRes.data as string;

    // Carry the playback token (if any) into the rewritten variant URLs so
    // gated (candidate) playback works through the proxy chain.
    const playbackToken = getPlaybackTokenParam(
      req,
      (pitch._id as any).toString()
    );

    const rewriteAssetLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      if (/\.(ts|m3u8)$/i.test(trimmed)) {
        return appendPlaybackToken(
          `/api/v1/elevator-pitch/stream/${pitch.userId.toString()}/${trimmed}`,
          playbackToken
        );
      }
      return line;
    };

    playlistContent = playlistContent
      .split("\n")
      .map(rewriteAssetLine)
      .join("\n");

    res.set({
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-cache",
    });

    res.send(playlistContent);
    return;
  }

  // If public
  res.redirect(hlsUrl);
  return;
});


export const secureStream = catchAsync(async (req: Request, res: Response) => {
  const { userId, segment } = req.params

  const pitch = await ElevatorPitch.findOne({ userId })
  if (!pitch || pitch.status !== 'active' || !pitch.video?.hlsUrl) {
    throw new AppError(httpStatus.NOT_FOUND, 'Elevator pitch not found')
  }

  if (pitch.processing?.state !== 'ready') {
    throw new AppError(
      httpStatus.CONFLICT,
      'Elevator pitch is still processing.'
    )
  }

  const hlsUrl = pitch.video.hlsUrl
  const baseS3Key = extractR2Key(hlsUrl);

  const sanitizedSegment = segment.replace(/\\/g, '/')
  if (sanitizedSegment.includes('..')) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid segment reference')
  }
  const baseDirectory = baseS3Key.replace(/[^/]+$/, '')
  const segmentS3Key = `${baseDirectory}${sanitizedSegment}`
  const isPlaylist = sanitizedSegment.toLowerCase().endsWith('.m3u8')
  const playbackToken = getPlaybackTokenParam(req)

  try {
    const signedSegmentUrl = await getSignedS3Url(segmentS3Key, 3600)

    // When a playback token is in play and this is a variant playlist, rewrite
    // its segment names and #EXT-X-KEY URI to carry the token so gated
    // (candidate) playback flows all the way through. Public/no-token requests
    // keep the original streaming behavior byte-for-byte.
    if (isPlaylist && playbackToken) {
      const playlistRes = await axios.get(signedSegmentUrl, {
        responseType: 'text',
      })
      const rewritten = (playlistRes.data as string)
        .split('\n')
        .map((line) => {
          const trimmed = line.trim()
          if (!trimmed) return line
          // Rewrite the encryption key URI (inside quotes)
          if (trimmed.startsWith('#EXT-X-KEY')) {
            return line.replace(/URI="([^"]+)"/, (_m, uri) => {
              return `URI="${appendPlaybackToken(uri, playbackToken)}"`
            })
          }
          if (trimmed.startsWith('#')) return line
          // Rewrite relative segment / sub-playlist references
          if (/\.(ts|m3u8)$/i.test(trimmed)) {
            return appendPlaybackToken(trimmed, playbackToken)
          }
          return line
        })
        .join('\n')

      res.set({
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
      })
      res.send(rewritten)
      return
    }

    const response = await axios.get(signedSegmentUrl, {
      responseType: 'stream',
    })

    res.set({
      'Content-Type': isPlaylist
        ? 'application/vnd.apple.mpegurl'
        : 'video/mp2t',
      'Cache-Control': 'no-cache',
    })

    response.data.pipe(res)
  } catch (err) {
    throw new AppError(httpStatus.NOT_FOUND, 'Segment not found in S3')
  }
})

export const getEncryptionKey = catchAsync(
  async (req: Request, res: Response) => {
    const { userId, key } = req.params

    const pitch = await ElevatorPitch.findOne({ userId })
    if (!pitch || pitch.status !== 'active' || !pitch.video?.encryptionKeyUrl) {
      throw new AppError(httpStatus.NOT_FOUND, 'Encryption key not found')
    }

    if (pitch.processing?.state !== 'ready') {
      throw new AppError(
        httpStatus.CONFLICT,
        'Elevator pitch is still processing.'
      )
    }

    if (!pitch.video.encryptionKeyUrl.includes(key)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid key name requested')
    }

    try {
      const encryptionKeyUrl = pitch.video.encryptionKeyUrl
      const s3Key = extractR2Key(encryptionKeyUrl);


      const signedKeyUrl = await getSignedS3Url(s3Key, 3600)
      const keyResponse = await axios.get(signedKeyUrl, {
        responseType: 'arraybuffer',
      })

      res.set({
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store',
      })

      res.send(Buffer.from(keyResponse.data))
    } catch {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Failed to fetch encryption key from S3'
      )
    }
  }
)

export const getAllElevatorPitches = catchAsync(
  async (req: Request, res: Response) => {
    const { type } = req.query

    if (!type || typeof type !== 'string') {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Query param "type" is required'
      )
    }

    const allowedRoles = ['candidate', 'recruiter', 'company']
    if (!allowedRoles.includes(type)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid user type')
    }

    const users = await User.find({ role: type }, '_id name email')
    const userIds = users.map((u) => u._id)

    // Do NOT leak storage URLs / keys — this endpoint is enumerable. Playback
    // always goes through the gated /stream/:id proxy using the pitch _id.
    const pitches = await ElevatorPitch.find({
      userId: { $in: userIds },
      status: 'active',
      'processing.state': 'ready',
    })
      .select(
        '-video.rawKey -video.rawBucket -video.encryptionKeyUrl -video.hlsUrl -video.url -video.localPaths'
      )
      .populate('userId', 'name email role')

    const availablePitches =
      type === 'candidate'
        ? (
            await Promise.all(
              pitches.map(async (pitch) => {
                const ownerId = (pitch.userId as any)?._id ?? pitch.userId
                return (await isCandidatePitchAvailable(pitch, ownerId))
                  ? pitch
                  : null
              })
            )
          ).filter(Boolean)
        : pitches

    res.status(httpStatus.OK).json({
      success: true,
      total: availablePitches.length,
      data: availablePitches,
    })
  }
)
