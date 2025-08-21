import { Document, Model } from 'mongoose'

export interface IJobCategory extends Document {
  name: string
  role: [string]
  categoryIcon: string
}

export interface JobCategoryModel extends Model<IJobCategory> {}
