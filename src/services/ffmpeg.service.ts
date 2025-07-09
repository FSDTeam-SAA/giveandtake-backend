import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import crypto from 'crypto'

const execAsync = promisify(exec)

export const encryptAndConvertToHLS = async (
  inputPath: string,
  userId: string
) => {
  const outputDir = path.join(
    __dirname,
    '../../uploads/recruiter-videos',
    userId
  )
  const keyFilePath = path.join(outputDir, 'key.key')
  const keyInfoPath = path.join(outputDir, 'key_info.txt')

  fs.mkdirSync(outputDir, { recursive: true })

  // Generate AES key
  const aesKey = crypto.randomBytes(16)
  fs.writeFileSync(keyFilePath, aesKey)

  // Create key_info file
  const keyUri = 'key.key'
  fs.writeFileSync(keyInfoPath, `${keyUri}\n${keyFilePath}\n${keyFilePath}`)

  const command = `ffmpeg -i "${inputPath}" -hls_time 10 -hls_key_info_file "${keyInfoPath}" -hls_playlist_type vod -hls_segment_filename "${outputDir}/index%d.ts" "${outputDir}/master.m3u8"`

  await execAsync(command)

  return {
    m3u8Path: `${outputDir}/master.m3u8`,
    keyPath: keyFilePath,
    basePath: outputDir,
  }
}
