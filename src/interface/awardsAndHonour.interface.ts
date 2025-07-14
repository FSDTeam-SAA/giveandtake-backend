import mongoose, { Document } from 'mongoose'

export interface IAwarenessAndHonor extends Document {
  userId: mongoose.Types.ObjectId
  title: string
  programeName: string
  programeDate: Date
  description: string
}
