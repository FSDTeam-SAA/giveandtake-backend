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
    },
    planType: {
      type: String,
      enum: ['payAsYouGo', 'basic', 'bronze', 'silver', 'gold', 'platinum'],
    },
    paymentStatus: {
      type: String,
      enum: ['complete', 'pending', 'failed','refunded'],
      default: 'pending',
    },
    duration: { type: String, enum: ['monthly', 'yearly'] },
    seasonId: { type: String },
    transactionId: { type: String, required: true },
    paymentMethod: { type: String },
    refundDate:{type: Date},
    refundTransactionId: {type: String},
    planStatus: {
      type: String,
      enum: ['active', 'deactivate'],
      default: 'active',
    },
  },
  { timestamps: true }
)

export const paymentInfo = mongoose.model<IPaymentInfo, PaymentInfoModel>(
  'PaymentInfo',
  paymentInfoSchema
)
