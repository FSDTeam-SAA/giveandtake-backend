import { User } from '../models/user.model'
import { paymentInfo as PaymentInfo } from '../models/paymentInfo.model'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import AppError from '../errors/AppError'
import httpStatus from 'http-status'
import { isPaymentExpired, resolvePaymentExpiry } from '../utils/subscription'

export const ELEVATOR_PITCH_LIMITS = {
  candidateFreeSeconds: 30,
  paidOrBusinessSeconds: 60,
  durationToleranceSeconds: 0.5,
} as const

const hasValidDuration = (duration: number) =>
  Number.isFinite(duration) && duration > 0

export const validateElevatorPitchAccess = async (
  userId: string,
  duration: number
): Promise<void> => {
  if (!hasValidDuration(duration)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Unable to read video duration. Please upload a valid video file'
    )
  }

  const user = await User.findById(userId)
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found')

  const role = user.role
  const now = new Date()

  let maxDuration: number = ELEVATOR_PITCH_LIMITS.candidateFreeSeconds
  let isCandidateFreeTier = false

  if (role === 'candidate') {
    const plan = await PaymentInfo.findOne({
      userId,
      paymentStatus: 'complete',
      planStatus: 'active',
    }).sort({ createdAt: -1 })

    if (!plan) {
      isCandidateFreeTier = true
    } else {
      const expiryDate = resolvePaymentExpiry(plan)
      const expired = isPaymentExpired(plan, now)

      if (expiryDate && (!plan.expiresAt || plan.expiresAt.getTime() !== expiryDate.getTime())) {
        plan.expiresAt = expiryDate
      }

      if (expired) {
        plan.planStatus = 'deactivate'
        await plan.save()
        await ElevatorPitch.updateOne(
          { userId },
          { $set: { status: 'deactivate' } }
        )
        isCandidateFreeTier = true
      } else {
        if (plan.isModified('expiresAt')) {
          await plan.save()
        }
        maxDuration = ELEVATOR_PITCH_LIMITS.paidOrBusinessSeconds
      }
    }
  } else if (['recruiter', 'company'].includes(role)) {
    maxDuration = ELEVATOR_PITCH_LIMITS.paidOrBusinessSeconds
  }

  if (duration > maxDuration + ELEVATOR_PITCH_LIMITS.durationToleranceSeconds) {
    if (isCandidateFreeTier) {
      throw new AppError(
        httpStatus.PAYMENT_REQUIRED,
        'Kindly subscribe to upload videos over your free 30 seconds allowance'
      )
    }

    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Maximum allowed video duration is ${maxDuration} seconds for your plan`
    )
  }
}
