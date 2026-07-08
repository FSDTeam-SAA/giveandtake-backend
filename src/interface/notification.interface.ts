import mongoose, { Document } from 'mongoose'

export interface INotification extends Document {
  to: mongoose.Types.ObjectId
  message: string
  isViewed: boolean
  type: string
  id: mongoose.Types.ObjectId
}
