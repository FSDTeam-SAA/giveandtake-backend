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
      enum: ['complete', 'pending', 'failed', 'refunded'],
      default: 'pending',
    },
    duration: { type: String, enum: ['monthly', 'yearly', 'payg'] },
    seasonId: { type: String },
    transactionId: { type: String, required: true },
    paymentMethod: { type: String },
    refundDate: { type: Date },
    refundTransactionId: { type: String },
    planStatus: {
      type: String,
      enum: ['active', 'deactivate'],
      default: 'active',
    },
    consumedForJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
    },
    pitchRemovedAt: { type: Date },
    refundAdminFee: { type: Number, default: 0 },
    refundDeductions: { type: Number, default: 0 },
    refundNotes: { type: String },
    expiresAt: { type: Date },
    expiryReminderSentAt: { type: Date },
  },
  { timestamps: true }
)

// L10: a PayPal capture id is unique — prevent duplicate/replayed capture
// records from being written for the same transaction.
paymentInfoSchema.index({ transactionId: 1 }, { unique: true })

export const paymentInfo = mongoose.model<IPaymentInfo, PaymentInfoModel>(
  'PaymentInfo',
  paymentInfoSchema
)
