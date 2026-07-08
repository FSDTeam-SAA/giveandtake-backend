import { Document, Model, Types } from 'mongoose'

export interface IResumeFile {
  _id?: Types.ObjectId
  filename: string
  url: string
  key?: string
  uploadedAt: Date
}

export interface IResume extends Document {
  userId: Types.ObjectId
  file: IResumeFile[]
  uploadDate: Date
  visaSponsorship: string
}

export interface ResumeModel extends Model<IResume> {}
