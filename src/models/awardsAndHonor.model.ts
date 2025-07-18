import mongoose, { Schema, Document, Model } from 'mongoose'
import { IAwarenessAndHonor } from '../interface/awardsAndHonour.interface'

const awarenessAndHonorSchema: Schema<IAwarenessAndHonor> = new Schema(
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
    description: {
      type: String,
    },
  },
  { timestamps: true }
)

export const AwardsAndHonor: Model<IAwarenessAndHonor> = mongoose.model(
  'AwarenessAndHonor',
  awarenessAndHonorSchema
)
