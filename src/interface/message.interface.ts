import { Document, Model, Types } from 'mongoose'

export interface IMessageFile {
  filename: string
  url: string
  key?: string
  uploadedAt: Date
}

export interface IMessage extends Document {
  userId: Types.ObjectId
  message: string
  file: IMessageFile[]
  roomId: Types.ObjectId
  readBy: Types.ObjectId[]
}

export interface MessageModel extends Model<IMessage> {}
