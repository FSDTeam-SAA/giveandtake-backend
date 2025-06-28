import { Document, Model, Types } from 'mongoose'

export interface IExperience extends Document {
  userId: Types.ObjectId
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
  resumeId: Types.ObjectId
}

export interface ExperienceModel extends Model<IExperience> {}
