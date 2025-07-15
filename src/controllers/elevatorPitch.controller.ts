import path from 'path'
import { getVideoMetadata } from '../services/ffmpeg.service'
import catchAsync from '../utils/catchAsync'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import fs from 'fs'
import { Request, Response } from 'express'


/*************************
 * CREATE ELEVATOR PITCH *
 *************************/
export const createResume = catchAsync(async (req, res) => {
  const { userId } = req.query

  let videoPath = ''
  let videoMetadata = null

  if (req.files?.videoFile && Array.isArray(req.files.videoFile)) {
    videoPath = (req.files.videoFile[0] as Express.Multer.File).path

    // Get video info using FFmpeg
    videoMetadata = await getVideoMetadata(videoPath)
  }

  console.log('videoMetadata', videoMetadata)

  // check if duration exceeds 30 s
  if (videoMetadata && videoMetadata.duration > 30) {
    throw new Error('Video duration exceeds 30 seconds. Purchases a plan.')
  }

  const elevatorPitch = await ElevatorPitch.create({
    userId,
    video: videoPath,
  })

  res.status(201).json({
    success: true,
    message: 'Resume created successfully',
    data: {
      videoInfo: elevatorPitch,
    },
  })
})



/**************************************
 * STREAM ELEVATOR PITCH VIDEO BY ID *
 **************************************/
// export const streamElevatorPitch = catchAsync(async (req: Request, res: Response) => {
//   const { id } = req.params

//   const pitch = await ElevatorPitch.findById(id)
//   if (!pitch || !pitch.video) {
//     res.status(404).json({
//       success: false,
//       message: 'Elevator pitch not found',
//     })
//   }

//   const videoPath = path.resolve(pitch.video)
//   const stat = fs.statSync(videoPath)
//   const fileSize = stat.size
//   const range = req.params.range

//   if (!range) {
//     res.status(416).send('Requires Range header')
//     return
//   }

//   const parts = range.replace(/bytes=/, '').split('-')
//   const start = parseInt(parts[0], 10)
//   const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

//   const chunkSize = end - start + 1
//   const file = fs.createReadStream(videoPath, { start, end })

//   res.writeHead(206, {
//     'Content-Range': `bytes ${start}-${end}/${fileSize}`,
//     'Accept-Ranges': 'bytes',
//     'Content-Length': chunkSize,
//     'Content-Type': 'video/mp4',
//   })

//   file.pipe(res)
// })


export const streamElevatorPitch = async (req: Request, res: Response) => {
  const { id } = req.params

  const pitch = await ElevatorPitch.findById(id)
  if (!pitch || !pitch.video) {
    return res.status(404).json({
      success: false,
      message: 'Elevator pitch not found',
    })
  }

  const videoPath = path.resolve(pitch.video)

  // Check if file exists
  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({
      success: false,
      message: 'Video file not found',
    })
  }

  const stat = fs.statSync(videoPath)
  const fileSize = stat.size
  const range = req.headers.range

  if (!range) {
    // No range header: send the full video (not recommended for large videos)
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    })
    fs.createReadStream(videoPath).pipe(res)
    return
  }

  // Range header exists
  const parts = range.replace(/bytes=/, '').split('-')
  const start = parseInt(parts[0], 10)
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

  if (start >= fileSize) {
    res.status(416).send('Requested range not satisfiable')
    return
  }

  const chunkSize = end - start + 1
  const file = fs.createReadStream(videoPath, { start, end })

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': 'video/mp4',
  })

  file.pipe(res)
}