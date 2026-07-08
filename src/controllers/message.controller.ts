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
  const { message, roomId, userId } = req.body
  const files = req.files as Express.Multer.File[]

  const room = await MessageRoom.findById(roomId);

  if (!mongoose.Types.ObjectId.isValid(roomId)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid room ID')
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
    userId,
    file: fileData.filter(Boolean), // remove nulls
  })

  // ✅ Update lastMessage in MessageRoom
  await MessageRoom.findByIdAndUpdate(
    roomId,
    {
      lastMessage: message || (fileData.length ? '📎 Attachment' : ''),
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
