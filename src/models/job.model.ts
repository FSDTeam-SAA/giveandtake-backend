import mongoose, { Schema } from 'mongoose'
import { IJob, JobModel } from '../interface/job.interface'

const jobSchema: Schema<IJob> = new Schema<IJob>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: { type: String, required: true },
    description: { type: String, required: true },
    companyName: { type: String, required: true },
    salaryRange: { type: String },
    location: { type: String },
    shift: { type: String },
    responsibilities: [{ type: String }],
    educationExperience: [{ type: String }],
    benefits: [{ type: String }],
    vacancy: { type: Number, default: 1 },
    experience: { type: Number },
    deadline: { type: Date },
    status: { type: String, enum: ['active', 'deactive'], default: 'active' },
    jobCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobCategory' },
    compensation: { type: String },
    arcrivedJob: { type: Boolean, default: false },
    applicationRequirement: [
      {
        requirement: { type: String },
      },
    ],
    customQuestion: [
      {
        question: { type: String },
      },
    ],
  },
  { timestamps: true }
)

jobSchema.index({ title: 'text', location: 'text', responsibilities: 1 })

export const Job = mongoose.model<IJob, JobModel>('Job', jobSchema)
