import { User } from '../models/user.model'
import { paymentInfo as PaymentInfo } from '../models/paymentInfo.model'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import AppError from '../errors/AppError'
import httpStatus from 'http-status'
import { isPaymentExpired, resolvePaymentExpiry } from '../utils/subscription'

export const validateElevatorPitchAccess = async (
  userId: string,
  duration: number
): Promise<void> => {
  const user = await User.findById(userId)
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found')

  const role = user.role
  const now = new Date()

  const plan = await PaymentInfo.findOne({
    userId,
    paymentStatus: 'complete',
    planStatus: 'active',
  }).sort({ createdAt: -1 })

  let maxDuration = 30 // default max duration

  // Role-based logic
  if (role === 'candidate') {
    if (!plan) {
      if (duration > 30) {
        throw new AppError(
          httpStatus.PAYMENT_REQUIRED,
          'Kindly subscribe to upload videos over your free 30 seconds allowance'
        )
      }
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
        throw new AppError(
          httpStatus.FORBIDDEN,
          'Subscription expired. Renew to upload pitch'
        )
      } else if (plan.isModified('expiresAt')) {
        await plan.save()
      }

      maxDuration = 60
    }
  } else if (['recruiter', 'company'].includes(role)) {
    if (plan) {
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
        throw new AppError(
          httpStatus.FORBIDDEN,
          'Subscription expired. Renew to upload pitch'
        )
      } else if (plan.isModified('expiresAt')) {
        await plan.save()
      }

      maxDuration = 180
    } else {
      maxDuration = 60
    }
  }

  if (duration > maxDuration) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Maximum allowed video duration is ${maxDuration} seconds for your plan`
    )
  }
}
