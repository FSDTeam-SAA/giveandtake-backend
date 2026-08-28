import { Request, Response } from 'express'
import httpStatus from 'http-status'
import { Message } from '../models/message.model'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import mongoose from 'mongoose'
import { io } from '../server'
import { uploadToCloudinary } from '../utils/cloudinary' // Adjust path
import { MessageRoom } from '../models/messageRoom.model'

/***************
 * CREATE MESSAGE
 ***************/

// export const createMessage = catchAsync(async (req: Request, res: Response) => {
//   const { message, roomId, userId } = req.body
//   const files = req.files as Express.Multer.File[]

//   if (!mongoose.Types.ObjectId.isValid(roomId)) {
//     throw new AppError(httpStatus.BAD_REQUEST, 'Invalid room ID')
//   }

//   // Upload all files to Cloudinary
//   const fileData = await Promise.all(
//     files.map(async (file) => {
//       const result = await uploadToCloudinary(file.path)
//       if (result) {
//         return {
//           filename: file.originalname,
//           url: result.secure_url,
//           public_id: result.public_id, // save this if you want to support deletion
//           uploadedAt: new Date(),
//         }
//       }
//     })
//   )

//   const newMessage = await Message.create({
//     message,
//     roomId,
//     userId,
//     file: fileData.filter(Boolean), // remove nulls
//   })

//   io.to(roomId).emit('newMessage', newMessage)

//   res.status(httpStatus.CREATED).json({
//     success: true,
//     message: 'Message created',
//     data: newMessage,
//   })
// })


const getUserRoomIds = async (userId: mongoose.Types.ObjectId) =>
  MessageRoom.find({
    $or: [{ userId }, { recruiterId: userId }, { companyId: userId }],
  }).distinct('_id')

export const getUnreadMessageCount = async (userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) return 0

  const objectId = new mongoose.Types.ObjectId(userId)
  const roomIds = await getUserRoomIds(objectId)

  if (roomIds.length === 0) return 0

  return Message.countDocuments({
    roomId: { $in: roomIds },
    userId: { $ne: objectId },
    readBy: { $ne: objectId },
  })
}

export const getMyUnreadMessageCount = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user?._id?.toString()
    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated')
    }

    const count = await getUnreadMessageCount(userId)

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Unread message count fetched',
      data: { count },
    })
  }
)

export const markRoomMessagesAsRead = catchAsync(
  async (req: Request, res: Response) => {
    const { roomId } = req.params
    const userId = req.user?._id?.toString()

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated')
    }
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid room ID')
    }

    const objectId = new mongoose.Types.ObjectId(userId)
    const room = await MessageRoom.findOne({
      _id: roomId,
      $or: [
        { userId: objectId },
        { recruiterId: objectId },
        { companyId: objectId },
      ],
    })

    if (!room) {
      throw new AppError(httpStatus.NOT_FOUND, 'Message room not found')
    }

    const result = await Message.updateMany(
      {
        roomId: room._id,
        userId: { $ne: objectId },
        readBy: { $ne: objectId },
      },
      { $addToSet: { readBy: objectId } }
    )
    const count = await getUnreadMessageCount(userId)

    io.to(userId).emit('msg_count', count)

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Messages marked as read',
      data: { count, markedRead: result.modifiedCount },
    })
  }
)

export const createMessage = catchAsync(async (req: Request, res: Response) => {
  const { message, roomId } = req.body
  const files = (req.files as Express.Multer.File[]) || []
  const senderId = req.user?._id?.toString()

  if (!mongoose.Types.ObjectId.isValid(roomId)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid room ID')
  }
  if (!senderId) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated')
  }

  const senderObjectId = new mongoose.Types.ObjectId(senderId)
  const room = await MessageRoom.findOne({
    _id: roomId,
    $or: [
      { userId: senderObjectId },
      { recruiterId: senderObjectId },
      { companyId: senderObjectId },
    ],
  })

  if (!room) {
    throw new AppError(httpStatus.NOT_FOUND, 'Message room not found')
  }

  // Upload all files to Cloudinary
  const fileData = await Promise.all(
    files.map(async (file) => {
      const result = await uploadToCloudinary(file.path)
      if (result) {
        return {
          filename: file.originalname,
          url: result.secure_url,
          public_id: result.public_id,
          uploadedAt: new Date(),
        }
      }
    })
  )

  // Create message
  const newMessage = await Message.create({
    message,
    roomId,
    userId: senderObjectId,
    readBy: [senderObjectId],
    file: fileData.filter(Boolean), // remove nulls
  })

  // ✅ Update lastMessage in MessageRoom
  await MessageRoom.findByIdAndUpdate(
    roomId,
    {
      lastMessage: message || (fileData.length ? '📎 Attachment' : ''),
      lastMessageSender: senderObjectId,
    },
    { new: true }
  )

  const message1 = await Message.findById(newMessage._id).populate(
    'userId',
    'name email avatar'
  )
  const recipientIds = [room.userId, room.recruiterId, room.companyId]
    .filter(Boolean)
    .map((id) => id.toString())
    .filter((id) => id !== senderId)

  // Send each recipient their own total before publishing the room event. An
  // open chat can then mark the message read and publish the final count.
  await Promise.all(
    recipientIds.map(async (recipientId) => {
      const count = await getUnreadMessageCount(recipientId)
      io.to(recipientId).emit('msg_count', count)
    })
  )
  io.to(roomId).emit('newMessage', message1)

  res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Message created',
    data: newMessage,
  })
})

/***************
 * GET MESSAGES BY ROOM (Paginated)
 ***************/
export const getMessagesByRoom = catchAsync(
  async (req: Request, res: Response) => {
    const { roomId } = req.params
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid room ID')
    }

    const messages = await Message.find({ roomId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'name email avatar')

    const total = await Message.countDocuments({ roomId })

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Messages fetched',
      data: messages,
      meta: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        total,
      },
    })
  }
)

/***************
 * UPDATE MESSAGE
 ***************/
export const updateMessage = catchAsync(async (req: Request, res: Response) => {
  const { messageId } = req.params
  const { message } = req.body

  const updated = await Message.findByIdAndUpdate(
    messageId,
    { message },
    { new: true }
  )

  if (!updated) {
    throw new AppError(httpStatus.NOT_FOUND, 'Message not found')
  }

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Message updated',
    data: updated,
  })
})

/***************
 * DELETE MESSAGE
 ***************/
export const deleteMessage = catchAsync(async (req: Request, res: Response) => {
  const { messageId } = req.params

  const deleted = await Message.findByIdAndDelete(messageId)

  if (!deleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Message not found')
  }

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Message deleted',
    data: deleted,
  })
})
