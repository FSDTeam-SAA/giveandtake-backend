import { Document, Model, Types } from 'mongoose'

export interface IBlog extends Document {
  title: string
  description: string
  image?: string
  userId: Types.ObjectId
}

export type BlogModel = Model<IBlog>
