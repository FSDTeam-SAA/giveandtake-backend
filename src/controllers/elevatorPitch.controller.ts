import path from 'path'
import { getVideoMetadata } from '../services/ffmpeg.service'
import catchAsync from '../utils/catchAsync'
import { ElevatorPitch } from '../models/elevatorPitch.model'

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
