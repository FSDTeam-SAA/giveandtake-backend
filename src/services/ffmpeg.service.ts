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
