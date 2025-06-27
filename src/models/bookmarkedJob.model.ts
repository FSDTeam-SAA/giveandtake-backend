import mongoose, { Schema } from 'mongoose'
import {
  IBookmarkedJob,
  BookmarkedJobModel,
} from '../interface/bookmarkedJob.interface'

const bookmarkedJobSchema: Schema<IBookmarkedJob> = new Schema<IBookmarkedJob>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
    },
  },
  { timestamps: true }
)

export const BookmarkedJob = mongoose.model<IBookmarkedJob, BookmarkedJobModel>(
  'BookmarkedJob',
  bookmarkedJobSchema
)
