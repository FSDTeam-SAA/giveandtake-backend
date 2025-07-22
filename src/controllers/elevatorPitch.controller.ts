import path from 'path'
import fs from 'fs'
import { Request, Response } from 'express'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import { getVideoMetadata } from '../services/ffmpeg.service'
import catchAsync from '../utils/catchAsync'
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary'
import { paymentInfo } from '../models/paymentInfo.model'


/*************************
 * CREATE ELEVATOR PITCH *
 *************************/ 
export const createResume = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.query

  if (!userId || typeof userId !== 'string') {
    throw new Error('User ID is required')
  }

  if (!req.files?.videoFile || !Array.isArray(req.files.videoFile)) {
    throw new Error('No video file uploaded')
  }

  const localPath = (req.files.videoFile[0] as Express.Multer.File).path
  const metadata = await getVideoMetadata(localPath)

  // Check for existing pitch
  const existingPitch = await ElevatorPitch.findOne({ userId })
  if (existingPitch) {
    fs.unlinkSync(localPath)
    throw new Error('You already have an elevator pitch.')
  }

  // Check video duration and plan
  if (metadata.duration > 30) {
    const hasActivePlan = await paymentInfo.findOne({
      userId,
      paymentStatus: 'complete',
    })

    if (!hasActivePlan) {
      fs.unlinkSync(localPath)
      throw new Error(
        'Video duration exceeds 30 seconds. Please purchase a plan.'
      )
    }
  }

  // Upload to Cloudinary
  const cloudinaryResult = await uploadToCloudinary(localPath)
  if (!cloudinaryResult) {
    fs.unlinkSync(localPath)
    throw new Error('Failed to upload to Cloudinary')
  }

  const newPitch = await ElevatorPitch.create({
    userId,
    video: {
      url: cloudinaryResult.secure_url,
      publicId: cloudinaryResult.public_id,
    },
  })

  res.status(201).json({
    success: true,
    message: 'Elevator pitch created successfully',
    data: newPitch,
  })
})


/*************************
 * UPDATE ELEVATOR PITCH *
 *************************/
export const updateResume = catchAsync(async (req, res) => {
  const { userId } = req.query

  if (!req.files?.videoFile || !Array.isArray(req.files.videoFile)) {
    throw new Error('No video file uploaded')
  }

  const localPath = (req.files.videoFile[0] as Express.Multer.File).path
  const metadata = await getVideoMetadata(localPath)

  if (metadata.duration > 30) {
    fs.unlinkSync(localPath)
    throw new Error('Video duration exceeds 30 seconds')
  }

  const existingPitch = await ElevatorPitch.findOne({ userId })
  if (!existingPitch) {
    fs.unlinkSync(localPath)
    throw new Error('No elevator pitch to update')
  }

  if (existingPitch.video?.publicId) {
    await deleteFromCloudinary(existingPitch.video.publicId)
  }

  const cloudinaryResult = await uploadToCloudinary(localPath)
  if (!cloudinaryResult) throw new Error('Failed to upload to Cloudinary')

  existingPitch.video = {
    url: cloudinaryResult.secure_url,
    publicId: cloudinaryResult.public_id,
  }

  await existingPitch.save()

  res.status(200).json({
    success: true,
    message: 'Elevator pitch updated successfully',
    data: existingPitch,
  })
})

/*************************
 * DELETE ELEVATOR PITCH *
 *************************/
export const deleteResume = catchAsync(async (req, res) => {
  const { userId } = req.query

  const pitch = await ElevatorPitch.findOne({ userId })
  if (!pitch) throw new Error('Elevator pitch not found')

  if (pitch.video?.publicId) {
    await deleteFromCloudinary(pitch.video.publicId)
  }

  await ElevatorPitch.deleteOne({ _id: pitch._id })

  res.status(200).json({
    success: true,
    message: 'Elevator pitch deleted successfully',
  })
})

/**************************************
 * STREAM ELEVATOR PITCH VIDEO BY ID *
 **************************************/
export const streamElevatorPitch = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params

    const pitch = await ElevatorPitch.findById(id)
    if (!pitch || !pitch.video?.url) {
       res.status(404).json({
        success: false,
        message: 'Elevator pitch not found',
      })
      return
    }

    // Cloudinary streaming (preferred via frontend player)
    res.redirect(pitch.video.url)
  }
)
