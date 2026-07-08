import { Document, Model, Types } from 'mongoose'

export interface IEducation extends Document {
  userId: Types.ObjectId
  instituteName: string
  city: string
  country: string
  degree: string
  fieldOfStudy: string
  graduationDate: Date
  startDate: Date
}

export interface EducationModel extends Model<IEducation> {}
