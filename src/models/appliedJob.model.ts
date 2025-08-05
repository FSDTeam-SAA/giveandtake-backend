import mongoose, { Schema, Document, Model } from 'mongoose'
import { IAppliedJob } from '../interface/appliedJob.interface'

const appliedJobSchema: Schema<IAppliedJob> = new Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'rejected', 'shortlisted'],
      default: 'pending',
    },
  },
  { timestamps: true }
)

export const AppliedJob: Model<IAppliedJob> = mongoose.model<IAppliedJob>(
  'AppliedJob',
  appliedJobSchema
)
