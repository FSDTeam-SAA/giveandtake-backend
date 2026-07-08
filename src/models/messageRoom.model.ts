import mongoose, { Schema } from 'mongoose'
import {
  IMessageRoom,
  MessageRoomModel,
} from '../interface/messageRoom.interface'

const messageRoomSchema: Schema<IMessageRoom> = new Schema<IMessageRoom>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    recruiterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    messsageAccepted: { type: Boolean, default: false },
    lastMessage: {
      type: String,
      default: '',
    },
    lastMessageSender: {
      type: mongoose.Schema.Types.ObjectId
    }
  },
  { timestamps: true }
)

export const MessageRoom = mongoose.model<IMessageRoom, MessageRoomModel>(
  'MessageRoom',
  messageRoomSchema
)
