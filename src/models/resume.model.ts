import mongoose, { Schema } from 'mongoose'
import { IResume, ResumeModel } from '../interface/resume.interface'

const resumeSchema: Schema<IResume> = new Schema<IResume>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    file: [
      {
        filename: { type: String, required: true },
        url: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    uploadDate: { type: Date, default: Date.now },
    skills: [{ type: String }],
  },
  { timestamps: true }
)

export const Resume = mongoose.model<IResume, ResumeModel>(
  'Resume',
  resumeSchema
)
