import { Document, Model } from 'mongoose'
import type { LocalPrices } from '../utils/currency'

export type SubscriptionTarget = 'candidate' | 'recruiter' | 'company'

export interface ISubscriptionPlan extends Document {
  title: string
  titleColor?: string
  description: string
  price: number
  localPrices?: LocalPrices
  features: string[]
  for: SubscriptionTarget
  valid: string
  jobPostCredits?: number | null
  archived?: boolean
  maxJobPostsPerYear?: number
  maxJobPostsPerMonth?: number
}

export interface SubscriptionPlanModel extends Model<ISubscriptionPlan> {}
