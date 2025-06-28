import { Document, Model } from 'mongoose'

export interface IExperience extends Document {
  userId: string
  employer: string
  jobTitle: string
  firstName: string
  startDate: Date
  endDate: Date
  country: string
  city: string
  zip: string
  jobDescription: string
  careerField: string
  careerSubfield: string
  resumeId: string
}

export interface ExperienceModel extends Model<IExperience> {}
