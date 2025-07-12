import mongoose, { Schema } from 'mongoose'
import {
  IPaymentInfo,
  PaymentInfoModel,
} from '../interface/paymentInfo.interface'

const paymentInfoSchema: Schema<IPaymentInfo> = new Schema<IPaymentInfo>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: { type: Number, required: true },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['complete', 'pending', 'failed'],
      default: 'pending',
    },
    seasonId: { type: String }, 
    transactionId: { type: String, required: true },
    paymentMethod: { type: String }, 
  },
  { timestamps: true }
)

export const paymentInfo = mongoose.model<IPaymentInfo, PaymentInfoModel>(
  'PaymentInfo',
  paymentInfoSchema
)
