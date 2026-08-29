import mongoose, { Schema } from 'mongoose'
import { IBlog, BlogModel } from '../interface/blog.interface'

const blogSchema: Schema<IBlog> = new Schema<IBlog>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true, trim: true },
    description: { type: String, required: true },
    image: { type: String },
    imageKey: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    imagePublicId: { type: String },
    authorName: { type: String, required: true },
    authorDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export const Blog = mongoose.model<IBlog, BlogModel>('Blog', blogSchema)
