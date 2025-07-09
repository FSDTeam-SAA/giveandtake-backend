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
// GET Recruiter Account by User ID
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

// UPDATE Recruiter Account
export const updateRecruiterAccount = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params
    const updates = req.body

    const updatedAccount = await RecruiterAccount.findOneAndUpdate(
      { userId },
      updates,
      { new: true, runValidators: true }
    )

    if (!updatedAccount) {
      throw new AppError(httpStatus.NOT_FOUND, 'Recruiter account not found')
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Recruiter account updated successfully',
      data: updatedAccount,
    })
  }
)

// DELETE Recruiter Account
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
