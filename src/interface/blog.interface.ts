import { Document, Model, Types } from 'mongoose'

export interface IBlog extends Document {
  title: string
  slug: string
  description: string
  image?: string
  imageKey?: string
  userId?: Types.ObjectId
  imagePublicId?: string | null
  authorName: string
  authorDeleted?: boolean
}

export type BlogModel = Model<IBlog>
