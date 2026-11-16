import mongoose, { Schema } from 'mongoose'
import {
  ISubscriptionPlan,
  SubscriptionPlanModel,
} from '../interface/subscriptionPlan.interface'

const subscriptionPlanSchema: Schema<ISubscriptionPlan> =
  new Schema<ISubscriptionPlan>(
    {
      title: { type: String, required: true },
      titleColor: {type: String, required: false}, 
      description: { type: String, required: true },
      price: { type: Number, required: true },
      // Optional website prices in local currencies; `price` stays the USD base.
      localPrices: {
        GBP: { type: Number, min: 0 },
        EUR: { type: Number, min: 0 },
        CAD: { type: Number, min: 0 },
        AUD: { type: Number, min: 0 },
      },
      features: [{ type: String }],
      for: {
        type: String,
        enum: ['candidate', 'recruiter', 'company'],
        required: true,
      },
      valid:{
        type: String,
        enum: ["monthly","yearly","PayAsYouGo", "credits"]
      },
      maxJobPostsPerYear: { type: Number },
      jobPostCredits: { type: Number, min: 0 },
      archived: { type: Boolean, default: false },
      maxJobPostsPerMonth: { type: Number },
    },
    { timestamps: true }
  )

export const SubscriptionPlan = mongoose.model<
  ISubscriptionPlan,
  SubscriptionPlanModel
>('SubscriptionPlan', subscriptionPlanSchema)
