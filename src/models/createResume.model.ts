import mongoose, { Schema } from 'mongoose'
import {
  ICreateResume,
  CreateResumeModel,
} from '../interface/createResume.interface'

const createResumeSchema: Schema<ICreateResume> = new Schema<ICreateResume>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['candidate', 'recruiter', 'admin'],
    },
    photo: { type: String },
    aboutUs: { type: String },
    title: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    sureName: { type: String },
    country: { type: String },
    city: { type: String },
    zipCode: { type: String },
    jobCategoryId: { type: String },
    email: { type: String },
    phoneNumber: { type: String },
    location: { type: String },
    sLink: [
      {
        label: { type: String },
        url: { type: String },
      },
    ],
    skills: [{ type: String }],
  },
  { timestamps: true }
)

createResumeSchema.index({ title: 'text', country: 'text', skills: 1 })

export const CreateResume = mongoose.model<ICreateResume, CreateResumeModel>(
  'CreateResume',
  createResumeSchema
)
