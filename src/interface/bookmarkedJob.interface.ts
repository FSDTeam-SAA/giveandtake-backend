import { Document, Model, Types } from 'mongoose'

export interface IBookmarkedJob extends Document {
  userId: Types.ObjectId
  jobId: Types.ObjectId
}

export interface BookmarkedJobModel extends Model<IBookmarkedJob> {}
