import { Document, Model, Schema, Types } from 'mongoose'

export type AccountType = 'candidat' | 'reqruter' | 'admin'

export interface IRecruiterAccount extends Document {
  userId: Schema.Types.ObjectId
  type: AccountType
  videoFile: string
  bio: string
  photo: string
  title: string
  firstName: string
  lastName: string
  sureName: string
  country: string
  city: string
  zipCode: string
  emailAddress: string
  location: string

  companyName: string
  companyWebsite: string
  companyCountry: string
  companyCity: string
  roleAtCompany: string
  companyLogo: string

  careerField: string
  careerSubField: string
  summary: string
}

export interface RecruiterAccountModel extends Model<IRecruiterAccount> {}
