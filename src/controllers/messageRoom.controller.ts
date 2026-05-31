import { Request, Response } from 'express'
import { MessageRoom } from '../models/messageRoom.model'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import httpStatus from 'http-status'
import mongoose from 'mongoose'
import { asQueryString, idToString, isPrivilegedRole } from '../utils/authz'

/**
 * Returns true if the authenticated user is a participant of the room
 * (candidate / recruiter / company) or a privileged role.
 */
const isRoomParticipant = (req: Request, room: any): boolean => {
  if (isPrivilegedRole(req.user?.role)) return true
  const requesterId = idToString(req.user?._id)
  if (!requesterId) return false
  return (
    requesterId === idToString(room?.userId) ||
    requesterId === idToString(room?.recruiterId) ||
    requesterId === idToString(room?.companyId)
  )
}

/***********************
 * CREATE MESSAGE ROOM *
 ***********************/
export const createMessageRoom = catchAsync(
  async (req: Request, res: Response) => {
    // Neutralise NoSQL operator injection on the counterpart ids supplied by
    // the client.
    let userId = asQueryString(req.body.userId)
    let recruiterId = asQueryString(req.body.recruiterId)
    let companyId = asQueryString(req.body.companyId)

    // The authenticated user is forced into their own participant slot; only
    // the counterpart id(s) are taken from the body.
    const requesterId = idToString(req.user?._id)
    const role = req.user?.role

    if (!requesterId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Authentication required')
    }

    if (role === 'recruiter') {
      recruiterId = requesterId
    } else if (role === 'company') {
      companyId = requesterId
    } else if (!isPrivilegedRole(role)) {
      // candidate (and any non-privileged role) owns the userId slot
      userId = requesterId
    }

    // Only include id slots that were actually supplied; an empty string would
    // fail to cast to an ObjectId, so absent counterparts must be omitted.
    const roomQuery: Record<string, string> = {}
    if (userId) roomQuery.userId = userId
    if (recruiterId) roomQuery.recruiterId = recruiterId
    if (companyId) roomQuery.companyId = companyId

    const exists = await MessageRoom.findOne(roomQuery)

    if (exists) {
      throw new AppError(httpStatus.CONFLICT, 'Message room already exists')
    }

    const room = await MessageRoom.create(roomQuery)

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
    const { type } = req.query

    if (!type) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Query parameter "type" is required'
      )
    }

    // The userId is derived from the authenticated token, never trusted from
    // client input. Admins may inspect another user's rooms via ?userId=.
    const clientId = asQueryString(req.query.userId)
    const userId = isPrivilegedRole(req.user?.role)
      ? clientId || idToString(req.user?._id)
      : idToString(req.user?._id)

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid userId')
    }

    const objectId = new mongoose.Types.ObjectId(userId)
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

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid room ID')
    }

    const room = await MessageRoom.findById(roomId)

    if (!room) {
      throw new AppError(httpStatus.NOT_FOUND, 'Message room not found')
    }

    // Only participants of the room (or admins) may delete it.
    if (!isRoomParticipant(req, room)) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'You are not a participant of this conversation.'
      )
    }

    await MessageRoom.findByIdAndDelete(roomId)

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

    if (!mongoose.Types.ObjectId.isValid(roomid)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid room ID')
    }

    const room = await MessageRoom.findById(roomid)

    if (!room) {
      throw new AppError(httpStatus.NOT_FOUND, 'Message room not found')
    }

    // Only participants of the room (or admins) may accept it.
    if (!isRoomParticipant(req, room)) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'You are not a participant of this conversation.'
      )
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
