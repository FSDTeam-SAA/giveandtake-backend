import { Request, Response } from 'express'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { AwarenessAndHonour } from '../models/awarenessAndHonour.model'
import sendResponse from '../utils/sendResponse'

/******************************
 * CREATE AWARNESS AND HONOUR *
 ******************************/
export const createAwarenessAndHonour = catchAsync(
  async (req: Request, res: Response) => {
    const data = req.body
    const result = await AwarenessAndHonour.create(data)

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
  const result = await AwarenessAndHonour.find({ userId })

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Entries fetched successfully',
    data: result,
  })
})

/*******************************
 * UPDATE AWARENESS AND HONOUR *
 *******************************/
export const updateAwarenessAndHonour = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params
    const updates = req.body

    const result = await AwarenessAndHonour.findByIdAndUpdate(id, updates, {
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
 * DELETE AWARENESS AND HONOUR *
 *******************************/
export const deleteAwarenessAndHonour = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params

    const result = await AwarenessAndHonour.findByIdAndDelete(id)

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
