import mongoose, { Schema, Document, Model } from 'mongoose'
import { IAwardsAndHonor } from '../interface/awardsAndHonour.interface'

const AwardsAndHonorSchema: Schema<IAwardsAndHonor> = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,

      trim: true,
    },
    programeName: {
      type: String,

      trim: true,
    },
    programeDate: {
      type: Date,
    },
        issuer: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
    },
  },
  { timestamps: true }
)

export const AwardsAndHonor: Model<IAwardsAndHonor> = mongoose.model(
  'AwardsAndHonor',
  AwardsAndHonorSchema
)
