import mongoose, { Schema, Document, Model } from 'mongoose'
import { IAwarenessAndHonor } from '../interface/awardsAndHonor.interface'

const awarenessAndHonorSchema: Schema<IAwarenessAndHonor> = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    programeName: {
      type: String,
      required: true,
      trim: true,
    },
    programeDate: {
      type: Date,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
)

export const AwarenessAndHonor: Model<IAwarenessAndHonor> = mongoose.model(
  'AwarenessAndHonor',
  awarenessAndHonorSchema
)
