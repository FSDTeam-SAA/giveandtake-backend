import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'

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

      const tagRotate = Number(vstream?.tags?.rotate || 0)
      const rotation = ([0, 90, 180, 270].includes(tagRotate) ? tagRotate : 0) as
        | 0 | 90 | 180 | 270

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
}

type MasterPlaylistEntry = {
  name: string
  playlistFile: string
  bandwidth: number
  averageBandwidth: number
  resolution: string
}

const HLS_RENDITIONS: RenditionProfile[] = [
  { name: '1080p', height: 1080, videoKbps: 5200, maxrateKbps: 5800, bufsizeKbps: 7800, audioKbps: 160 },
  { name: '720p', height: 720, videoKbps: 3200, maxrateKbps: 3600, bufsizeKbps: 5000, audioKbps: 128 },
  { name: '480p', height: 480, videoKbps: 1800, maxrateKbps: 2100, bufsizeKbps: 3200, audioKbps: 96 },
  { name: '360p', height: 360, videoKbps: 1100, maxrateKbps: 1300, bufsizeKbps: 2000, audioKbps: 64 },
]

const ensureEven = (value: number, fallback = 2): number => {
  if (!Number.isFinite(value) || value <= 0) return fallback
  return value % 2 === 0 ? value : value - 1
}

const buildVideoFilters = (
  rotationFilter: string | null,
  targetHeight: number
): string => {
  const filters = []
  if (rotationFilter) filters.push(rotationFilter)
  filters.push(
    `scale=-2:${targetHeight}:force_original_aspect_ratio=decrease:flags=lanczos`
  )
  filters.push('format=yuv420p')
  return filters.join(',')
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
    const assumedWidth = ensureEven(Math.round((16 / 9) * targetHeight), 640)
    return `${assumedWidth}x${targetHeight}`
  }
  const aspect = sourceWidth / sourceHeight
  const targetWidth = ensureEven(Math.round(aspect * targetHeight), 640)
  return `${targetWidth}x${targetHeight}`
}

const transcodeRendition = async ({
  inputPath,
  outputDir,
  keyInfoPath,
  filters,
  profile,
}: {
  inputPath: string
  outputDir: string
  keyInfoPath: string
  filters: string
  profile: RenditionProfile
}) => {
  const playlistName = `${profile.name}.m3u8`
  const playlistPath = path.join(outputDir, playlistName)
  const segmentPattern = toPosix(path.join(outputDir, `${profile.name}_%03d.ts`))

  const cmd = ffmpeg(inputPath)
    .videoCodec('libx264')
    .audioCodec('aac')
    .audioBitrate(`${profile.audioKbps}k`)
    .videoFilters(filters)
    .outputOptions([
      '-pix_fmt yuv420p',
      '-profile:v high',
      '-level 4.1',
      '-preset veryfast',
      `-b:v ${profile.videoKbps}k`,
      `-maxrate ${profile.maxrateKbps}k`,
      `-bufsize ${profile.bufsizeKbps}k`,
      '-map_metadata -1',
      '-metadata:s:v:0 rotate=0',
      '-hls_time 4',
      '-hls_list_size 0',
      '-hls_segment_type mpegts',
      '-hls_flags independent_segments',
      `-hls_segment_filename ${segmentPattern}`,
      `-hls_key_info_file ${keyInfoPath}`,
      '-hls_playlist_type vod',
    ])

  return new Promise<{ playlistPath: string; playlistName: string }>((resolve, reject) => {
    cmd
      .output(toPosix(playlistPath))
      .on('end', () => resolve({ playlistPath, playlistName }))
      .on('error', err => reject(err))
      .run()
  })
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
 * Outputs: playlist.m3u8 + *.ts and encryption.key in outputDir.
 */
export const processVideoHLS = async (
  inputPath: string,
  outputDir: string,
  userId: string
) => {
  // --- HLS key material ---
  const key = crypto.randomBytes(16)
  const keyFileName = 'encryption.key'
  const keyInfoFileName = 'encryption.key.info'
  const iv = crypto.randomBytes(16) // 16 bytes for AES-128

  fs.mkdirSync(outputDir, { recursive: true })
  const keyPath = path.join(outputDir, keyFileName)
  const keyInfoPath = path.join(outputDir, keyInfoFileName)
  const masterPlaylistPath = path.join(outputDir, 'master.m3u8')

  // 1) Write key file
  fs.writeFileSync(keyPath, key)

  // 2) Public URI (your API route that serves the key)
  const keyUri = `/api/v1/elevator-pitch/key/${userId}/${keyFileName}`

  // 3) HLS key info file: <key URI>\n<local key path>\n<IV hex>
  const keyInfoContent = `${keyUri}\n${keyPath}\n${iv.toString('hex')}`
  fs.writeFileSync(keyInfoPath, keyInfoContent)

  // --- Probe rotation & determine rendition set ---
  const { rotation, width, height } = await getVideoMetadata(inputPath)
  const rotated = rotation === 90 || rotation === 270
  const sourceWidth = rotated ? height : width
  const sourceHeight = rotated ? width : height
  const rotationFilter = rotationToVf(rotation)
  const clampedSourceHeight = ensureEven(Math.min(sourceHeight || 1080, 1080), 1080)

  const selectedProfiles = selectRenditions(sourceHeight)
  const masterEntries: MasterPlaylistEntry[] = []

  for (const profile of selectedProfiles) {
    const targetHeight = ensureEven(
      Math.min(profile.height, clampedSourceHeight),
      profile.height
    )
    const filters = buildVideoFilters(rotationFilter, targetHeight)
    await transcodeRendition({
      inputPath,
      outputDir,
      keyInfoPath,
      filters,
      profile,
    })

    const resolution = computeResolution(
      ensureEven(sourceWidth || 1920, 1920),
      ensureEven(sourceHeight || 1080, 1080),
      targetHeight
    )
    masterEntries.push({
      name: profile.name,
      playlistFile: `${profile.name}.m3u8`,
      bandwidth: Math.round(
        (profile.maxrateKbps + profile.audioKbps) * 1000
      ),
      averageBandwidth: Math.round(
        (profile.videoKbps + profile.audioKbps) * 1000
      ),
      resolution,
    })
  }

  writeMasterPlaylist(masterPlaylistPath, masterEntries)

  return {
    masterPlaylistPath,
    keyPath,
    keyInfoPath,
    iv: iv.toString('hex'),
  }
}
