import { Document, Model, Types } from 'mongoose'

export type JobStatus = 'active' | 'deactive'

export interface IApplicationRequirement {
  label: string
  value: string
}

export interface ICustomQuestion {
  question: string
  type: 'text' | 'multipleChoice' | 'boolean'
  options?: string[] // optional, for multiple choice
  required?: boolean
}

export interface IJob extends Document {
  title: string
  description: string
  companyName: string
  salaryRange: string
  location: string
  shift: string
  responsibilities: string[]
  educationExperience: string[]
  benefits: string[]
  vacancy: number
  experience: number
  deadline: Date
  status: JobStatus
  jobCategoryId: Types.ObjectId
  compensation: string
  applicationRequirement: IApplicationRequirement[]
  customQuestion: ICustomQuestion[]
}

export interface JobModel extends Model<IJob> {}
