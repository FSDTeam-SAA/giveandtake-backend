import { Request, Response } from 'express'
import { Resume } from '../models/resume.model'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import httpStatus from 'http-status'
import sendResponse from '../utils/sendResponse'
import path from 'path'
import { uploadFileToS3 } from '../services/s3.service'

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
      const localPath = path.resolve("uploads/", file.filename);

      // Upload to S3 and get public + signed URL
      const { fileUrl } = await uploadFileToS3(localPath, "uploads/");

      return {
        filename: file.originalname,
        url: fileUrl, // public URL (use this for download)
        uploadedAt: new Date(),
      };
    })
  );

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

    const newFiles = req.files?.map((file: any) => ({
      filename: file.originalname,
      url: `${process.env.SERVER_URL}/uploads/resumes/${file.filename}`,
      uploadedAt: new Date(),
    }))

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
