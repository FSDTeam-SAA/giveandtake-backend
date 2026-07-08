import mongoose, { Schema } from 'mongoose'
import {
  IJobCategory,
  JobCategoryModel,
} from '../interface/jobCategory.interface'

const jobCategorySchema: Schema<IJobCategory> = new Schema<IJobCategory>(
  {
    name: { type: String, required: true },
    role: [{type: String}],
    categoryIcon: { type: String },
  },
  { timestamps: true }
)

export const JobCategory = mongoose.model<IJobCategory, JobCategoryModel>(
  'JobCategory',
  jobCategorySchema
)
