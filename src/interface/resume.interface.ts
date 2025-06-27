import { Document, Model } from 'mongoose'

export interface IResumeFile {
  filename: string
  url: string
  uploadedAt: Date
}

export interface IResume extends Document {
  userId: string
  file: IResumeFile[]
  uploadDate: Date
  skills: string[]
}

export interface ResumeModel extends Model<IResume> {}
