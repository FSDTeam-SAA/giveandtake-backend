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
      bannerKey: { type: String },
      photo: { type: String },
      photoKey: { type: String },
      videoFile: { type: String },
      videoFileKey: { type: String },
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

// Drives people-search $lookup and the many findOne({ userId }) calls
recruiterAccountSchema.index({ userId: 1 }, { name: 'recruiter_user_idx' })

export const RecruiterAccount = mongoose.model<
  IRecruiterAccount,
  RecruiterAccountModel
>('RecruiterAccount', recruiterAccountSchema)
