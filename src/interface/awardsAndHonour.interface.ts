import mongoose, { Document } from 'mongoose'

export interface IAwardsAndHonor extends Document {
  userId: mongoose.Types.ObjectId
  title: string
  programeName: string
  programeDate: Date
  description: string,
  issuer: string
}
