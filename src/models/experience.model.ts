import mongoose, { Schema } from 'mongoose'
import { IExperience, ExperienceModel } from '../interface/experience.interface'

const experienceSchema: Schema<IExperience> = new Schema<IExperience>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    employer: { type: String,  },
    company: {type: String},
    position: {type: String},
    startDate: { type: Date,  },
    endDate: { type: Date },
    country: { type: String },
    city: { type: String },
    zip: { type: String },
    jobDescription: { type: String },
    jobCategory: { type: String },
    careerField: { type: String },
    careerSubfield: { type: String }
  },
  { timestamps: true }
)

export const Experience = mongoose.model<IExperience, ExperienceModel>(
  'Experience',
  experienceSchema
)
