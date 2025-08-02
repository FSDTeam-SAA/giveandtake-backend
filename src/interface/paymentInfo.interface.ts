import { Document, Model, Types } from 'mongoose'

export type PaymentStatus = 'complete' | 'pending' | 'failed'

export interface IPaymentInfo extends Document {
  userId: Types.ObjectId
  amount: number
  planId: Types.ObjectId
  planType: string
  paymentStatus: PaymentStatus
  seasonId: string
  duration: string
  transactionId: string
  paymentMethod: string
  planStatus: string
  createdAt?: Date
}

export interface PaymentInfoModel extends Model<IPaymentInfo> {}
