import path from 'path'
import axios from 'axios'
import type { Request, Response } from 'express'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import catchAsync from '../utils/catchAsync'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import {
  getSignedS3Url,
  getSignedUploadUrl,
} from '../services/s3.service'
import {
  enqueueElevatorPitchTranscode,
  removeElevatorPitchArtifacts,
} from '../services/videoProcessing.queue'
import { createNotification } from '../sockets/notification.service'
import { User } from '../models/user.model'
import { AppliedJob } from '../models/appliedJob.model'
import { Job } from '../models/job.model'
import { getVideoMetadata } from '../services/ffmpeg.service'
import { validateElevatorPitchAccess } from '../helper/validateElevatorPitchAccess'
import { isPrivilegedRole, idToString, asQueryString } from '../utils/authz'
import { signMediaToken, isValidMediaToken } from '../utils/mediaToken'

const BUCKET = process.env.R2_BUCKET_NAME || process.env.AWS_BUCKET_NAME || "";

// Robust R2/S3 object-key extractor. Handles every URL shape the upload
// pipeline can produce: the account endpoint (https://<account>.r2.../<bucket>/<key>),
// the bucket-subdomain endpoint (https://<bucket>.<account>.r2.../<key>), a custom
// domain / CDN configured via R2_PUBLIC_BASE (optionally with a sub-path), and a
// bare key. Mirrors normalizeR2Key() in videoProcessing.queue.ts so the playlist /
// segment / key routes resolve the same object the transcoder uploaded.
const extractR2Key = (url: string): string => {
  if (!url) return url;
  try {
    const parsed = new URL(url, "http://placeholder.local");
    let key = parsed.pathname.replace(/^\/+/, "");

    // Strip a leading "<bucket>/" left by the account-style endpoint.
    if (BUCKET && key.startsWith(`${BUCKET}/`)) {
      key = key.slice(BUCKET.length + 1);
    }

    // Strip any sub-path baked into R2_PUBLIC_BASE (custom domain with a prefix).
    const publicBase = process.env.R2_PUBLIC_BASE;
    if (publicBase) {
      try {
        const basePath = new URL(publicBase, "http://placeholder.local")
          .pathname.replace(/^\/+/, "")
          .replace(/\/+$/, "");
        if (basePath && key.startsWith(`${basePath}/`)) {
          key = key.slice(basePath.length + 1);
        }
      } catch {
        // ignore invalid R2_PUBLIC_BASE config
      }
    }

    return key;
  } catch {
    // Not a URL — treat it as an already-bare key.
    return url.replace(/^\/+/, "");
  }
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

/**
 * Resolve the userId a request operates on. Always derives from the
 * authenticated user (req.user._id) so a caller cannot read/upload/complete/
 * delete another user's pitch via ?userId=. A client-supplied ?userId= is only
 * honoured for privileged (admin/super-admin) callers.
 */
const resolveUserId = (req: Request): string => {
  const authUserId = idToString(req.user?._id)
  if (!authUserId) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Authentication required')
  }

  if (
    isPrivilegedRole(req.user?.role) &&
    typeof req.query.userId === 'string' &&
    req.query.userId.trim()
  ) {
    return req.query.userId.trim()
  }

  return authUserId
}

/**
 * C9: authorize access to a pitch's protected media (key/segment) for the
 * media routes that are keyed by :userId rather than the pitch :id (so the
 * checkVideoAccess middleware, which reads req.params.id, cannot be wired
 * directly). Mirrors checkVideoAccess semantics:
 *   - admin/super-admin: allowed
 *   - pitch owner: allowed
 *   - pitch owned by a recruiter/company: allowed (public-facing profile video)
 *   - the recruiter who posted a job the pitch owner applied to: allowed
 * Throws 401/403 otherwise.
 */
const assertPitchMediaAccess = async (
  req: Request,
  ownerUserId: unknown
): Promise<void> => {
  const requesterId = idToString(req.user?._id)
  if (!requesterId) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Authentication required')
  }

  if (isPrivilegedRole(req.user?.role)) return

  const ownerId = idToString(ownerUserId)

  // Owner can always access their own media.
  if (ownerId && requesterId === ownerId) return

  // If the pitch owner is a recruiter/company, the video is profile-facing.
  const owner = await User.findById(ownerId, 'role')
  const ownerRole = owner?.role
  if (ownerRole === 'recruiter' || ownerRole === 'company') return

  // Otherwise allow only the recruiter who posted a job the owner applied to.
  const appliedJob = await AppliedJob.findOne({ userId: ownerId })
  if (appliedJob) {
    const job = await Job.findById(appliedJob.jobId)
    if (job && idToString(job.userId) === requesterId) return
  }

  throw new AppError(httpStatus.FORBIDDEN, 'Access denied')
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

export const requestElevatorPitchUploadUrl = catchAsync(
  async (req: Request, res: Response) => {
    const userId = resolveUserId(req)

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
    const userId = resolveUserId(req)
    // NOTE: the client-supplied fileKey is read for validation only and is
    // never trusted; the key used for signing/probing/queueing is the
    // server-derived rawKey stored on the upload session below.
    const clientFileKey = ensureString(req.body?.fileKey, 'fileKey')
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

    // H21: Do NOT trust the client fileKey. Re-derive the expected source key
    // from this user's upload session and require strict equality plus the
    // per-user source prefix. This prevents naming another user's (or any other)
    // bucket object for signing/probing/transcoding.
    const expectedPrefix = `elevator_pitches/${userId}/source/`
    const expectedKey = pitch.video?.rawKey ?? ''
    if (
      !expectedKey ||
      !expectedKey.startsWith(expectedPrefix) ||
      clientFileKey !== expectedKey
    ) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Invalid file key for this upload session. Request a new upload URL.'
      )
    }

    // Only the server-derived key is used from here on.
    const fileKey = expectedKey

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
      // Enforce access limits here so the client gets an immediate error (not 202)
      await validateElevatorPitchAccess(userId.toString(), meta.duration)

      // persist basic metadata early (optional but handy)
      pitch.metadata = {
        duration: meta.duration,
        format: meta.format,
        vcodec: meta.vcodec,
        rotation: meta.rotation,
        width: meta.width,
        height: meta.height,
      }
      await pitch.save()
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

      // Optionally delete the just-uploaded source and any leftover HLS artifacts
      // (safe to keep if you prefer debugging). Comment this out if you want to retain the raw file.
      await removeElevatorPitchArtifacts({ userId, rawKey: fileKey })

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

    res.status(httpStatus.OK).json({
      success: true,
      data: pitch,
    })
  }
)

export const deleteResume = catchAsync(async (req: Request, res: Response) => {
  const userId = resolveUserId(req)

  const pitch = await ElevatorPitch.findOne({ userId })
  if (!pitch) {
    throw new AppError(httpStatus.NOT_FOUND, 'Elevator pitch not found')
  }

  await removeElevatorPitchArtifacts({
    userId,
    rawKey: pitch.video?.rawKey ?? pitch.video?.url ?? undefined,
  })

  await ElevatorPitch.deleteOne({ _id: pitch._id })

  // @ts-ignore - admin roles set by auth middleware
  if (req.user?.role === 'admin') {
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

export const streamElevatorPitch = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const pitch = await ElevatorPitch.findById(id);

  if (!pitch || !pitch.video?.hlsUrl) {
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

    const signedUrl = await getSignedS3Url(s3Key, 3600);

    // Fetch and rewrite playlist. A failure here is almost always a storage
    // misconfiguration (bad R2 credentials, wrong key, object missing). Log the
    // real cause and return a 502 instead of an opaque 500 so it is diagnosable.
    let playlistContent: string;
    try {
      const playlistRes = await axios.get(signedUrl, { responseType: "text" });
      playlistContent = playlistRes.data as string;
    } catch (err: any) {
      console.error("[streamElevatorPitch] Failed to fetch HLS playlist from storage", {
        pitchId: id,
        s3Key,
        hlsUrl,
        status: err?.response?.status,
        message: err?.message,
      });
      throw new AppError(
        httpStatus.BAD_GATEWAY,
        "Unable to load the video playlist from storage."
      );
    }

    // Mint a short-lived token so the player can fetch the nested playlist,
    // segments, and AES key WITHOUT an Authorization header (native players drop
    // that header on HLS sub-requests). Scoped to this pitch owner.
    const mediaToken = signMediaToken(pitch.userId.toString());
    const rewriteAssetLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      if (/\.(ts|m3u8)$/i.test(trimmed)) {
        return `/api/v1/elevator-pitch/stream/${pitch.userId.toString()}/${trimmed}?t=${mediaToken}`;
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
  const { segment } = req.params
  // Neutralise NoSQL operator injection on the client-supplied userId.
  const userId = asQueryString(req.params.userId)

  const pitch = await ElevatorPitch.findOne({ userId })
  if (!pitch || !pitch.video?.hlsUrl) {
    throw new AppError(httpStatus.NOT_FOUND, 'Elevator pitch not found')
  }

  // Authorise via the short-lived media token baked into the playlist URLs.
  // The master playlist already ran protect + checkVideoAccess before minting
  // this token, so a valid token proves the holder passed that same check.
  if (!isValidMediaToken(req.query.t, pitch.userId.toString())) {
    throw new AppError(httpStatus.FORBIDDEN, 'Access denied')
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
  // Already validated as a real media token by the check above.
  const token = req.query.t as string

  try {
    const signedSegmentUrl = await getSignedS3Url(segmentS3Key, 3600)

    if (isPlaylist) {
      // A nested playlist references the AES key and the .ts segments. Rewrite
      // those URLs so they carry the same `?t=` token — the player fetches them
      // without an Authorization header.
      const playlistRes = await axios.get(signedSegmentUrl, {
        responseType: 'text',
      })
      const rewritten = (playlistRes.data as string)
        .split('\n')
        .map((line) => {
          if (line.startsWith('#EXT-X-KEY')) {
            return line.replace(
              /URI="([^"]+)"/,
              (_m, uri) =>
                `URI="${uri}${uri.includes('?') ? '&' : '?'}t=${token}"`
            )
          }
          const trimmed = line.trim()
          if (trimmed && !trimmed.startsWith('#') && /\.(ts|m3u8)$/i.test(trimmed)) {
            return `${trimmed}${trimmed.includes('?') ? '&' : '?'}t=${token}`
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
      'Content-Type': 'video/mp2t',
      'Cache-Control': 'no-cache',
    })

    response.data.pipe(res)
  } catch (err) {
    throw new AppError(httpStatus.NOT_FOUND, 'Segment not found in S3')
  }
})

export const getEncryptionKey = catchAsync(
  async (req: Request, res: Response) => {
    const { key } = req.params
    // Neutralise NoSQL operator injection on the client-supplied userId.
    const userId = asQueryString(req.params.userId)

    const pitch = await ElevatorPitch.findOne({ userId })
    if (!pitch || !pitch.video?.encryptionKeyUrl) {
      throw new AppError(httpStatus.NOT_FOUND, 'Encryption key not found')
    }

    // Authorise via the short-lived media token (the player fetches the AES key
    // without an Authorization header). The token was minted only after
    // checkVideoAccess passed on the master playlist.
    if (!isValidMediaToken(req.query.t, pitch.userId.toString())) {
      throw new AppError(httpStatus.FORBIDDEN, 'Access denied')
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

    const pitches = await ElevatorPitch.find({
      userId: { $in: userIds },
      'processing.state': 'ready',
    }).populate('userId', 'name email role')

    res.status(httpStatus.OK).json({
      success: true,
      total: pitches.length,
      data: pitches,
    })
  }
)
