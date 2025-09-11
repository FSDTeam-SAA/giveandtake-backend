import mongoose, { Schema } from 'mongoose'

const skillSchema= new Schema(
  {
    name: { type: String, required: true },
    categoryIcon: { type: String },
  },
  { timestamps: true }
)

export const SkillModel = mongoose.model(
  'SkillModel',
  skillSchema
)
