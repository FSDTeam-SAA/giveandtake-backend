import mongoose, { Schema, Model } from 'mongoose'
import { INotification } from '../interface/notification.interface'

const notificationSchema: Schema<INotification> = new Schema(
  {
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    isViewed: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      required: true,
    },
    id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { timestamps: true }
)

export const Notification: Model<INotification> = mongoose.model<INotification>(
  'Notification',
  notificationSchema
)
 