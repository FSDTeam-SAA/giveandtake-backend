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
      required: true,
    },
    recruiterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastMessage: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
)

export const MessageRoom = mongoose.model<IMessageRoom, MessageRoomModel>(
  'MessageRoom',
  messageRoomSchema
)
