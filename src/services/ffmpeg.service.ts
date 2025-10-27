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
  { name: '480p', height: 480, videoKbps: 3600, maxrateKbps: 4400, bufsizeKbps: 7200, audioKbps: 128, crf: 20 },
]

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
    return {
      ...profile,
      name: targetHeight === profile.height ? profile.name : `${targetHeight}p`,
      targetHeight,
      videoLabel: `vout${index}`,
      splitLabel: `vsplit${index}`,
      resolution,
    }
  })

  const filterGraph = buildFilterGraph(rotationFilter, renditionConfigs)
  const cmd = ffmpeg(inputPath)
  if (filterGraph.length) {
    cmd.complexFilter(filterGraph)
  }

  renditionConfigs.forEach((cfg) => {
    const playlistName = `${cfg.name}.m3u8`
    const playlistPath = path.join(outputDir, playlistName)
    const segmentPattern = toPosix(path.join(outputDir, `${cfg.name}_%03d.ts`))

    cmd
      .output(toPosix(playlistPath))
      .outputOptions([
        `-map [${cfg.videoLabel}]`,
        '-map 0:a:0?',
        '-c:v libx264',
        '-preset fast',
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
        '-hls_time 4',
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
      .on('error', (err) => reject(err))
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

  return {
    masterPlaylistPath,
    keyPath,
    keyInfoPath,
    iv: iv.toString('hex'),
  }
}
