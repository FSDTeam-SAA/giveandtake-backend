import path from 'path'
import fs from 'fs'
import { Request, response, Response } from 'express'
import { ElevatorPitch } from '../models/elevatorPitch.model'
// import { getVideoMetadata } from '../services/ffmpeg.service'
import catchAsync from '../utils/catchAsync'
import {
  uploadToCloudinary,
  uploadHLS,
  deleteFromCloudinary,
} from '../utils/cloudinary'

import { paymentInfo } from '../models/paymentInfo.model'
import AppError from '../errors/AppError'
import axios from 'axios'
import sendResponse from '../utils/sendResponse'
import httpStatus from 'http-status'
import { getVideoMetadata, processVideoHLS } from '../services/ffmpeg.service'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: 'ddtuyxcsl',
  api_key: '155594432527689',
  api_secret: 'fw86uLN2JW_S9tYxb69R48Fym2k',
})

/*************************
 * CREATE ELEVATOR PITCH *
 *************************/
// export const createResume = catchAsync(async (req: Request, res: Response) => {
//   const { userId } = req.query

//   // 1. Validate Input
//   if (!userId || typeof userId !== 'string') {
//     throw new Error('User ID is required')
//   }

//   if (!req.files?.videoFile || !Array.isArray(req.files.videoFile)) {
//     throw new Error('No video file uploaded')
//   }

//   const videoFile = req.files.videoFile[0] as Express.Multer.File
//   const localPath = videoFile.path

//   if (!fs.existsSync(localPath)) {
//     throw new Error('Uploaded file does not exist on server')
//   }

//   // 2. Get Video Metadata
//   const metadata = await getVideoMetadata(localPath)

//   // 3. Check if user already has a pitch
//   const existingPitch = await ElevatorPitch.findOne({ userId })
//   if (existingPitch) {
//     fs.unlinkSync(localPath)
//     throw new Error('You already have an elevator pitch.')
//   }

//   // 4. Check video duration
//   if (metadata.duration > 30) {
//     const hasActivePlan = await paymentInfo.findOne({
//       userId,
//       paymentStatus: 'complete',
//     })

//     if (!hasActivePlan) {
//       fs.unlinkSync(localPath)
//       throw new Error(
//         'Video duration exceeds 30 seconds. Please purchase a plan.'
//       )
//     }
//   }

//   // 5. Create Temp Folder
//   const tempFolder = path.join(__dirname, '../../temp', userId)
//   fs.mkdirSync(tempFolder, { recursive: true })

//   // 6. Convert to HLS with Encryption
//   const { playlistPath, keyPath } = await processVideoHLS(localPath, tempFolder)

//   let originalUpload, hlsUpload, keyUpload

//   try {
//     // // Upload original video file
//     // originalUpload = await uploadToCloudinary(
//     //   localPath,
//     //   `elevator_pitches/${userId}/original`
//     // )

//     // Upload HLS playlist
//     hlsUpload = await uploadHLS(tempFolder, `elevator_pitches/${userId}/hls`)

//     // Upload the AES encryption key (.key file) as raw
//     keyUpload = await cloudinary.uploader.upload(keyPath, {
//       resource_type: 'raw',
//       folder: `elevator_pitches/${userId}/keys`,
//       type: 'authenticated',
//     })
//   } catch (uploadErr: any) {
//     // Clean up if anything fails
//     if (fs.existsSync(tempFolder)) {
//       fs.rmSync(tempFolder, { recursive: true, force: true })
//     }
//     if (fs.existsSync(localPath)) {
//       fs.unlinkSync(localPath)
//     }
//     throw new Error(`Upload failed: ${uploadErr.message || uploadErr}`)
//   }

//   // 8. Clean up temp files
//   if (fs.existsSync(tempFolder)) {
//     fs.rmSync(tempFolder, { recursive: true, force: true })
//   }
//   if (fs.existsSync(localPath)) {
//     fs.unlinkSync(localPath)
//   }

//   // 9. Save to DB
//   const newPitch = await ElevatorPitch.create({
//     userId,
//     video: {
//       // url: originalUpload.secure_url,
//       // publicId: originalUpload.public_id,
//       hlsUrl: hlsUpload.playlistUrl,
//       encryptionKeyUrl: keyUpload.secure_url,
//     },
//   })

//   res.status(201).json({
//     success: true,
//     message: 'Elevator pitch created successfully',
//     data: {
//       id: newPitch._id,
//       hlsUrl: `/api/stream/${newPitch._id}`,
//     },
//   })
// })

export const createResume = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.query

  // 1. Validate Input
  if (!userId || typeof userId !== 'string') {
    throw new Error('User ID is required')
  }

  if (!req.files?.videoFile || !Array.isArray(req.files.videoFile)) {
    throw new Error('No video file uploaded')
  }

  const videoFile = req.files.videoFile[0] as Express.Multer.File
  const localPath = videoFile.path

  if (!fs.existsSync(localPath)) {
    throw new Error('Uploaded file does not exist on server')
  }

  // 2. Get Video Metadata
  const metadata = await getVideoMetadata(localPath)

  // 3. Check if user already has a pitch
  const existingPitch = await ElevatorPitch.findOne({ userId })
  if (existingPitch) {
    fs.unlinkSync(localPath)
    throw new Error('You already have an elevator pitch.')
  }

  // 4. Check video duration
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

  // 5. Create Permanent Storage Folder
  const storageFolder = path.join(__dirname, '../../storage', userId)
  fs.mkdirSync(storageFolder, { recursive: true })

  // 6. Convert to HLS with Encryption
  const { playlistPath, keyPath } = await processVideoHLS(
    localPath,
    storageFolder
  )

  // 7. Move original video to storage
  const originalFileName = `original-${Date.now()}${path.extname(localPath)}`
  const originalStoragePath = path.join(storageFolder, originalFileName)
  fs.renameSync(localPath, originalStoragePath)

  // 8. Prepare URLs for database
  const baseUrl = `${req.protocol}://${req.get('host')}/storage/${userId}`

  // 9. Save to DB
  const newPitch = await ElevatorPitch.create({
    userId,
    video: {
      url: `${baseUrl}/${originalFileName}`,
      hlsUrl: `${baseUrl}/playlist.m3u8`,
      encryptionKeyUrl: `${baseUrl}/encryption.key`,
      // Store local paths as well if needed for server-side processing
      localPaths: {
        original: originalStoragePath,
        hls: playlistPath,
        key: keyPath,
      },
    },
  })

  // 10. Respond with success
  res.status(201).json({
    success: true,
    message: 'Elevator pitch created successfully',
    data: {
      id: newPitch._id,
      hlsUrl: `/api/stream/${newPitch._id}`,
      originalUrl: `${baseUrl}/${originalFileName}`,
    },
  })
})














/*************************
 * UPDATE ELEVATOR PITCH *
 *************************/

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

/********************
 * SECURE STREAMING *
 ********************/
export const secureStream = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params
  const userId = req.user?.id // Assuming you have authentication middleware

  // 1. Verify user has access to this video
  const pitch = await ElevatorPitch.findOne({
    _id: id,
    userId, // Ensure the video belongs to the requesting user
  })

  if (!pitch || !pitch.video?.url) {
    return res.status(404).json({
      success: false,
      message: 'Elevator pitch not found or access denied',
    })
  }

  // 2. Get the HLS playlist
  const playlistUrl = pitch.video.url

  try {
    // 3. Proxy the request to Cloudinary
    const response = await axios.get(playlistUrl, {
      responseType: 'stream',
    })

    // 4. Set appropriate headers
    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
    })

    // 5. Pipe the response to the client
    response.data.pipe(res)
  } catch (error) {
    console.error('Error proxying HLS stream:', error)
    res.status(500).json({
      success: false,
      message: 'Error streaming video',
    })
  }
})

/*********************
 * GET ENCRIPTED KEY *
 *********************/
export const getEncryptionKey = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params
    const userId = req.user?.id

    // Verify access
    const pitch = await ElevatorPitch.findOne({
      _id: id,
      userId,
    })

    if (!pitch || !pitch.encryptionKeyUrl) {
      return res.status(404).json({
        success: false,
        message: 'Access denied or key not found',
      })
    }

    // Proxy the key request
    try {
      const response = await axios.get(pitch.encryptionKeyUrl, {
        responseType: 'arraybuffer',
      })

      res.set({
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store',
      })

      res.send(response.data)
    } catch (error) {
      console.error('Error fetching encryption key:', error)
      res.status(500).json({
        success: false,
        message: 'Error retrieving encryption key',
      })
    }
  }
)
