import mongoose, { Schema } from 'mongoose'
import {
  IRecruiterAccount,
  RecruiterAccountModel,
} from '../interface/recruiterAccount.interface'

const recruiterAccountSchema: Schema<IRecruiterAccount> =
  new Schema<IRecruiterAccount>(
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      bio: { type: String },
      aboutUs: { type: String },
      banner: {type:String},
      photo: { type: String },
      title: { type: String },
      firstName: { type: String },
      lastName: { type: String },
      sureName: { type: String },
      country: { type: String },
      city: { type: String },
      zipCode: { type: String },
      location: { type: String },
      emailAddress: { type: String },
      phoneNumber: { type: String },
      roleAtCompany: { type: String },
      awardTitle: { type: String },
      slug: { type: String },
      programName: { type: String },
      programDate: { type: String },
      awardDescription: { type: String },
      companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company'},
      sLink: [
        {
          label: { type: String },
          url: { type: String },
        },
      ],
    },
    { timestamps: true }
  )

export const RecruiterAccount = mongoose.model<
  IRecruiterAccount,
  RecruiterAccountModel
>('RecruiterAccount', recruiterAccountSchema)
