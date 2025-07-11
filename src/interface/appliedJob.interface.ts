import mongoose from "mongoose"


export interface IAppliedJob extends Document {
  jobId: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  status: 'rejected' | 'shortlisted'
  createdAt?: Date
  updatedAt?: Date
}
