import { Document, Model } from 'mongoose'

export type SubscriptionTarget = 'candidate' | 'recruiter'

export interface ISubscriptionPlan extends Document {
  title: string
  description: string
  price: number
  features: string[]
  for: SubscriptionTarget
  valid: String
}

export interface SubscriptionPlanModel extends Model<ISubscriptionPlan> {}
