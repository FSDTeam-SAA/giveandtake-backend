import { Document, Model, Types } from 'mongoose'

export type ResumeType = 'candidate' | 'recruiter' | 'admin'

export interface IResumeLink {
  label: string
  url: string
}

export interface ICreateResume extends Document {
  userId: Types.ObjectId
  type: ResumeType
  videoFile: string
  photo: string
  title: string
  firstName: string
  lastName: string
  sureName: string
  country: string
  city: string
  zipCode: string
  email: string
  location: string
  sLink: IResumeLink[]
  skills: string[]
  skillProficiency: string
  jobType: string
  yearOfExperience: number
  professionalSummary: string
  experienceId: Types.ObjectId[]
  educationId: Types.ObjectId[] 
}

export interface CreateResumeModel extends Model<ICreateResume> {}
