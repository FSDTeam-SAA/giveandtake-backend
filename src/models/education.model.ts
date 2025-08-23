import mongoose, { Schema } from 'mongoose'
import { IEducation, EducationModel } from '../interface/education.interface'

const educationSchema: Schema<IEducation> = new Schema<IEducation>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    instituteName: { type: String },
    city: { type: String },
    country: { type: String },
    degree: { type: String },
    fieldOfStudy: { type: String },
    startDate: { type: Date,  },
    graduationDate: { type: Date },
  },
  { timestamps: true }
)

export const Education = mongoose.model<IEducation, EducationModel>(
  'Education',
  educationSchema
)
