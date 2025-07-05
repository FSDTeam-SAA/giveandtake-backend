import mongoose, { Schema } from 'mongoose'
import { IExperience, ExperienceModel } from '../interface/experience.interface'

const experienceSchema: Schema<IExperience> = new Schema<IExperience>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    employer: { type: String, required: true },
    jobTitle: { type: String, required: true },
    firstName: { type: String },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    country: { type: String },
    city: { type: String },
    zip: { type: String },
    jobDescription: { type: String },
    careerField: { type: String },
    careerSubfield: { type: String },
    // resumeId: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: 'CreateResume',
    //   required: true,
    // },
  },
  { timestamps: true }
)

export const Experience = mongoose.model<IExperience, ExperienceModel>(
  'Experience',
  experienceSchema
)
