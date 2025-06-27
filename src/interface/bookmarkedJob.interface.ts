import { Document, Model } from 'mongoose'

export interface IBookmarkedJob extends Document {
  userId: string
  jobId: string // referenced ObjectId from Job
}

export interface BookmarkedJobModel extends Model<IBookmarkedJob> {}
