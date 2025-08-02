import { Types } from 'mongoose'
import { paymentInfo } from '../models/paymentInfo.model'
import AppError from '../errors/AppError'
import httpStatus from 'http-status'
import { Job } from '../models/job.model'


type PlanLimit = {
  [key: string]: number | 'unlimited'
}

const PLAN_LIMITS: PlanLimit = {
  basic: 24,
  bronze: 36,
  silver: 48,
  gold: 60,
  platinum: 'unlimited',
}

export const checkIfUserCanPostJob = async (userId: Types.ObjectId) => {
  const existingJobs = await Job.find({ userId })

  // Allow one free post if no jobs exist and no active plan
  if (existingJobs.length === 0) return

  const latestPayment = await paymentInfo
    .findOne({
      userId,
      paymentStatus: 'complete',
      planType: { $ne: 'payAsYouGo' },
    })
    .sort({ createdAt: -1 })

  if (!latestPayment || !latestPayment.createdAt) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You need a subscription to post more jobs'
    )
  }

  const { planType, duration } = latestPayment
  const planStart = new Date(latestPayment.createdAt)
  const now = new Date()

  const isExpired =
    duration === 'monthly'
      ? now > new Date(planStart.setMonth(planStart.getMonth() + 1))
      : duration === 'yearly'
      ? now > new Date(planStart.setFullYear(planStart.getFullYear() + 1))
      : true

  if (isExpired) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Your plan has expired. Please renew to post more jobs'
    )
  }

  const limit = PLAN_LIMITS[planType ?? '']
  if (limit === 'unlimited') return

  const jobCount = await Job.countDocuments({ userId })

  if (jobCount >= (limit as number)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      `You have reached your job posting limit for the ${planType} plan`
    )
  }
}

