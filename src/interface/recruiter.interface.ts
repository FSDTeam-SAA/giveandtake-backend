import { Document, Model } from 'mongoose'

export interface IRecruiter extends Document {
  companyName: string
  email: string
  logo: string
  companyDetails: string
  companyWebsite: string
  userId: string
}

export interface RecruiterModel extends Model<IRecruiter> {}
