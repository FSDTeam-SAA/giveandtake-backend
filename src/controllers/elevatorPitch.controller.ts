import path from 'path'
import fs from 'fs'
import { Request, Response, NextFunction } from 'express'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import { AppliedJob } from '../models/appliedJob.model'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import httpStatus from 'http-status'
import { getVideoMetadata, processVideoHLS } from '../services/ffmpeg.service'
import { Job } from '../models/job.model'

export const createResume = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.query

  // 1. Validate Input
  if (!userId || typeof userId !== 'string') {
    throw new AppError('User ID is required', httpStatus.BAD_REQUEST)
  }

  if (!req.files?.videoFile || !Array.isArray(req.files.videoFile)) {
    throw new AppError('No video file uploaded', httpStatus.BAD_REQUEST)
  }

  const videoFile = req.files.videoFile[0]
  const tempPath = videoFile.path

  // 2. Validate file exists
  if (!fs.existsSync(tempPath)) {
    throw new AppError('Uploaded file not found', httpStatus.NOT_FOUND)
  }

  // 3. Check if user already has a pitch
  const existingPitch = await ElevatorPitch.findOne({ userId })
  if (existingPitch) {
    fs.unlinkSync(tempPath)
    throw new AppError(
      'You already have an elevator pitch',
      httpStatus.BAD_REQUEST
    )
  }

  // 4. Get Video Metadata
  const metadata = await getVideoMetadata(tempPath)

  // 5. Check video duration
  if (metadata.duration > 30) {
    const hasActivePlan = await paymentInfo.findOne({
      userId,
      paymentStatus: 'complete',
    })
    if (!hasActivePlan) {
      fs.unlinkSync(tempPath)
      throw new AppError(
        'Video duration exceeds 30 seconds. Please purchase a plan.',
        httpStatus.PAYMENT_REQUIRED
      )
    }
  }

  // 6. Create user storage directory
  const userDir = path.join(__dirname, '../../storage/users', userId)
  fs.mkdirSync(userDir, { recursive: true })

  // 7. Generate secure filenames
  const originalFilename = `video_${Date.now()}${path.extname(
    videoFile.originalname
  )}`
  const originalPath = path.join(userDir, originalFilename)
  const hlsDir = path.join(userDir, 'hls')
  fs.mkdirSync(hlsDir, { recursive: true })

  // 8. Move original file to permanent storage
  fs.renameSync(tempPath, originalPath)

  // 9. Process video to HLS with encryption
  const { playlistPath, keyPath } = await processVideoHLS(originalPath, hlsDir, userId)

  // 10. Generate accessible URLs
  const baseUrl = `${req.protocol}://${req.get('host')}`
  const hlsUrl = `${baseUrl}/stream/${userId}/playlist.m3u8`
  const keyUrl = `${baseUrl}/key/${userId}/encryption.key`

  // 11. Save to database
  const newPitch = await ElevatorPitch.create({
    userId,
    video: {
      url: `${baseUrl}/videos/${userId}/${originalFilename}`,
      hlsUrl,
      encryptionKeyUrl: keyUrl,
      localPaths: {
        original: originalPath,
        hls: playlistPath,
        key: keyPath,
      },
    },
  })

  // 12. Send response
  res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Elevator pitch created successfully',
    data: {
      id: newPitch._id,
      hlsUrl: `/api/stream/${newPitch._id}`,
    },
  })
})

export const deleteResume = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.query

  const pitch = await ElevatorPitch.findOne({ userId })
  if (!pitch) {
    throw new AppError(httpStatus.NOT_FOUND, 'Elevator pitch not found')
  }

  // Clean up local files
  if (pitch.video.localPaths) {
    const { original, hls, key } = pitch.video.localPaths
    if (fs.existsSync(original)) fs.unlinkSync(original)
    if (fs.existsSync(hls)) fs.unlinkSync(hls)
    if (fs.existsSync(key)) fs.unlinkSync(key)
    const hlsDir = path.dirname(hls)
    if (fs.existsSync(hlsDir))
      fs.rmSync(hlsDir, { recursive: true, force: true })
  }

  await ElevatorPitch.deleteOne({ _id: pitch._id })

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Elevator pitch deleted successfully',
  })
})

// Middleware to check access
export const checkVideoAccess = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params // ElevatorPitch ID
    const userId = req.user?.id // From auth middleware

    const pitch = await ElevatorPitch.findById(id)
    if (!pitch) {
      throw new AppError(httpStatus.NOT_FOUND, 'Elevator pitch not found')
    }

    // Check if the user is the owner
    if (pitch.userId.toString() === userId) {
      return next()
    }

    // Check if the user is an applicant for a job where this pitch was submitted
    const appliedJob = await AppliedJob.findOne({
      userId: pitch.userId, // The pitch owner applied for a job
    })

    if (!appliedJob) {
      throw new AppError( httpStatus.FORBIDDEN,'Access denied')
    }

    // Check if the requesting user is the job poster
    const job = await Job.findById(appliedJob.jobId)
    if (job && job.userId.toString() === userId) {
      console.log("first")
      return next()
    }

    throw new AppError(httpStatus.FORBIDDEN, 'Access denied')
  }
)

// export const streamElevatorPitch = catchAsync(
//   async (req: Request, res: Response) => {
//     const { id } = req.params

//     const pitch = await ElevatorPitch.findById(id)
//     if (!pitch || !pitch.video?.hlsUrl || !pitch.video.localPaths?.hls) {
//       throw new AppError(httpStatus.NOT_FOUND, 'Elevator pitch not found')
//     }

//     const playlistPath = pitch.video.localPaths.hls
//     if (!fs.existsSync(playlistPath)) {
//       throw new AppError(httpStatus.NOT_FOUND, 'HLS playlist not found')
//     }

//     res.set({
//       'Content-Type': 'application/vnd.apple.mpegurl',
//       'Cache-Control': 'no-cache',
//     })

//     const playlistContent = fs.readFileSync(playlistPath, 'utf-8')
//     res.send(playlistContent)
//   }
// )


export const streamElevatorPitch = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params

    const pitch = await ElevatorPitch.findById(id)
    if (!pitch || !pitch.video?.hlsUrl || !pitch.video.localPaths?.hls) {
      throw new AppError(httpStatus.NOT_FOUND, 'Elevator pitch not found')
    }

    const playlistPath = pitch.video.localPaths.hls
    const userId = pitch.userId.toString()

    if (!fs.existsSync(playlistPath)) {
      throw new AppError(httpStatus.NOT_FOUND, 'HLS playlist not found')
    }

    let playlistContent = fs.readFileSync(playlistPath, 'utf-8')

    // ✅ Rewrite all .ts segment lines to point to secure endpoint
    playlistContent = playlistContent
      .split('\n')
      .map((line) => {
        if (line.trim().endsWith('.ts')) {
          return `/api/v1/elevator-pitch/stream/${userId}/${line.trim()}`
        }
        return line
      })
      .join('\n')

    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
    })

    res.send(playlistContent)
  }
)

export const secureStream = catchAsync(async (req: Request, res: Response) => {
  const { userId, segment } = req.params
  const hlsDir = path.join(__dirname, '../../storage/users', userId, 'hls')
  const segmentPath = path.join(hlsDir, segment)

  if (!fs.existsSync(segmentPath)) {
    throw new AppError(httpStatus.NOT_FOUND, 'Segment not found')
  }

  res.set({
    'Content-Type': 'video/mp2t',
    'Cache-Control': 'no-cache',
  })

  const stream = fs.createReadStream(segmentPath)
  stream.pipe(res)
})

export const getEncryptionKey = catchAsync(
  async (req: Request, res: Response) => {
    const { userId, key } = req.params
    const keyPath = path.join(
      __dirname,
      '../../storage/users',
      userId,
      'hls',
      key
    )

    if (!fs.existsSync(keyPath)) {
      throw new AppError(httpStatus.NOT_FOUND, 'Encryption key not found')
    }

    res.set({
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store',
    })

    const keyContent = fs.readFileSync(keyPath)
    res.send(keyContent)
  }
)

// import path from 'path'
// import fs from 'fs'
// import { Request, response, Response } from 'express'
// import { ElevatorPitch } from '../models/elevatorPitch.model'
// // import { getVideoMetadata } from '../services/ffmpeg.service'
// import catchAsync from '../utils/catchAsync'
// import {
//   uploadToCloudinary,
//   uploadHLS,
//   deleteFromCloudinary,
// } from '../utils/cloudinary'

// import { paymentInfo } from '../models/paymentInfo.model'
// import AppError from '../errors/AppError'
// import axios from 'axios'
// import sendResponse from '../utils/sendResponse'
// import httpStatus from 'http-status'
// import { getVideoMetadata, processVideoHLS } from '../services/ffmpeg.service'
// import { v2 as cloudinary } from 'cloudinary'

// cloudinary.config({
//   cloud_name: 'ddtuyxcsl',
//   api_key: '155594432527689',
//   api_secret: 'fw86uLN2JW_S9tYxb69R48Fym2k',
// })

// /*************************
//  * CREATE ELEVATOR PITCH *
//  *************************/
// // export const createResume = catchAsync(async (req: Request, res: Response) => {
// //   const { userId } = req.query

// //   // 1. Validate Input
// //   if (!userId || typeof userId !== 'string') {
// //     throw new Error('User ID is required')
// //   }

// //   if (!req.files?.videoFile || !Array.isArray(req.files.videoFile)) {
// //     throw new Error('No video file uploaded')
// //   }

// //   const videoFile = req.files.videoFile[0] as Express.Multer.File
// //   const localPath = videoFile.path

// //   if (!fs.existsSync(localPath)) {
// //     throw new Error('Uploaded file does not exist on server')
// //   }

// //   // 2. Get Video Metadata
// //   const metadata = await getVideoMetadata(localPath)

// //   // 3. Check if user already has a pitch
// //   const existingPitch = await ElevatorPitch.findOne({ userId })
// //   if (existingPitch) {
// //     fs.unlinkSync(localPath)
// //     throw new Error('You already have an elevator pitch.')
// //   }

// //   // 4. Check video duration
// //   if (metadata.duration > 30) {
// //     const hasActivePlan = await paymentInfo.findOne({
// //       userId,
// //       paymentStatus: 'complete',
// //     })

// //     if (!hasActivePlan) {
// //       fs.unlinkSync(localPath)
// //       throw new Error(
// //         'Video duration exceeds 30 seconds. Please purchase a plan.'
// //       )
// //     }
// //   }

// //   // 5. Create Temp Folder
// //   const tempFolder = path.join(__dirname, '../../temp', userId)
// //   fs.mkdirSync(tempFolder, { recursive: true })

// //   // 6. Convert to HLS with Encryption
// //   const { playlistPath, keyPath } = await processVideoHLS(localPath, tempFolder)

// //   let originalUpload, hlsUpload, keyUpload

// //   try {
// //     // // Upload original video file
// //     // originalUpload = await uploadToCloudinary(
// //     //   localPath,
// //     //   `elevator_pitches/${userId}/original`
// //     // )

// //     // Upload HLS playlist
// //     hlsUpload = await uploadHLS(tempFolder, `elevator_pitches/${userId}/hls`)

// //     // Upload the AES encryption key (.key file) as raw
// //     keyUpload = await cloudinary.uploader.upload(keyPath, {
// //       resource_type: 'raw',
// //       folder: `elevator_pitches/${userId}/keys`,
// //       type: 'authenticated',
// //     })
// //   } catch (uploadErr: any) {
// //     // Clean up if anything fails
// //     if (fs.existsSync(tempFolder)) {
// //       fs.rmSync(tempFolder, { recursive: true, force: true })
// //     }
// //     if (fs.existsSync(localPath)) {
// //       fs.unlinkSync(localPath)
// //     }
// //     throw new Error(`Upload failed: ${uploadErr.message || uploadErr}`)
// //   }

// //   // 8. Clean up temp files
// //   if (fs.existsSync(tempFolder)) {
// //     fs.rmSync(tempFolder, { recursive: true, force: true })
// //   }
// //   if (fs.existsSync(localPath)) {
// //     fs.unlinkSync(localPath)
// //   }

// //   // 9. Save to DB
// //   const newPitch = await ElevatorPitch.create({
// //     userId,
// //     video: {
// //       // url: originalUpload.secure_url,
// //       // publicId: originalUpload.public_id,
// //       hlsUrl: hlsUpload.playlistUrl,
// //       encryptionKeyUrl: keyUpload.secure_url,
// //     },
// //   })

// //   res.status(201).json({
// //     success: true,
// //     message: 'Elevator pitch created successfully',
// //     data: {
// //       id: newPitch._id,
// //       hlsUrl: `/api/stream/${newPitch._id}`,
// //     },
// //   })
// // })

// export const createResume = catchAsync(async (req: Request, res: Response) => {
//   const { userId } = req.query

//   // 1. Validate Input
//   if (!userId || typeof userId !== 'string') {
//     throw new Error('User ID is required')
//   }

//   if (!req.files?.videoFile || !Array.isArray(req.files.videoFile)) {
//     throw new Error('No video file uploaded')
//   }

//   const videoFile = req.files.videoFile[0]
//   const tempPath = videoFile.path

//   // 2. Validate file exists
//   if (!fs.existsSync(tempPath)) {
//     throw new Error('Uploaded file not found')
//   }

//   // 3. Create user's storage directory
//   const userDir = path.join(__dirname, '../../storage/users', userId)
//   fs.mkdirSync(userDir, { recursive: true })

//   // 4. Generate secure filenames
//   const originalFilename = `video_${Date.now()}${path.extname(
//     videoFile.originalname
//   )}`
//   const originalPath = path.join(userDir, originalFilename)

//   // 5. Move file from temp to permanent storage
//   fs.renameSync(tempPath, originalPath)

//   // 6. Generate accessible URLs
//   const baseUrl = `${req.protocol}://${req.get('host')}/storage/users/${userId}`

//   // 7. Save to database
//   const newPitch = await ElevatorPitch.create({
//     userId,
//     video: {
//       url: `${baseUrl}/${originalFilename}`,
//       localPath: originalPath, // Store server path for internal use
//     },
//   })

//   res.status(201).json({
//     success: true,
//     message: 'Video saved successfully',
//     data: {
//       id: newPitch._id,
//       videoUrl: `${baseUrl}/${originalFilename}`,
//     },
//   })
// })

// /*************************
//  * UPDATE ELEVATOR PITCH *
//  *************************/

// /*************************
//  * DELETE ELEVATOR PITCH *
//  *************************/
// export const deleteResume = catchAsync(async (req, res) => {
//   const { userId } = req.query

//   const pitch = await ElevatorPitch.findOne({ userId })
//   if (!pitch) throw new Error('Elevator pitch not found')

//   if (pitch.video?.publicId) {
//     await deleteFromCloudinary(pitch.video.publicId)
//   }

//   await ElevatorPitch.deleteOne({ _id: pitch._id })

//   res.status(200).json({
//     success: true,
//     message: 'Elevator pitch deleted successfully',
//   })
// })

// /**************************************
//  * STREAM ELEVATOR PITCH VIDEO BY ID *
//  **************************************/
// export const streamElevatorPitch = catchAsync(
//   async (req: Request, res: Response) => {
//     const { id } = req.params

//     const pitch = await ElevatorPitch.findById(id)
//     if (!pitch || !pitch.video?.url) {
//       res.status(404).json({
//         success: false,
//         message: 'Elevator pitch not found',
//       })
//       return
//     }

//     // Cloudinary streaming (preferred via frontend player)
//     res.redirect(pitch.video.url)
//   }
// )

// /********************
//  * SECURE STREAMING *
//  ********************/
// export const secureStream = catchAsync(async (req: Request, res: Response) => {
//   const { id } = req.params
//   const userId = req.user?.id // Assuming you have authentication middleware

//   // 1. Verify user has access to this video
//   const pitch = await ElevatorPitch.findOne({
//     _id: id,
//     userId, // Ensure the video belongs to the requesting user
//   })

//   if (!pitch || !pitch.video?.url) {
//     return res.status(404).json({
//       success: false,
//       message: 'Elevator pitch not found or access denied',
//     })
//   }

//   // 2. Get the HLS playlist
//   const playlistUrl = pitch.video.url

//   try {
//     // 3. Proxy the request to Cloudinary
//     const response = await axios.get(playlistUrl, {
//       responseType: 'stream',
//     })

//     // 4. Set appropriate headers
//     res.set({
//       'Content-Type': 'application/vnd.apple.mpegurl',
//       'Cache-Control': 'no-cache',
//     })

//     // 5. Pipe the response to the client
//     response.data.pipe(res)
//   } catch (error) {
//     console.error('Error proxying HLS stream:', error)
//     res.status(500).json({
//       success: false,
//       message: 'Error streaming video',
//     })
//   }
// })

// /*********************
//  * GET ENCRIPTED KEY *
//  *********************/
// export const getEncryptionKey = catchAsync(
//   async (req: Request, res: Response) => {
//     const { id } = req.params
//     const userId = req.user?.id

//     // Verify access
//     const pitch = await ElevatorPitch.findOne({
//       _id: id,
//       userId,
//     })

//     if (!pitch || !pitch.encryptionKeyUrl) {
//       return res.status(404).json({
//         success: false,
//         message: 'Access denied or key not found',
//       })
//     }

//     // Proxy the key request
//     try {
//       const response = await axios.get(pitch.encryptionKeyUrl, {
//         responseType: 'arraybuffer',
//       })

//       res.set({
//         'Content-Type': 'application/octet-stream',
//         'Cache-Control': 'no-store',
//       })

//       res.send(response.data)
//     } catch (error) {
//       console.error('Error fetching encryption key:', error)
//       res.status(500).json({
//         success: false,
//         message: 'Error retrieving encryption key',
//       })
//     }
//   }
// )
