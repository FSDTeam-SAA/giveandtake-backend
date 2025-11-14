import { Document, Model, Types } from 'mongoose'

export type PaymentStatus = 'complete' | 'pending' | 'failed' | 'refunded'

export interface IPaymentInfo extends Document {
  userId: Types.ObjectId
  amount: number
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
}

export interface PaymentInfoModel extends Model<IPaymentInfo> {}
