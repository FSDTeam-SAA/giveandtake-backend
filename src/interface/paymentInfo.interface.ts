import { Document, Model, Types } from 'mongoose'

export type PaymentStatus = 'complete' | 'pending' | 'failed' | 'refunded'

export interface IPaymentInfo extends Document {
  userId: Types.ObjectId
  amount: number
  jobPostCredits?: number | null
  jobPostsUsed?: number
  refundProcessing?: boolean
  planId: Types.ObjectId
  planType: string
  paymentStatus: PaymentStatus
  seasonId: string
  duration: 'monthly' | 'yearly' | 'payg' | string
  transactionId: string
  refundTransactionId: string
  paymentMethod: string
  planStatus: string
  createdAt?: Date
  refundDate?: Date
  updatedAt?: Date
  consumedForJobId?: Types.ObjectId
  pitchRemovedAt?: Date
  refundAdminFee?: number
  refundDeductions?: number
  refundNotes?: string
  expiresAt?: Date
  expiryReminderSentAt?: Date
  userDeletedAt?: Date
  storePlatform?: 'apple' | 'google'
  /** Apple originalTransactionId or Google purchaseToken. */
  storeSubscriptionId?: string
  storeProductId?: string
  storeEnvironment?: 'production' | 'sandbox'
  /** Expiry as last reported by the store (expiresAt may carry an outage grace). */
  storeExpiresAt?: Date
  storeAutoRenew?: boolean
  storeLastSyncedAt?: Date
}

export interface PaymentInfoModel extends Model<IPaymentInfo> {}
