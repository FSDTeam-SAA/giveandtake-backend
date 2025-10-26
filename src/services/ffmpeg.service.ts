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

const ensureEven = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 1080
  return value % 2 === 0 ? value : value - 1
}

const buildVideoFilters = (
  rotationFilter: string | null,
  cappedHeight: number
): string => {
  const filters = []
  if (rotationFilter) filters.push(rotationFilter)
  filters.push(
    `scale=-2:${cappedHeight}:force_original_aspect_ratio=decrease:flags=lanczos`
  )
  filters.push('format=yuv420p')
  return filters.join(',')
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
  const playlistPath = path.join(outputDir, 'playlist.m3u8')

  // 1) Write key file
  fs.writeFileSync(keyPath, key)

  // 2) Public URI (your API route that serves the key)
  const keyUri = `/api/v1/elevator-pitch/key/${userId}/${keyFileName}`

  // 3) HLS key info file: <key URI>\n<local key path>\n<IV hex>
  const keyInfoContent = `${keyUri}\n${keyPath}\n${iv.toString('hex')}`
  fs.writeFileSync(keyInfoPath, keyInfoContent)

  // --- Probe rotation & build filters/codecs ---
  const { rotation, height } = await getVideoMetadata(inputPath)
  const vf = rotationToVf(rotation)
  const maxHeight = ensureEven(Math.min(height || 1080, 1080))
  const filterChain = buildVideoFilters(vf, maxHeight)

  // We re-encode to H.264/AAC for broad HLS compatibility
  // and strip any residual rotate metadata.
  const cmd = ffmpeg(inputPath)
    .videoCodec('libx264')
    .audioCodec('aac')
    .audioBitrate('160k')
    .outputOptions([
      '-pix_fmt yuv420p',
      '-profile:v main',
      '-level 4.0',
      '-preset veryfast',
      '-crf 21',
      '-maxrate 5200k',
      '-bufsize 7800k',
      '-g 48',
      '-keyint_min 48',
      '-movflags faststart',
      '-map_metadata -1',          // drop global metadata
      '-metadata:s:v:0 rotate=0',  // ensure no rotate tag remains
      // HLS options
      '-hls_time 4',
      '-hls_list_size 0',
      '-hls_segment_type mpegts',
      '-hls_flags independent_segments',
      `-hls_key_info_file ${keyInfoPath}`,
      '-hls_playlist_type vod',
    ])

  if (filterChain) cmd.videoFilters(filterChain)

  return new Promise<{
    playlistPath: string
    keyPath: string
    keyInfoPath: string
    iv: string
  }>((resolve, reject) => {
    cmd
      .output(playlistPath)
      .on('end', () => {
        resolve({
          playlistPath,
          keyPath,
          keyInfoPath,
          iv: iv.toString('hex'),
        })
      })
      .on('error', (err) => reject(err))
      .run()
  })
}
