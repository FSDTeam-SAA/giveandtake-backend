import { Document, Model } from 'mongoose'

export interface IMessageRoom extends Document {
  userId: string
  recruiterId: string // or companyId, ref: 'User'
  lastMessage: string
}

export interface MessageRoomModel extends Model<IMessageRoom> {}
