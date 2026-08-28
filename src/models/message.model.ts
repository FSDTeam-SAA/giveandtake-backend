import mongoose, { Schema } from 'mongoose'
import { IMessage, MessageModel } from '../interface/message.interface'

const messageSchema: Schema<IMessage> = new Schema<IMessage>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    message: { type: String },
    file: [
      {
        filename: { type: String },
        url: { type: String },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MessageRoom',
      required: true,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { timestamps: true }
)

messageSchema.index({ roomId: 1, userId: 1, readBy: 1 })

export const Message = mongoose.model<IMessage, MessageModel>(
  'Message',
  messageSchema
)
