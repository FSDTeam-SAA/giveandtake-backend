import path from 'path'
import fs from 'fs'
import { Request, Response } from 'express'

export const streamM3U8 = (req: Request, res: Response) => {
  const { userId } = req.params
  const filePath = path.join(
    __dirname,
    `../../uploads/recruiter-videos/${userId}/master.m3u8`
  )
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found')

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
  fs.createReadStream(filePath).pipe(res)
}

export const streamKey = (req: Request, res: Response) => {
  const { userId } = req.params

  // Protect this: validate user or role
  if (!req.user || req.user._id !== userId) {
    return res.status(403).send('Unauthorized')
  }

  const keyPath = path.join(
    __dirname,
    `../../uploads/recruiter-videos/${userId}/key.key`
  )
  if (!fs.existsSync(keyPath)) return res.status(404).send('Key not found')

  res.setHeader('Content-Type', 'application/octet-stream')
  fs.createReadStream(keyPath).pipe(res)
}
