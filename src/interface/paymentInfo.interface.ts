import { Document, Model, Types } from 'mongoose'

export type PaymentStatus = 'complete' | 'pending' | 'failed'

export interface IPaymentInfo extends Document {
  userId: Types.ObjectId
  amount: number
  planId: Types.ObjectId
  paymentStatus: PaymentStatus
  season: string
  transactionId: string
  paymentMethod: string
}

export interface PaymentInfoModel extends Model<IPaymentInfo> {}
