import { Request, Response } from 'express'
import { MessageRoom } from '../models/messageRoom.model'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import httpStatus from 'http-status'
import mongoose from 'mongoose'

/***********************
 * CREATE MESSAGE ROOM *
 ***********************/
export const createMessageRoom = catchAsync(
  async (req: Request, res: Response) => {
    const { userId, recruiterId, companyId } = req.body

    // if (!userId || !recruiterId) {
    //   throw new AppError(
    //     httpStatus.BAD_REQUEST,
    //     'Both userId and recruiterId are required'
    //   )
    // }

    const exists = await MessageRoom.findOne({ userId, recruiterId, companyId })

    if (exists) {
      throw new AppError(httpStatus.CONFLICT, 'Message room already exists')
    }

    const room = await MessageRoom.create({ userId, recruiterId, companyId })

    res.status(httpStatus.CREATED).json({
      success: true,
      message: 'Message room created',
      data: room,
    })
  }
)

/*****************************
 * GET MESSAGE ROOMS BY TYPE *
 *****************************/
export const getMessageRooms = catchAsync(
  async (req: Request, res: Response) => {
    const { type, userId } = req.query

    if (!type || !userId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Query parameters "type" and "userId" are required'
      )
    }

    if (!mongoose.Types.ObjectId.isValid(userId as string)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid userId')
    }

    const objectId = new mongoose.Types.ObjectId(userId as string)
    let filter = {}

    switch (type) {
      case 'candidate':
        filter = { userId: objectId }
        break
      case 'recruiter':
        filter = { recruiterId: objectId }
        break
      case 'company':
        filter = { companyId: objectId }
        break
      default:
        throw new AppError(httpStatus.BAD_REQUEST, 'Invalid type')
    }

    const rooms = await MessageRoom.find(filter)
      .sort({ createdAt: -1 })
      .populate('userId', 'name email role avatar')
      .populate('recruiterId', 'name email role avatar')
      .populate('companyId', 'name email role avatar')

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Message rooms fetched',
      data: rooms,
    })
  }
)

/***********************
 * DELETE MESSAGE ROOM *
 ***********************/
export const deleteMessageRoom = catchAsync(
  async (req: Request, res: Response) => {
    const { roomId } = req.params

    const room = await MessageRoom.findByIdAndDelete(roomId)

    if (!room) {
      throw new AppError(httpStatus.NOT_FOUND, 'Message room not found')
    }

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Message room deleted',
    })
  }
)

/***********************
 * ACCEPT MESSAGE ROOM *
 ***********************/
export const acceptMessageRoom = catchAsync(
  async (req: Request, res: Response) => {
    const { roomid } = req.params
    // console.log(roomid)

    const room = await MessageRoom.findById(roomid)

    if (!room) {
      throw new AppError(httpStatus.NOT_FOUND, 'Message room not found')
    }

    room.messsageAccepted = true
    await room.save()

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Message accepted',
      data: room,
    })
  }
)
