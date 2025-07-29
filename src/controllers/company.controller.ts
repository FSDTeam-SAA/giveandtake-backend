import { Request, Response } from 'express'
import { Company } from '../models/company.model'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import sendResponse from '../utils/sendResponse'
import { uploadToCloudinary } from '../utils/cloudinary'
import { AwardsAndHonor } from '../models/awardsAndHonor.model'
import mongoose from 'mongoose'
import AppError from '../errors/AppError'
import { getPaginationParams, buildMetaPagination, MetaPagination } from '../utils/pagination';

/******************
 * CREATE COMPANY *
 ******************/

export const createCompany = catchAsync(async (req: Request, res: Response) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { AwardsAndHonors, ...companyData } = req.body

    // Handle file upload (e.g. logo)
    if (req.file?.path) {
      const cloudinaryRes = await uploadToCloudinary(req.file.path)
      if (cloudinaryRes?.secure_url) {
        companyData.clogo = cloudinaryRes.secure_url
      }
    }

    // Optional: attach userId from req.user if available
    if (req.user?.id) {
      companyData.userId = req.user.id
    }

    // Create company document
    const newCompany = await Company.create([companyData], { session })

    // Parse and insert awards and honors if provided
    let createdHonors = [] as any[]

    let parsedHonors = []
    if (typeof AwardsAndHonors === 'string') {
      try {
        parsedHonors = JSON.parse(AwardsAndHonors)
      } catch (err) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Invalid JSON format in AwardsAndHonors'
        )
      }
    } else if (Array.isArray(AwardsAndHonors)) {
      parsedHonors = AwardsAndHonors
    }

    if (parsedHonors.length > 0) {
      const honorData = parsedHonors.map((item: any) => ({
        ...item,
        userId: companyData.userId,
      }))
      createdHonors = await AwardsAndHonor.insertMany(honorData, { session })
    }

    await session.commitTransaction()
    session.endSession()

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Company and associated honors created successfully',
      data: {
        company: newCompany[0],
        honors: createdHonors,
      },
    })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    throw error
  }
})

/************************
 * UPDATE COMPANY BY ID *
 ************************/
export const updateCompany = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params

  // Upload new logo if provided
  if (req.file?.path) {
    const cloudinaryRes = await uploadToCloudinary(req.file.path)
    if (cloudinaryRes?.secure_url) {
      req.body.clogo = cloudinaryRes.secure_url
    }
  }

  const updated = await Company.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  })

  if (!updated) {
    res.status(httpStatus.NOT_FOUND).json({
      success: false,
      message: 'Company not found',
    })
    return
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Company updated successfully',
    data: updated,
  })
})

/**************************
 * GET COMPANY BY USER ID *
 **************************/
// export const getCompanyByUserId = catchAsync(
//   async (req: Request, res: Response) => {
//     const { userId } = req.params
//     const companies = await Company.find({ userId: userId })

//     sendResponse(res, {
//       statusCode: httpStatus.OK,
//       success: true,
//       message: 'Company(s) fetched successfully',
//       data: companies,
//     })
//   }
// )

export const getCompanyByUserId = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params

    const { page, limit, skip } = getPaginationParams(req.query)

    // Count total companies for this user
    const totalCompanies = await Company.countDocuments({ userId })

    // Fetch companies with pagination
    const companies = await Company.find({ userId })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }) 

    // Get related AwardsAndHonor (if any), for all companies by user
    const honors = await AwardsAndHonor.find({ userId }).sort({
      programeDate: -1,
    })

    const meta = buildMetaPagination(totalCompanies, page, limit)

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Companies and related honors fetched successfully',

      data: {
        meta,
        companies,
        honors,
      },
    })
  }
)





/************************
 * DELETE COMPANY BY ID *
 ************************/
export const deleteCompany = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params
  const deleted = await Company.findByIdAndDelete(id)

  if (!deleted) {
    res.status(404).json({
      success: false,
      message: 'Company not found',
    })
    return
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Company deleted successfully',
    data: deleted,
  })
})
