import mongoose, { Schema } from 'mongoose'
import { IEducation, EducationModel } from '../interface/education.interface'

const educationSchema: Schema<IEducation> = new Schema<IEducation>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    instituteName: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    degree: { type: String, required: true },
    fieldOfStudy: { type: String, required: true },
    graduationDate: { type: Date, required: true },
  },
  { timestamps: true }
)

export const Education = mongoose.model<IEducation, EducationModel>(
  'Education',
  educationSchema
)
