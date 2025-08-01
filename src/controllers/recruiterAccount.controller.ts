import { Request, Response } from 'express'
import httpStatus from 'http-status'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import { RecruiterAccount } from '../models/recruiterAccount.model'
import sendResponse from '../utils/sendResponse'
import { uploadToCloudinary } from '../utils/cloudinary'

/****************************
 * CREATE RECRUITER ACCOUNT *
 ****************************/
export const createRecruiterAccount = catchAsync(
  async (req: Request, res: Response) => {
    const { userId, ...rest } = req.body

    const existing = await RecruiterAccount.findOne({ userId })
    if (existing) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Account already exists for this user'
      )
    }

    let videoUrl = ''
    let photoUrl = ''

    // @ts-ignore
    const files = req.files as { [fieldname: string]: Express.Multer.File[] }

    if (files?.videoFile?.[0]) {
      const uploaded = await uploadToCloudinary(files.videoFile[0].path)
      if (uploaded) videoUrl = uploaded.secure_url
    }

    if (files?.photo?.[0]) {
      const uploaded = await uploadToCloudinary(files.photo[0].path)
      if (uploaded) photoUrl = uploaded.secure_url
    }

    const recruiterAccount = await RecruiterAccount.create({
      userId,
      videoFile: videoUrl,
      photo: photoUrl,
      ...rest,
    })

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Recruiter account created successfully',
      data: recruiterAccount,
    })
  }
)

/************************************
 * GET RECRUITER ACCOUNT BY USER ID *
 ************************************/
export const getRecruiterAccountByUserId = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params

    const account = await RecruiterAccount.findOne({ userId })

    if (!account) {
      throw new AppError(httpStatus.NOT_FOUND, 'Recruiter account not found')
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Recruiter account fetched successfully',
      data: account,
    })
  }
)

/****************************
 * UPDATE RECRUITER ACCOUNT *
 ****************************/
export const updateRecruiterAccount = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params
    const updates = { ...req.body }

    // @ts-ignore
    const files = req.files as { [fieldname: string]: Express.Multer.File[] }

    const existingAccount = await RecruiterAccount.findOne({ userId })

    if (!existingAccount) {
      throw new AppError(httpStatus.NOT_FOUND, 'Recruiter account not found')
    }

    // Handle new video upload
    if (files?.videoFile?.[0]) {
      const uploadedVideo = await uploadToCloudinary(files.videoFile[0].path)
      if (uploadedVideo?.secure_url) {
        updates.videoFile = uploadedVideo.secure_url
        // Optional: delete old video from Cloudinary if storing public_id
      }
    }

    // Handle new photo upload
    if (files?.photo?.[0]) {
      const uploadedPhoto = await uploadToCloudinary(files.photo[0].path)
      if (uploadedPhoto?.secure_url) {
        updates.photo = uploadedPhoto.secure_url
        // Optional: delete old photo from Cloudinary if storing public_id
      }
    }

    const updatedAccount = await RecruiterAccount.findOneAndUpdate(
      { userId },
      updates,
      { new: true, runValidators: true }
    )

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Recruiter account updated successfully',
      data: updatedAccount,
    })
  }
)

/*******************************
 * * DELETE RECRUITER ACCOUNT *
 *******************************/
export const deleteRecruiterAccount = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params

    const deleted = await RecruiterAccount.findOneAndDelete({ userId })

    if (!deleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Recruiter account not found')
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Recruiter account deleted successfully',
      data: deleted,
    })
  }
)
