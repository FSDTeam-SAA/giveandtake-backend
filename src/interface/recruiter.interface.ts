import { Document, Model, Types } from 'mongoose'

export interface IRecruiter extends Document {
  companyName: string
  email: string
  logo: string
  companyDetails: string
  companyWebsite: string
  userId: Types.ObjectId
}

export interface RecruiterModel extends Model<IRecruiter> {}
