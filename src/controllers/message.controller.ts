import { Request, Response } from 'express'
import httpStatus from 'http-status'
import { Message } from '../models/message.model'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import mongoose from 'mongoose'
import { io } from '../server'
import { uploadToR2 } from '../utils/r2Upload' // Adjust path
import { MessageRoom } from '../models/messageRoom.model'
import { idToString, isPrivilegedRole } from '../utils/authz'
import stripHtml from '../utils/stripHtml'

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
//       const result = await uploadToR2(file.path)
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


export const getUnreadRoomCount = async (userId : any) => {
  const unreadRooms = await Message.aggregate([
    {
      $match: {
        userId: { $ne: new mongoose.Types.ObjectId(userId) }, // not sent by this user
        readBy: { $ne: new mongoose.Types.ObjectId(userId) } // not yet read
      }
    },
    {
      $group: {
        _id: "$roomId", // group by room
      }
    },
    {
      $count: "roomCount" // count number of rooms with unread messages
    }
  ]);

  return unreadRooms.length ? unreadRooms[0].roomCount : 0;
};

export const createMessage = catchAsync(async (req: Request, res: Response) => {
  const { message, roomId } = req.body
  const files = req.files as Express.Multer.File[]

  // Validate the room id is a real 24-hex ObjectId BEFORE touching the DB so a
  // malformed id yields a clean 400 instead of a downstream Mongoose cast error.
  if (typeof roomId !== 'string' || !mongoose.Types.ObjectId.isValid(roomId)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid room id')
  }

  const room = await MessageRoom.findById(roomId)

  // A well-formed id that doesn't resolve to a room is a clean 404.
  if (!room) {
    throw new AppError(httpStatus.NOT_FOUND, 'Message room not found')
  }

  // The sender is always the authenticated user, never trusted from the body.
  const userId = idToString(req.user?._id)

  // Only participants of the room may post messages to it.
  if (!isRoomParticipant(req, room)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not a participant of this conversation.'
    )
  }

  // Sanitize message text/body server-side so stored messages can't carry
  // script/HTML payloads. Keep plain text intact.
  const sanitizedMessage =
    typeof message === 'string' ? stripHtml(message) : ''

  // Upload all files to Cloudinary
  const fileData = await Promise.all(
    files.map(async (file) => {
      const result = await uploadToR2(file.path)
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

  // Create message (whitelisted fields only; sender taken from the token)
  const newMessage = await Message.create({
    message: sanitizedMessage,
    roomId,
    userId,
    file: fileData.filter(Boolean), // remove nulls
  })

  // ✅ Update lastMessage in MessageRoom
  await MessageRoom.findByIdAndUpdate(
    roomId,
    {
      lastMessage: sanitizedMessage || (fileData.length ? '📎 Attachment' : ''),
      lastMessageSender: userId,
    },
    { new: true }
  )

  const message1 = await Message.findById(newMessage._id).populate(
    'userId',
    'name email avatar'
  )
  let uid = '';
  if(req?.user?.role === 'candidate'){
    uid = (room?.companyId ?? room?.recruiterId)?.toString() ?? '';
  }else{
    uid = room?.userId?.toString() || '';
  }
  // Emit socket event
  io.to(roomId).emit('newMessage', message1)
  const count = await getUnreadRoomCount(userId);
  io.to(uid.toString()).emit('msg_count', count)

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

    const room = await MessageRoom.findById(roomId)

    if (!room) {
      throw new AppError(httpStatus.NOT_FOUND, 'Message room not found')
    }

    // Only participants of the room (or admins) may read its messages.
    if (!isRoomParticipant(req, room)) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'You are not a participant of this conversation.'
      )
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

  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid message ID')
  }

  const existing = await Message.findById(messageId)

  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, 'Message not found')
  }

  const room = await MessageRoom.findById(existing.roomId)

  // Caller must be a participant of the room ...
  if (!isRoomParticipant(req, room)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not a participant of this conversation.'
    )
  }

  // ... and may only edit their own messages (admins exempt).
  if (
    !isPrivilegedRole(req.user?.role) &&
    idToString(existing.userId) !== idToString(req.user?._id)
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You can only edit your own messages.'
    )
  }

  // Sanitize edited text server-side.
  existing.message = typeof message === 'string' ? stripHtml(message) : ''
  await existing.save()

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Message updated',
    data: existing,
  })
})

/***************
 * DELETE MESSAGE
 ***************/
export const deleteMessage = catchAsync(async (req: Request, res: Response) => {
  const { messageId } = req.params

  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid message ID')
  }

  const existing = await Message.findById(messageId)

  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, 'Message not found')
  }

  const room = await MessageRoom.findById(existing.roomId)

  // Caller must be a participant of the room ...
  if (!isRoomParticipant(req, room)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not a participant of this conversation.'
    )
  }

  // ... and may only delete their own messages (admins exempt).
  if (
    !isPrivilegedRole(req.user?.role) &&
    idToString(existing.userId) !== idToString(req.user?._id)
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You can only delete your own messages.'
    )
  }

  const deleted = await Message.findByIdAndDelete(messageId)

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Message deleted',
    data: deleted,
  })
})
