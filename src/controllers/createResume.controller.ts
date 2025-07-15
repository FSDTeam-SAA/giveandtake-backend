import path from 'path'
import { getVideoMetadata } from '../services/ffmpeg.service'
import { CreateResume } from '../models/createResume.model'
import catchAsync from '../utils/catchAsync'

export const createResume = catchAsync(async (req, res) => {
  const { userId, type, firstName, lastName } = req.body

  let videoPath = ''
  let videoMetadata = null

  if (req.files?.videoFile  && Array.isArray(req.files.videoFile)) {
    videoPath = (req.files.videoFile[0] as Express.Multer.File).path

    // Get video info using FFmpeg
    videoMetadata = await getVideoMetadata(videoPath)
  }

  console.log("videoMetadata", videoMetadata)

  const photoPath = req.files?.photo?.[0]?.path

  const newResume = await CreateResume.create({
    userId,
    type,
    firstName,
    lastName,
    videoFile: videoPath,
    photo: photoPath,
    // You can store video duration/format if needed
  })

  res.status(201).json({
    success: true,
    message: 'Resume created successfully',
    data: {
      resume: newResume,
      videoInfo: videoMetadata,
    },
  })
})
