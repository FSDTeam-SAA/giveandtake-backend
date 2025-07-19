import { Document, Model, Types } from 'mongoose'

export interface ICompany extends Document {
  clogo?: string
  aboutUs?: string
  cname: string
  country: string
  city: string
  zipcode?: string
  cemail: string
  cPhoneNumber: string
  links?: string[]
  industry?: string
  service?: string[]
  employees?: number
  userId: Types.ObjectId[] // references to User
}

export type CompanyModel = Model<ICompany>
