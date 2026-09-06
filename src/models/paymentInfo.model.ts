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
    jobPostCredits: { type: Number, min: 0 },
    jobPostsUsed: { type: Number, min: 0 },
    refundProcessing: { type: Boolean, default: false },
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
    duration: { type: String, enum: ['monthly', 'yearly', 'payg', 'credits'] },
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
    userDeletedAt: { type: Date },
  },
  { timestamps: true }
)

// Both the webhook and checkout confirmation can fulfil the same payment.
paymentInfoSchema.index({ transactionId: 1 }, { name: 'unique_credit_transaction', unique: true, partialFilterExpression: { duration: 'credits' } })

export const paymentInfo = mongoose.model<IPaymentInfo, PaymentInfoModel>(
  'PaymentInfo',
  paymentInfoSchema
)
