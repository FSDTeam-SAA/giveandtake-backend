import { Types } from 'mongoose'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import { paymentInfo } from '../models/paymentInfo.model'
import { isPaymentExpired } from '../utils/subscription'
import { ELEVATOR_PITCH_LIMITS } from './validateElevatorPitchAccess'

export const EV_PITCH_REQUIRED_TO_APPLY_MESSAGE =
  'Please upload an EVPitch Video to apply for this role'

const toObjectId = (userId: string | Types.ObjectId) =>
  typeof userId === 'string' ? new Types.ObjectId(userId) : userId

export const assertUserCanApplyWithElevatorPitch = async (
  userId: string | Types.ObjectId
) => {
  if (typeof userId === 'string' && !Types.ObjectId.isValid(userId)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid user ID')
  }

  const pitch = await ElevatorPitch.findOne({
    userId: toObjectId(userId),
    status: 'active',
    'processing.state': 'ready',
    'video.hlsUrl': { $nin: [null, ''] },
  })

  if (!pitch) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      EV_PITCH_REQUIRED_TO_APPLY_MESSAGE
    )
  }

  const duration = Number(pitch.metadata?.duration ?? 0)
  const isPaidLengthPitch =
    duration >
    ELEVATOR_PITCH_LIMITS.candidateFreeSeconds +
      ELEVATOR_PITCH_LIMITS.durationToleranceSeconds

  if (!isPaidLengthPitch) return

  const activePaidPlan = await paymentInfo.findOne({
    userId: toObjectId(userId),
    paymentStatus: 'complete',
    planStatus: 'active',
    duration: { $in: ['monthly', 'yearly'] },
  })

  if (activePaidPlan && !isPaymentExpired(activePaidPlan)) return

  pitch.status = 'deactivate'
  await pitch.save()

  throw new AppError(
    httpStatus.BAD_REQUEST,
    EV_PITCH_REQUIRED_TO_APPLY_MESSAGE
  )
}
