import { Request, Response } from 'express'
import { Resume } from '../models/resume.model'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import httpStatus from 'http-status'
import sendResponse from '../utils/sendResponse'
import path from 'path'
import { uploadHLSFilesToS3 } from '../services/s3.service'

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
  const fileData = req.files.map((file: any) => {
  let fileUrl;

  if (process.env.NODE_ENV === "development") {
    console.log("vgbdsrthnj")
    // Absolute local path on your PC
    fileUrl = path.resolve("uploads/resumes", file.filename);
  } else {
    // Production → use SERVER_URL
    fileUrl = `${process.env.SERVER_URL}/uploads/resumes/${file.filename}`;
    fileUrl =  uploadHLSFilesToS3 (path.resolve("uploads/resumes", file.filename), "uploads")
  }

  return {
    filename: file.originalname,
    url: fileUrl,
    uploadedAt: new Date(),
  };
});

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
