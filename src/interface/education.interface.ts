import { Document, Model, Types } from 'mongoose'

export interface IEducation extends Document {
  userId: Types.ObjectId
  uniName: string
  city: string
  state: string
  degree: string
  fieldOfStudy: string
  graduationDate: Date
  resumeId: Types.ObjectId
}

export interface EducationModel extends Model<IEducation> {}
