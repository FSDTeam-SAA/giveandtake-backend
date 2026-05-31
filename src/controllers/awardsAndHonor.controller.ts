import { Request, Response } from 'express'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { AwardsAndHonor } from '../models/awardsAndHonor.model'
import sendResponse from '../utils/sendResponse'
import { isPrivilegedRole } from '../utils/authz'

/******************************
 * CREATE AWARNESS AND Honor *
 ******************************/
export const createAwardAndHonor = catchAsync(
  async (req: Request, res: Response) => {
    const { title, programeName, programeDate, issuer, description } = req.body
    const result = await AwardsAndHonor.create({
      userId: req.user?._id,
      title,
      programeName,
      programeDate,
      issuer,
      description,
    })

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Entry created successfully',
      data: result,
    })
  }
)

/******************
 * GET BY USER ID *
 ******************/
export const getByUserId = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.params
  const result = await AwardsAndHonor.find({ userId })

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Entries fetched successfully',
    data: result,
  })
})

/*******************************
 * UPDATE AWARENESS AND Honor *
 *******************************/
export const updateAwardsAndHonor = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params
    const { title, programeName, programeDate, issuer, description } = req.body

    // Whitelist editable fields; never allow userId/_id reassignment.
    const updates = { title, programeName, programeDate, issuer, description }

    // Owners may only touch their own entries; admins/super-admins bypass.
    const filter = isPrivilegedRole(req.user?.role)
      ? { _id: id }
      : { _id: id, userId: req.user?._id }

    const result = await AwardsAndHonor.findOneAndUpdate(filter, updates, {
      new: true,
    })

    if (!result) {
      throw new AppError(httpStatus.NOT_FOUND, 'Entry not found')
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Entry updated successfully',
      data: result,
    })
  }
)

/*******************************
 * DELETE AWARENESS AND Honor *
 *******************************/
export const deleteAwardsAndHonor = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params

    // Owners may only delete their own entries; admins/super-admins bypass.
    const filter = isPrivilegedRole(req.user?.role)
      ? { _id: id }
      : { _id: id, userId: req.user?._id }

    const result = await AwardsAndHonor.findOneAndDelete(filter)

    if (!result) {
      throw new AppError(httpStatus.NOT_FOUND, 'Entry not found')
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Entry deleted successfully',
      data: result,
    })
  }
)
