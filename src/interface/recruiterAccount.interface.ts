import { Document, Model, Schema, Types } from 'mongoose'

export type AccountType = 'candidat' | 'reqruter' | 'admin'

export interface IRecruiterAccount extends Document {
  userId: Schema.Types.ObjectId
  bio: string
  aboutUs: string
  banner: string
  photo: string
  title: string
  firstName: string
  lastName: string
  sureName: string
  country: string
  city: string
  zipCode: string
  emailAddress: string
  phoneNumber: string
  location: string
  roleAtCompany: string
  slug: string
  awardTitle: string
  programName: string
  programDate: string
  awardDescription: string
  companyId: Types.ObjectId
  sLink: string[]
}

export interface RecruiterAccountModel extends Model<IRecruiterAccount> {}
