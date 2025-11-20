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
      features: [{ type: String }],
      for: {
        type: String,
        enum: ['candidate', 'recruiter', 'company'],
        required: true,
      },
      valid:{
        type: String,
        enum: ["monthly","yearly","PayAsYouGo"]
      },
      maxJobPostsPerYear: { type: Number },
      maxJobPostsPerMonth: { type: Number },
    },
    { timestamps: true }
  )

export const SubscriptionPlan = mongoose.model<
  ISubscriptionPlan,
  SubscriptionPlanModel
>('SubscriptionPlan', subscriptionPlanSchema)
