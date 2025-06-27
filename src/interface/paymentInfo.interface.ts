import { Document, Model } from 'mongoose'

export type PaymentStatus = 'complete' | 'pending' | 'failed'

export interface IPaymentInfo extends Document {
  userId: string
  amount: number
  planId: string
  paymentStatus: PaymentStatus
  season: string
  transactionId: string
  paymentMethod: string
}

export interface PaymentInfoModel extends Model<IPaymentInfo> {}
