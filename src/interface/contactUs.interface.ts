import { Document, Model } from 'mongoose'

export interface IContactUs extends Document {
  firstName: string
  lastName: string
  address: string
  phoneNumber: string
  subject: string
  message: string
}

export interface ContactUsModel extends Model<IContactUs> {}
