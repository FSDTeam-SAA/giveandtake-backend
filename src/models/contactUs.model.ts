import mongoose, { Schema } from 'mongoose'
import { IContactUs, ContactUsModel } from '../interface/contactUs.interface'

const contactUsSchema: Schema<IContactUs> = new Schema<IContactUs>(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    address: { type: String, maxlength: 254 },
    phoneNumber: { type: String },
    subject: {
      type: String,
      required: true,
      maxlength: [50, 'Subject cannot exceed 50 characters.'],
    },
    message: {
      type: String,
      required: true,
      maxlength: [500, 'Message cannot exceed 500 characters.'],
    },
  },
  { timestamps: true }
)

export const ContactUs = mongoose.model<IContactUs, ContactUsModel>(
  'ContactUs',
  contactUsSchema
)
