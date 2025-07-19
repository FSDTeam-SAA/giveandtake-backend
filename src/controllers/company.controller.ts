import { Request, Response } from 'express'
import { Company } from '../models/company.model'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import sendResponse from '../utils/sendResponse'

/******************
 * CREATE COMPANY *
 ******************/
export const createCompany = catchAsync(async (req: Request, res: Response) => {
  const companyData = req.body
  const newCompany = await Company.create(companyData)

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Company created successfully',
    data: newCompany,
  })
})

/************************
 * UPDATE COMPANY BY ID *
 ************************/
export const updateCompany = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params
  const updated = await Company.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  })

  if (!updated) {
    res.status(404).json({
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
export const getCompanyByUserId = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params
    const companies = await Company.find({ userId: userId })

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Company(s) fetched successfully',
      data: companies,
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
