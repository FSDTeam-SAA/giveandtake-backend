import mongoose, { Schema } from 'mongoose'

const skillSchema= new Schema(
  {
    name: { type: String, required: true },
    categoryIcon: { type: String },
    active: { type: Boolean, default: true },
    normalizedKey: { type: String },
  },
  { timestamps: true }
)

skillSchema.index({ normalizedKey: 1 }, { unique: true, sparse: true });

export const SkillModel = mongoose.model(
  'SkillModel',
  skillSchema
)
