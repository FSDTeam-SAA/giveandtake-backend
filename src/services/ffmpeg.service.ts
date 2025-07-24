import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'

export const getVideoMetadata = (
  filePath: string
): Promise<{
  duration: number
  format: string
}> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err)

      const duration = metadata.format.duration || 0
      const format = metadata.format.format_name || 'unknown'

      resolve({ duration, format })
    })
  })
}

export const processVideoHLS = async (inputPath: string, outputDir: string) => {
  const key = crypto.randomBytes(16)
  const keyFileName = 'encryption.key'
  const keyInfoFileName = 'encryption.key.info'
  const iv = crypto.randomBytes(16) // Initialization vector for AES-128

  const keyPath = path.join(outputDir, keyFileName)
  const keyInfoPath = path.join(outputDir, keyInfoFileName)

  // Write encryption key to file
  fs.writeFileSync(keyPath, key)

  // Create keyinfo file: <key URI>\n<key file path>\n<IV in hex>
  const keyInfoContent = `/key/${path.basename(
    outputDir
  )}/${keyFileName}\n${keyPath}\n${iv.toString('hex')}`
  fs.writeFileSync(keyInfoPath, keyInfoContent)

  const playlistPath = path.join(outputDir, 'playlist.m3u8')

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v copy',
        '-c:a copy',
        '-hls_time 10',
        '-hls_list_size 0',
        '-hls_segment_type mpegts',
        '-hls_key_info_file',
        keyInfoPath,
        '-hls_playlist_type vod',
      ])
      .output(playlistPath)
      .on('end', () => {
        resolve({
          playlistPath,
          keyPath,
          keyInfoPath,
          iv: iv.toString('hex'),
        })
      })
      .on('error', (err) => {
        reject(err)
      })
      .run()
  })
}
