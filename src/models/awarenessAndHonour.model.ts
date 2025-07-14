import mongoose, { Schema, Document, Model } from 'mongoose'
import { IAwarenessAndHonour } from '../interface/awarenessAndHonour.interface'

const awarenessAndHonourSchema: Schema<IAwarenessAndHonour> = new Schema(
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

export const AwarenessAndHonour: Model<IAwarenessAndHonour> = mongoose.model(
  'AwarenessAndHonour',
  awarenessAndHonourSchema
)
