import mongoose, { Schema } from 'mongoose'
import { IBlog, BlogModel } from '../interface/blog.interface'

const blogSchema: Schema<IBlog> = new Schema<IBlog>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

export const Blog = mongoose.model<IBlog, BlogModel>('Blog', blogSchema)
