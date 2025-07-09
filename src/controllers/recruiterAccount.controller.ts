import { Request, Response } from 'express'
import httpStatus from 'http-status'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import { RecruiterAccount } from '../models/recruiterAccount.model'
import sendResponse from '../utils/sendResponse'

// CREATE Recruiter Account
export const createRecruiterAccount = catchAsync(
  async (req: Request, res: Response) => {
    const { userId, ...rest } = req.body

    const existingAccount = await RecruiterAccount.findOne({ userId })
    if (existingAccount) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Account already exists for this user'
      )
    }

    const account = await RecruiterAccount.create({ userId, ...rest })

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Recruiter account created successfully',
      data: account,
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
