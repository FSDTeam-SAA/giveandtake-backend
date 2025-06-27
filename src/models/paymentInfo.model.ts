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
    season: { type: String }, // e.g., "June 2025", or any billing cycle ID
    transactionId: { type: String, required: true },
    paymentMethod: { type: String }, // e.g., "PayPal", "Stripe", "Bkash"
  },
  { timestamps: true }
)

export const paymentInfo = mongoose.model<IPaymentInfo, PaymentInfoModel>(
  'PaymentInfo',
  paymentInfoSchema
)
