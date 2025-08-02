import { Document, Model, Schema, Types } from 'mongoose'

export type AccountType = 'candidat' | 'reqruter' | 'admin'

export interface IRecruiterAccount extends Document {
  userId: Schema.Types.ObjectId
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
  phoneNumber: string
  location: string

  upworkUrl: string
  linkedIn: string
  xLink: string
  OtherLink: string
  roleAtCompany: string
  awardTitle: string
  programName: string
  programDate: string
  awardDescription: string
  companyId: Types.ObjectId
}

export interface RecruiterAccountModel extends Model<IRecruiterAccount> {}
