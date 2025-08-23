import { Document, Model, Types } from 'mongoose'

export interface IExperience extends Document {
  userId: Types.ObjectId
  employer: string
  firstName: string
  company: string
  position: string
  startDate: Date
  endDate: Date
  country: string
  city: string
  zip: string
  jobDescription: string
  jobCategory: string
  careerField: string
  careerSubfield: string
  resumeId: Types.ObjectId
}

export interface ExperienceModel extends Model<IExperience> {}
