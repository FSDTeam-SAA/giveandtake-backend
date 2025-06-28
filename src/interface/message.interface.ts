import { Document, Model } from 'mongoose'

export interface IMessageFile {
  filename: string
  url: string
  uploadedAt: Date
}

export interface IMessage extends Document {
  userId: string
  message: string
  file: IMessageFile[]
  roomId: string
}

export interface MessageModel extends Model<IMessage> {}
