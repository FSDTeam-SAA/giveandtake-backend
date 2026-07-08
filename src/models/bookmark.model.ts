import mongoose, { Schema, Document, Model } from 'mongoose'
import { IBookmark } from '../interface/bookmark.interface'

const bookmarkSchema: Schema<IBookmark> = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    bookmarked: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
)

export const Bookmark: Model<IBookmark> = mongoose.model<IBookmark>(
  'Bookmark',
  bookmarkSchema
)
