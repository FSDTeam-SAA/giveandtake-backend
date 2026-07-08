import { Document, Model, Types } from 'mongoose'
import { IResumeLink } from './createResume.interface'

export interface ICompany extends Document {
  userId?: number
  clogo?: string
  banner: string
  aboutUs?: string
  cname: string
  country: string
  city: string
  zipcode?: string
  slug: string
  cemail: string
  cPhoneNumber: string
  sLink?: IResumeLink[]
  industry?: string
  service?: string[]
  employeesId: Types.ObjectId[] // references to User
}

export type CompanyModel = Model<ICompany>
