import { Request, Response } from 'express'
import mongoose from 'mongoose'
import { Resume } from '../models/resume.model'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import httpStatus from 'http-status'
import sendResponse from '../utils/sendResponse'
import path from 'path'
import { getSignedS3Url, uploadFileToS3 } from '../services/s3.service'

const bucketName = process.env.R2_BUCKET_NAME || process.env.AWS_BUCKET_NAME || ''

const extractR2Key = (url: string): string | null => {
  if (!url) return null
  try {
    const parsed = new URL(url)
    let key = parsed.pathname.replace(/^\/+/, '')
    if (bucketName && key.startsWith(`${bucketName}/`)) {
      key = key.slice(bucketName.length + 1)
    }
    return key || null
  } catch {
    return null
  }
}

/***********************
 * CREATE RESUME ENTRY *
 ***********************/
export const createResume = catchAsync(async (req: Request, res: Response) => {
  const { visaSponsorship } = req.body
  const userId = req.user?._id

  if (!req.files || !(req.files instanceof Array) || req.files.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No resume files uploaded')
  }

  // const fileData = req.files.map((file: any) => ({
  //   filename: file.originalname,
  //   url: `${process.env.SERVER_URL}/uploads/resumes/${file.filename}`,
  //   uploadedAt: new Date(),
  // }))
  const fileData = await Promise.all(
    req.files.map(async (file: any) => {
      const localPath = path.resolve('uploads', file.filename)

      const { key, fileUrl } = await uploadFileToS3(localPath, 'uploads')

      return {
        filename: file.originalname,
        url: fileUrl,
        key,
        uploadedAt: new Date(),
      }
    })
  )

  console.log(fileData)

 await Resume.deleteMany({userId})

  const resume = await Resume.create({
    userId,
    visaSponsorship,
    file: fileData,
  })

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Resume uploaded successfully',
    data: resume,
  })
})

/****************************
 * GET RESUME(S) BY USER ID *
 ****************************/
export const getResumeByUserId = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user?._id

    const resumes = await Resume.find({ userId })

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Resumes fetched successfully',
      data: resumes,
    })
  }
)


export const getResumeByUserId1 = catchAsync(
  async (req: Request, res: Response) => {
    const {userId} = req.params

    const resumes = await Resume.find({ userId })

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Resumes fetched successfully',
      data: resumes,
    })
  }
)

export const getResumeDownloadUrl = catchAsync(
  async (req: Request, res: Response) => {
    const { resumeId } = req.params
    const fileId =
      typeof req.query.fileId === 'string' ? req.query.fileId : undefined

    if (!mongoose.Types.ObjectId.isValid(resumeId)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid resume ID')
    }

    const resume = await Resume.findById(resumeId)
    if (!resume) {
      throw new AppError(httpStatus.NOT_FOUND, 'Resume not found')
    }

    const file = (fileId ? resume.file.id(fileId) : resume.file[0]) as any
    if (!file) {
      throw new AppError(httpStatus.NOT_FOUND, 'Resume file not found')
    }

    const s3Key = file.key || extractR2Key(file.url)
    const expiresIn = 15 * 60
    let downloadUrl = file.url

    if (s3Key) {
      downloadUrl = await getSignedS3Url(s3Key, expiresIn)
    } else {
      if (downloadUrl?.startsWith('undefined')) {
        downloadUrl = downloadUrl.replace(/^undefined/, '')
      }
      if (downloadUrl?.startsWith('/') && process.env.SERVER_URL) {
        downloadUrl = `${process.env.SERVER_URL.replace(/\/$/, '')}${downloadUrl}`
      }
      if (!downloadUrl) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Resume file URL is missing'
        )
      }
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Resume download URL generated',
      data: {
        url: downloadUrl,
        filename: file.filename,
        expiresIn,
      },
    })
  }
)


/***********************
 * ADD NEW FILE TO RESUME *
 ***********************/
export const updateResumeFiles = catchAsync(
  async (req: Request, res: Response) => {
    const { resumeId } = req.params

    const resume = await Resume.findById(resumeId)
    if (!resume) {
      throw new AppError(httpStatus.NOT_FOUND, 'Resume not found')
    }

    if (!req.files || !(req.files instanceof Array) || req.files.length === 0) {
      throw new AppError(httpStatus.BAD_REQUEST, 'No resume files uploaded')
    }

    const newFiles = await Promise.all(
      req.files.map(async (file: any) => {
        const localPath = path.resolve('uploads', file.filename)
        const { key, fileUrl } = await uploadFileToS3(localPath, 'uploads')
        return {
          filename: file.originalname,
          url: fileUrl,
          key,
          uploadedAt: new Date(),
        }
      })
    )

    resume.file.push(...newFiles)
    await resume.save()

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'New resume files added successfully',
      data: resume,
    })
  }
)

/***********************
 * DELETE A RESUME DOC *
 ***********************/
export const deleteResume = catchAsync(async (req: Request, res: Response) => {
  const { resumeId } = req.params

  const deleted = await Resume.findByIdAndDelete(resumeId)

  if (!deleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Resume not found')
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Resume deleted successfully',
    data: null,
  })
})
