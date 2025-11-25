import { Document, Model, Types } from 'mongoose'

export interface IBlog extends Document {
  title: string
  slug: string
  description: string
  image?: string
  userId: Types.ObjectId
  imagePublicId: string
  authorName: string
}

export type BlogModel = Model<IBlog>
