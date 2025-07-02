import { Request, Response } from 'express'
import catchAsync from '../utils/catchAsync'
import { JobCategory } from '../models/jobCategory.model'
import sendResponse from '../utils/sendResponse'
import httpStatus from 'http-status'
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary'
import AppError from '../errors/AppError'

// create category
export const createJobCategory = catchAsync(
  async (req: Request, res: Response) => {
    const { name } = req.body
    if (!name) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Please fill in all fields')
    }

    let categoryIcon = ''
    if (req.file) {
      const result = await uploadToCloudinary(req.file.path)

      if (!result) {
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Failed to upload image'
        )
      }

      categoryIcon = result.secure_url
    }

    const category = await JobCategory.create({
      name,
      categoryIcon,
    })

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Job category created successfully',
      data: category,
    })
  }
)
