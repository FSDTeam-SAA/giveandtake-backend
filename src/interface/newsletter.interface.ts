import { Document, Model } from 'mongoose'

export interface INewsletter extends Document {
  email: string
}

export interface NewsletterModel extends Model<INewsletter> {}
