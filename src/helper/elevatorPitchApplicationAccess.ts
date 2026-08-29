import { Types } from 'mongoose'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import { isCandidatePitchAvailable } from '../services/candidatePitchEntitlement.service'

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

  if (await isCandidatePitchAvailable(pitch, toObjectId(userId))) return

  throw new AppError(httpStatus.BAD_REQUEST, EV_PITCH_REQUIRED_TO_APPLY_MESSAGE)
}
