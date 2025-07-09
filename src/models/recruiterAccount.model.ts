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
      type: {
        type: String,
        enum: ['candidat', 'reqruter', 'admin'],
        required: true,
      },
      videoFile: { type: String },
      bio: { type: String },
      photo: { type: String },
      title: { type: String },
      firstName: { type: String },
      lastName: { type: String },
      sureName: { type: String },
      country: { type: String },
      city: { type: String },
      zipCode: { type: String },
      emailAddress: { type: String },
      phoneNumber: { type: String },
      location: { type: String },
      
      upworkUrl: { type: String },
      linkedIn: { type: String },
      xLink: { type: String },
      OtherLink: { type: String },
      
      companyId: { type: String },
      roleAtCompany: { type: String },

      awardTitle: { type: String },
      programName : { type: String },
      programDate : { type: String },
      awardDescription : { type: String },

      

      
      // companyWebsite: { type: String },
      // companyLogo: { type: String },
      // companyCountry: { type: String },
      // companyCity: { type: String },
      // careerField: { type: String },
      // careerSubField: { type: String },
      // summary: { type: String },

    },
    { timestamps: true }
  )

export const RecruiterAccount = mongoose.model<
  IRecruiterAccount,
  RecruiterAccountModel
>('RecruiterAccount', recruiterAccountSchema)
