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
  // GENERATE RANDOM KEY FOR AES 128 ENCRIPTION
  const key = crypto.randomBytes(16).toString('hex')
  const keyFileName = 'encryption.key'
  const keyInfoFileName = 'encryption.key.info'

  const keyPath = path.join(outputDir, keyFileName)
  const keyInfoPath = path.join(outputDir, keyInfoFileName)

  // WRITE ENCRYPTION KEY TO FILE
  fs.writeFileSync(keyPath, key)

  // CREATE KEYINFO FILE FORMAT: URL PATH TO KEY
  const keyInfoContent = `${keyFileName}\n${keyPath}\n${key}`
  fs.writeFileSync(keyInfoPath, keyInfoContent)

  const playlistPath = path.join(outputDir, 'playlist.m3u8')

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOption([
        '-codec: copy',
        '-start_number 0',
        '-hls_time 10',
        '-hls_list_size 0',
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
        })
      })
      .on('error', (err) => {
        reject(err)
      })
      .run()
  })
}
