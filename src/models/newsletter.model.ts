import mongoose, { Schema } from 'mongoose'
import { INewsletter, NewsletterModel } from '../interface/newsletter.interface'

const newsletterSchema: Schema<INewsletter> = new Schema<INewsletter>(
  {
    email: { type: String, required: true, unique: true },
  },
  { timestamps: true }
)

export const Newsletter = mongoose.model<INewsletter, NewsletterModel>(
  'Newsletter',
  newsletterSchema
)

