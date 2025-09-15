import mongoose, { Schema } from 'mongoose'
import { IJob, JobModel } from '../interface/job.interface'

const jobSchema: Schema<IJob> = new Schema<IJob>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
    recruiterId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecruiterAccount' },
    title: { type: String, required: true },
    description: { type: String, required: true },
    companyName: { type: String },
    salaryRange: { type: String },
    location: { type: String },
    shift: { type: String },
    responsibilities: [{ type: String }],
    educationExperience: [{ type: String }],
    benefits: [{ type: String }],
    vacancy: { type: Number, default: 1 },
    experience: { type: Number },
    deadline: { type: Date },
    status: {
      type: String,
      enum: ['pending','active', 'deactivate'],
      default: 'active',
    },
    jobCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobCategory' },
    name: {
      type: String
    },
    role: {
      type: String
    },
    compensation: { type: String },
    arcrivedJob: { type: Boolean, default: false },
    applicationRequirement: [
      {
        requirement: { type: String },
        status: {type: String}
      },
    ],
    customQuestion: [
      {
        question: { type: String },
      },
    ],
    jobApprove: {
      type: String,
      enm: ['pending', 'approved', 'denied'],
      default: 'approved',
    },
    adminApprove: {
      type: Boolean,
      default: false,
    },
    publishDate: { type: Date },
    employement_Type: {
      type: String,
      enum: [
        'full-time',
        'part-time',
        'internship',
        'contract',
        'temporary',
        'freelance',
        'volunteer',
      ],
    },
    location_Type: {
      type: String,
      enum: ['onsite', 'remote', 'hybrid'],
    },
    career_Stage: {
      type: String,
      enum: ['New Entry', 'Experienced Professional', 'Career Returner'],
    },
    website_Url: { type: String },

  },
  { timestamps: true }
)

jobSchema.index({ title: 'text', location: 'text', description: 'text' })

export const Job = mongoose.model<IJob, JobModel>('Job', jobSchema)
