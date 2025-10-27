import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import { uploadHLSFilesToS3 } from './s3.service'

type FfprobeSideData = {
  rotation?: number | string
  displaymatrix?: string
  side_data_type?: string
  [key: string]: unknown
}

type FfprobeVideoStream = {
  tags?: Record<string, unknown>
  side_data_list?: FfprobeSideData[]
  [key: string]: unknown
}

const VALID_ROTATIONS: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270]

const normalizeRotation = (value: unknown): 0 | 90 | 180 | 270 => {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
      ? Number.parseFloat(value)
      : Number.NaN

  if (!Number.isFinite(numeric)) return 0

  const normalized = ((Math.round(numeric) % 360) + 360) % 360
  const match = VALID_ROTATIONS.find(rot => Math.abs(normalized - rot) <= 1)
  return (match ?? 0) as 0 | 90 | 180 | 270
}

const extractMatrixRotation = (stream: FfprobeVideoStream | undefined): 0 | 90 | 180 | 270 => {
  if (!stream?.side_data_list) return 0

  for (const entry of stream.side_data_list) {
    if (!entry || typeof entry !== 'object') continue
    if (entry.side_data_type && entry.side_data_type !== 'Display Matrix') continue

    if (entry.rotation !== undefined) {
      const normalized = normalizeRotation(entry.rotation)
      if (normalized !== 0) return normalized
    }

    if (typeof entry.displaymatrix === 'string') {
      const match = entry.displaymatrix.match(/rotation\s*\(?(-?\d+(?:\.\d+)?)\)?/i)
      if (match) {
        const normalized = normalizeRotation(match[1])
        if (normalized !== 0) return normalized
      }
    }
  }

  return 0
}

const resolveRotation = (stream: FfprobeVideoStream | undefined): 0 | 90 | 180 | 270 => {
  const tagRotate = normalizeRotation(stream?.tags?.['rotate'])
  if (tagRotate !== 0) return tagRotate
  return extractMatrixRotation(stream)
}

/** Read duration/format/video codec and rotation (0|90|180|270). */
export const getVideoMetadata = (
  filePath: string
): Promise<{
  duration: number
  format: string
  vcodec: string
  rotation: 0 | 90 | 180 | 270
  width: number
  height: number
}> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err)

      const duration = (metadata.format.duration ?? 0) as number
      const format = (metadata.format.format_name ?? 'unknown') as string

      const vstream = (metadata.streams || []).find(s => s.codec_type === 'video')
      const vcodec = (vstream?.codec_name ?? 'unknown') as string
      const width = (vstream?.width ?? 0) as number
      const height = (vstream?.height ?? 0) as number

      const rotation = resolveRotation(vstream)

      resolve({ duration, format, vcodec, rotation, width, height })
    })
  })
}

/** Map rotation to an ffmpeg video filter string. */
const rotationToVf = (rotation: 0 | 90 | 180 | 270): string | null => {
  // 90°  -> clockwise
  // 180° -> two transposes (simplest)
  // 270° -> counter-clockwise
  if (rotation === 90) return 'transpose=1'
  if (rotation === 180) return 'transpose=1,transpose=1'
  if (rotation === 270) return 'transpose=2'
  return null
}

type RenditionProfile = {
  name: string
  height: number
  videoKbps: number
  maxrateKbps: number
  bufsizeKbps: number
  audioKbps: number
  crf: number
}

type RenditionConfig = RenditionProfile & {
  targetHeight: number
  videoLabel: string
  splitLabel: string
  resolution: string
}

type MasterPlaylistEntry = {
  name: string
  playlistFile: string
  bandwidth: number
  averageBandwidth: number
  resolution: string
}

const HLS_RENDITIONS: RenditionProfile[] = [
  { name: '480p', height: 480, videoKbps: 2600, maxrateKbps: 3120, bufsizeKbps: 5200, audioKbps: 64, crf: 22 },
]

const HLS_SEGMENT_EXTENSION = 'ts'

const ensureEven = (value: number, fallback = 2): number => {
  if (!Number.isFinite(value) || value <= 0) return fallback
  return value % 2 === 0 ? value : value - 1
}

const toPosix = (value: string) => value.split(path.sep).join('/')

const selectRenditions = (sourceHeight?: number) => {
  if (!sourceHeight) return HLS_RENDITIONS
  const enabled = HLS_RENDITIONS.filter(profile => sourceHeight >= profile.height)
  if (enabled.length) return enabled
  return [HLS_RENDITIONS[HLS_RENDITIONS.length - 1]]
}

const computeResolution = (
  sourceWidth: number,
  sourceHeight: number,
  targetHeight: number
) => {
  if (!sourceWidth || !sourceHeight) {
    // Fall back to portrait-friendly assumption
    const assumedWidth = ensureEven(Math.round((9 / 16) * targetHeight), 320)
    return `${assumedWidth}x${targetHeight}`
  }
  const aspect = sourceWidth / sourceHeight
  const targetWidth = ensureEven(Math.round(aspect * targetHeight), 320)
  return `${targetWidth}x${targetHeight}`
}

const buildFilterGraph = (
  rotationFilter: string | null,
  configs: RenditionConfig[]
): string[] => {
  const filters: string[] = []
  const splitInput = rotationFilter ? 'rotated' : '0:v'

  if (rotationFilter) {
    filters.push(`[0:v]${rotationFilter}[rotated]`)
  }

  if (configs.length === 1) {
    const only = configs[0]
    filters.push(
      `[${splitInput}]scale=-2:${only.targetHeight}:force_original_aspect_ratio=decrease:flags=lanczos:force_divisible_by=2,format=yuv420p[${only.videoLabel}]`
    )
    return filters
  }

  const splitOutputs = configs.map(cfg => cfg.splitLabel)
  filters.push(
    `[${splitInput}]split=${configs.length}${splitOutputs
      .map(label => `[${label}]`)
      .join('')}`
  )

  configs.forEach((cfg, idx) => {
    const inputLabel = splitOutputs[idx]
    filters.push(
      `[${inputLabel}]scale=-2:${cfg.targetHeight}:force_original_aspect_ratio=decrease:flags=lanczos:force_divisible_by=2,format=yuv420p[${cfg.videoLabel}]`
    )
  })

  return filters
}

const writeMasterPlaylist = (
  masterPath: string,
  entries: MasterPlaylistEntry[]
) => {
  const lines = ['#EXTM3U']
  entries.forEach(entry => {
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${entry.bandwidth},AVERAGE-BANDWIDTH=${entry.averageBandwidth},RESOLUTION=${entry.resolution},CODECS="avc1.640029,mp4a.40.2"`
    )
    lines.push(entry.playlistFile)
  })
  fs.writeFileSync(masterPath, lines.join('\n'))
}

/**
 * Transcodes to HLS VOD with AES-128 encryption, normalizing orientation.
 * Outputs: playlist.m3u8 + CMAF segments and encryption.key in outputDir.
 */
export const processVideoHLS = async (
  inputPath: string,
  outputDir: string,
  userId: string,
  s3Folder: string
) => {
  if (!s3Folder) {
    throw new Error('s3Folder is required to upload HLS outputs')
  }

  // --- HLS key material ---
  const key = crypto.randomBytes(16)
  const keyFileName = 'encryption.key'
  const keyInfoFileName = 'encryption.key.info'
  const iv = crypto.randomBytes(16) // 16 bytes for AES-128

  fs.mkdirSync(outputDir, { recursive: true })
  const keyPath = path.join(outputDir, keyFileName)
  const keyInfoPath = path.join(outputDir, keyInfoFileName)
  const masterPlaylistPath = path.join(outputDir, 'master.m3u8')

  fs.writeFileSync(keyPath, key)

  const keyUri = `/api/v1/elevator-pitch/key/${userId}/${keyFileName}`

  const keyInfoContent = `${keyUri}\n${keyPath}\n${iv.toString('hex')}`
  fs.writeFileSync(keyInfoPath, keyInfoContent)

  // --- Probe rotation & determine rendition set ---
  const { rotation, width, height, format, vcodec, duration } = await getVideoMetadata(inputPath)
  const safeDuration = Number.isFinite(duration) ? duration.toFixed(2) : 'unknown'
  console.log(
    `[ffmpeg] Source metadata -> format: ${format}, vcodec: ${vcodec}, duration: ${safeDuration}s, width: ${width}, height: ${height}, rotation: ${rotation}`
  )
  const rotated = rotation === 90 || rotation === 270
  const sourceWidth = rotated ? height : width
  const sourceHeight = rotated ? width : height
  const rotationFilter = rotationToVf(rotation)
  const clampedSourceHeight = ensureEven(Math.min(sourceHeight || 1080, 1080), 1080)

  const selectedProfiles = selectRenditions(sourceHeight)
  const renditionConfigs: RenditionConfig[] = selectedProfiles.map((profile, index) => {
    const targetHeight = ensureEven(
      Math.min(profile.height, clampedSourceHeight),
      profile.height
    )
    const resolution = computeResolution(
      ensureEven(sourceWidth || 1920, 1920),
      ensureEven(sourceHeight || 1080, 1080),
      targetHeight
    )
    const name = targetHeight === profile.height ? profile.name : `${targetHeight}p`
    return {
      ...profile,
      name,
      targetHeight,
      videoLabel: `vout${index}`,
      splitLabel: `vsplit${index}`,
      resolution,
    }
  })

  const filterGraph = buildFilterGraph(rotationFilter, renditionConfigs)
  const cmd = ffmpeg(inputPath)
  const ffmpegLogs: string[] = []

  cmd.on('start', (commandLine: string) => {
    console.log(`[ffmpeg] Command: ${commandLine}`)
  })

  cmd.on('stderr', (line: string) => {
    const message = line?.toString().trim()
    if (!message) return
    ffmpegLogs.push(message)
    if (ffmpegLogs.length > 200) {
      ffmpegLogs.shift()
    }
    console.log(`[ffmpeg] ${message}`)
  })

  cmd.addOption('-threads 2')
  if (filterGraph.length) {
    cmd.complexFilter(filterGraph)
  }

  renditionConfigs.forEach((cfg) => {
    const playlistName = `${cfg.name}.m3u8`
    const playlistPath = path.join(outputDir, playlistName)
    const segmentPattern = toPosix(
      path.join(outputDir, `${cfg.name}_%03d.${HLS_SEGMENT_EXTENSION}`)
    )

    cmd
      .output(toPosix(playlistPath))
      .outputOptions([
        `-map [${cfg.videoLabel}]`,
        '-map 0:a:0?',
        '-c:v libx264',
        '-preset veryfast',
        '-profile:v high',
        '-level 4.1',
        `-crf ${cfg.crf}`,
        `-maxrate ${cfg.maxrateKbps}k`,
        `-bufsize ${cfg.bufsizeKbps}k`,
        '-g 48',
        '-keyint_min 48',
        '-pix_fmt yuv420p',
        '-map_metadata -1',
        '-metadata:s:v:0 rotate=0',
        '-c:a aac',
        `-b:a ${cfg.audioKbps}k`,
        '-ac 2',
        '-ar 48000',
        '-hls_time 8',
        '-hls_list_size 0',
        '-hls_segment_type mpegts',
        '-hls_flags independent_segments',
        `-hls_segment_filename ${segmentPattern}`,
        `-hls_key_info_file ${keyInfoPath}`,
        '-hls_playlist_type vod',
      ])
  })

  await new Promise<void>((resolve, reject) => {
    cmd
      .on('end', () => resolve())
      .on('error', (err: Error, _stdout: string | null, stderr: string | null) => {
        const tail = ffmpegLogs.length
          ? `\n---- ffmpeg last output ----\n${ffmpegLogs.slice(-40).join('\n')}`
          : ''
        const aggregatedLogs = ffmpegLogs.join('\n')
        const stderrText = stderr?.trim() ?? ''
        const diagnostic =
          stderrText && !aggregatedLogs.includes(stderrText)
            ? `\n---- ffmpeg stderr ----\n${stderrText}`
            : ''
        const enhancedError = new Error(
          `FFmpeg processing failed: ${err.message}${tail}${diagnostic}`
        )
        ;(enhancedError as Error & { cause?: Error }).cause = err
        reject(enhancedError)
      })
      .run()
  })

  const masterEntries: MasterPlaylistEntry[] = renditionConfigs.map((cfg) => ({
    name: cfg.name,
    playlistFile: `${cfg.name}.m3u8`,
    bandwidth: Math.round((cfg.maxrateKbps + cfg.audioKbps) * 1000),
    averageBandwidth: Math.round((cfg.videoKbps + cfg.audioKbps) * 1000),
    resolution: cfg.resolution,
  }))

  writeMasterPlaylist(masterPlaylistPath, masterEntries)

  const uploadedUrls = await uploadHLSFilesToS3(outputDir, s3Folder)

  return {
    masterPlaylistPath,
    keyPath,
    keyInfoPath,
    iv: iv.toString('hex'),
    uploadedFiles: uploadedUrls,
  }
}
