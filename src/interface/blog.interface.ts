import { Document, Model, Types } from 'mongoose'

export interface IBlog extends Document {
  title: string
  description: string
  image?: string
  userId: Types.ObjectId
  imagePublicId: string
}

export type BlogModel = Model<IBlog>
