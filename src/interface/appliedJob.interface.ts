import mongoose from 'mongoose'

export interface IAppliedJob extends Document {
  jobId: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  status: 'pending' | 'rejected' | 'shortlisted'
  createdAt?: Date
  updatedAt?: Date
}
