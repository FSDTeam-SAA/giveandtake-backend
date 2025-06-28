import mongoose, { Schema } from 'mongoose'
import { IMessage, MessageModel } from '../interface/message.interface'

const messageSchema: Schema<IMessage> = new Schema<IMessage>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    message: { type: String, required: true },
    file: [
      {
        filename: { type: String },
        url: { type: String },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room', // Assuming you have a Room model
      required: true,
    },
  },
  { timestamps: true }
)

export const Message = mongoose.model<IMessage, MessageModel>(
  'Message',
  messageSchema
)
