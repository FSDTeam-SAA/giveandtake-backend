import mongoose, { Document } from 'mongoose'

export interface IBookmark extends Document {
  userId: mongoose.Types.ObjectId
  jobId: mongoose.Types.ObjectId
  bookmarked: boolean
}
