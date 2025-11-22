import { Types } from 'mongoose'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { paymentInfo } from '../models/paymentInfo.model'
import { Job } from '../models/job.model'
import { User } from '../models/user.model'

export type JobPostingUsage = {
  paywallEnabled: boolean
  allowed: boolean
  message?: string
  role?: string
  plan?: {
    id?: Types.ObjectId
    title?: string
    valid?: string
    for?: string
    maxJobPostsPerYear?: number
    maxJobPostsPerMonth?: number
  }
  billing?: {
    duration?: string
    expiresAt?: Date | null
    cycleStart?: Date | null
    cycleEnd?: Date | null
    annualStart?: Date | null
    annualEnd?: Date | null
  }
  usage?: {
    monthlyLimit?: number
    monthlyUsed?: number
    monthlyRemaining?: number
    annualLimit?: number
    annualUsed?: number
    annualRemaining?: number
  }
}

const isPaywallEnabled = () =>
  (process.env.JOB_POST_PAYWALL_ENABLED ?? 'true').toLowerCase() !== 'false'

const addMonths = (date: Date, months: number) => {
  const copy = new Date(date)
  copy.setMonth(copy.getMonth() + months)
  return copy
}

const addYears = (date: Date, years: number) => {
  const copy = new Date(date)
  copy.setFullYear(copy.getFullYear() + years)
  return copy
}

const monthsBetween = (start: Date, end: Date) => {
  const diffYears = end.getFullYear() - start.getFullYear()
  const diffMonths = end.getMonth() - start.getMonth()
  let total = diffYears * 12 + diffMonths

  const anchor = addMonths(start, total)
  if (anchor > end) {
    total -= 1
  }

  return Math.max(total, 0)
}

const resolveCurrentMonthlyCycle = (start: Date, reference: Date) => {
  const elapsedMonths = monthsBetween(start, reference)
  const cycleStart = addMonths(start, elapsedMonths)
  const cycleEnd = addMonths(cycleStart, 1)
  return { cycleStart, cycleEnd }
}

const normalizeValid = (value?: string | null) =>
  (value ?? '').toLowerCase()

const computeMonthlyLimit = (
  maxPerMonth?: number,
  maxPerYear?: number
): number | undefined => {
  if (typeof maxPerMonth === 'number') return maxPerMonth
  if (typeof maxPerYear === 'number') {
    return Math.max(1, Math.ceil(maxPerYear / 12))
  }
  return undefined
}

const buildLimitError = (
  remainingText: string,
  cycleEnds?: Date | null
): string => {
  if (cycleEnds) {
    return `${remainingText} Next renewal: ${cycleEnds.toDateString()}.`
  }
  return remainingText
}

export const evaluateJobPostingAllowance = async (
  userId: Types.ObjectId,
  options?: { suppressErrors?: boolean }
): Promise<JobPostingUsage> => {
  const suppressErrors = options?.suppressErrors ?? false
  const allowance: JobPostingUsage = {
    paywallEnabled: isPaywallEnabled(),
    allowed: true,
  }

  const user = await User.findById(userId)
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  allowance.role = user.role

  // Candidates are not restricted by the job-post paywall
  if (user.role === 'candidate') {
    return allowance
  }

  const latestPayment = await paymentInfo
    .findOne({
      userId,
      paymentStatus: 'complete',
    })
    .sort({ updatedAt: -1 })
    .populate('planId')

  if (!latestPayment || !latestPayment.planId) {
    allowance.allowed = !allowance.paywallEnabled
    const message = allowance.paywallEnabled
      ? 'Job posting paywall is enabled. Please purchase a subscription or PAYG voucher.'
      : undefined
    allowance.message = message
    if (!allowance.allowed && !suppressErrors) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        message ?? 'Job posting paywall is enabled.'
      )
    }
    return allowance
  }

  const plan: any = latestPayment.planId
  const planValid = normalizeValid(plan?.valid)
  const duration = (latestPayment.duration ?? planValid) as string
  const planFor = (plan?.for ?? '').toString().toLowerCase()

  allowance.plan = {
    id: plan?._id,
    title: plan?.title,
    valid: plan?.valid,
    for: planFor,
    maxJobPostsPerYear: plan?.maxJobPostsPerYear,
    maxJobPostsPerMonth: plan?.maxJobPostsPerMonth,
  }

  // Non company/recruiter plans should not block job posts
  if (!['company', 'recruiter'].includes(planFor)) {
    return allowance
  }

  const planStart =
    latestPayment.updatedAt ??
    latestPayment.createdAt ??
    new Date()

  const expiresAt =
    duration === 'monthly'
      ? addMonths(planStart, 1)
      : duration === 'yearly'
      ? addYears(planStart, 1)
      : null

  const now = new Date()

  const monthlyLimit = computeMonthlyLimit(
    plan?.maxJobPostsPerMonth,
    plan?.maxJobPostsPerYear
  )
  const annualLimit =
    typeof plan?.maxJobPostsPerYear === 'number'
      ? plan.maxJobPostsPerYear
      : undefined

  if (
    allowance.paywallEnabled &&
    planValid !== 'payasyougo' &&
    monthlyLimit === undefined &&
    annualLimit === undefined
  ) {
    allowance.allowed = false
    const message =
      'Job posting limits are not configured for this plan. Please update the plan settings.'
    allowance.message = message
    if (!suppressErrors) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        message
      )
    }
    return allowance
  }

  const { cycleStart, cycleEnd } =
    duration === 'monthly'
      ? resolveCurrentMonthlyCycle(planStart, now)
      : { cycleStart: null, cycleEnd: null }

  const annualStart = planStart ?? null
  const annualEnd =
    duration === 'yearly' || duration === 'monthly'
      ? addYears(planStart, 1)
      : null

  allowance.billing = {
    duration,
    expiresAt,
    cycleStart,
    cycleEnd,
    annualStart,
    annualEnd,
  }

  const monthlyUsed =
    monthlyLimit !== undefined && cycleStart && cycleEnd
      ? await Job.countDocuments({
          userId,
          createdAt: { $gte: cycleStart, $lt: cycleEnd },
        })
      : undefined

  const annualUsed =
    annualLimit !== undefined && annualStart && annualEnd
      ? await Job.countDocuments({
          userId,
          createdAt: { $gte: annualStart, $lt: annualEnd },
        })
      : undefined

  allowance.usage = {
    monthlyLimit,
    monthlyUsed,
    monthlyRemaining:
      monthlyLimit !== undefined && monthlyUsed !== undefined
        ? Math.max(monthlyLimit - monthlyUsed, 0)
        : undefined,
    annualLimit,
    annualUsed,
    annualRemaining:
      annualLimit !== undefined && annualUsed !== undefined
        ? Math.max(annualLimit - annualUsed, 0)
        : undefined,
  }

  if (allowance.paywallEnabled) {
    if (expiresAt && expiresAt < now) {
      allowance.allowed = false
      allowance.message =
        'Your subscription has expired. Please renew to post more jobs.'
    }

    if (
      allowance.allowed &&
      duration === 'monthly' &&
      monthlyLimit !== undefined &&
      monthlyUsed !== undefined &&
      monthlyUsed >= monthlyLimit
    ) {
      allowance.allowed = false
      allowance.message = buildLimitError(
        `You have reached your monthly job post limit (${monthlyLimit}).`,
        cycleEnd
      )
    }

    if (
      allowance.allowed &&
      annualLimit !== undefined &&
      annualUsed !== undefined &&
      annualUsed >= annualLimit
    ) {
      allowance.allowed = false
      allowance.message = buildLimitError(
        `You have reached your annual job post limit (${annualLimit}).`,
        annualEnd
      )
    }
  }

  if (!allowance.allowed && !suppressErrors) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      allowance.message ?? 'You cannot post more jobs right now.'
    )
  }

  return allowance
}

export const assertJobPostingAllowance = async (userId: Types.ObjectId) => {
  return evaluateJobPostingAllowance(userId)
}

