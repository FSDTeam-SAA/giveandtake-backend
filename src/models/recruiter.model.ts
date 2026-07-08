import mongoose, { Schema } from 'mongoose'
import { IRecruiter, RecruiterModel } from '../interface/recruiter.interface'

const recruiterSchema: Schema<IRecruiter> = new Schema<IRecruiter>(
  {
    companyName: { type: String, required: true },
    email: { type: String, required: true },
    logo: { type: String }, // store as URL or Cloudinary ID
    companyDetails: { type: String },
    companyWebsite: { type: String },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
)

export const Recruiter = mongoose.model<IRecruiter, RecruiterModel>(
  'Recruiter',
  recruiterSchema
)
