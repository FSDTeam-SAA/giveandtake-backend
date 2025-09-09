import { Document, Model, Types } from 'mongoose'

export type JobStatus = 'active' | 'deactivate'

export interface IApplicationRequirement {
  requirement: string
  status: string
}

export interface ICustomQuestion {
  question: string
  type: 'text' | 'multipleChoice' | 'boolean'
  options?: string[] // optional, for multiple choice
  required?: boolean
}

export interface IJob extends Document {
  userId: Types.ObjectId
  companyId: Types.ObjectId
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
  arcrivedJob: boolean
  jobCategoryId: Types.ObjectId
  compensation: string
  applicationRequirement: IApplicationRequirement[]
  customQuestion: ICustomQuestion[]
  jobApprove: string
  adminApprove: boolean
  publishDate: Date
  employement_Type: string
  website_Url: string
  location_Type: string
  career_Stage: string
  name: string,
  role: string
}

export interface JobModel extends Model<IJob> {}
