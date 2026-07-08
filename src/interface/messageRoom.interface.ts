import { Document, Model, Types } from 'mongoose'

export interface IMessageRoom extends Document {
  userId: Types.ObjectId
  recruiterId: Types.ObjectId 
  lastMessage: string
  messsageAccepted: boolean
  companyId: Types.ObjectId
  lastMessageSender: Types.ObjectId
}

export interface MessageRoomModel extends Model<IMessageRoom> {}
