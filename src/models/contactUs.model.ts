import mongoose, { Schema } from 'mongoose'
import { IContactUs, ContactUsModel } from '../interface/contactUs.interface'

const contactUsSchema: Schema<IContactUs> = new Schema<IContactUs>(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    address: { type: String },
    phoneNumber: { type: String },
    subject: { type: String, required: true },
    message: {
      type: String,
      required: true,
      validate: {
        validator: (value: string) => (value.match(/\S+/g) ?? []).length <= 50,
        message: 'Message cannot exceed 50 words.',
      },
    },
  },
  { timestamps: true }
)

export const ContactUs = mongoose.model<IContactUs, ContactUsModel>(
  'ContactUs',
  contactUsSchema
)
