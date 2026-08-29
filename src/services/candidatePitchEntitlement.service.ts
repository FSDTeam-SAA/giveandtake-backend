import { Types } from 'mongoose'
import { ElevatorPitch, IElevatorPitch } from '../models/elevatorPitch.model'
import { paymentInfo } from '../models/paymentInfo.model'
import { isPaymentExpired, resolvePaymentExpiry } from '../utils/subscription'

export const CANDIDATE_FREE_PITCH_SECONDS = 30
export const PITCH_DURATION_TOLERANCE_SECONDS = 0.5

export const isPaidLengthCandidatePitch = (pitch: IElevatorPitch) => {
  const duration = Number(pitch.metadata?.duration)

  // Current uploads always contain probed metadata. For older ready documents
  // without metadata, require a paid plan rather than accidentally exposing a
  // legacy 60-second pitch after the subscription has ended.
  if (!Number.isFinite(duration) || duration <= 0) return true

  return (
    duration >
    CANDIDATE_FREE_PITCH_SECONDS + PITCH_DURATION_TOLERANCE_SECONDS
  )
}

/**
 * Return whether a candidate pitch may be presented or played right now.
 * Expired paid-length pitches are deactivated immediately, so API consumers
 * render the ordinary upload state without waiting for the nightly asset job.
 */
export const isCandidatePitchAvailable = async (
  pitch: IElevatorPitch,
  userId: string | Types.ObjectId = pitch.userId
) => {
  // Pending/failed uploads still need to reach the owner's processing UI. The
  // duration limit is enforced before transcoding in the upload flow.
  if (pitch.processing?.state !== 'ready') return true
  if (pitch.status !== 'active') return false
  if (!isPaidLengthCandidatePitch(pitch)) return true

  const activePlans = await paymentInfo
    .find({
      userId,
      paymentStatus: 'complete',
      planStatus: 'active',
    })
    .sort({ updatedAt: -1 })
    .populate('planId', 'valid')

  let hasCurrentPlan = false
  for (const plan of activePlans) {
    const validity = String(
      plan.duration || (plan.planId as any)?.valid || ''
    ).toLowerCase()
    if (validity !== 'monthly' && validity !== 'yearly') continue

    const expiryDate = resolvePaymentExpiry(plan)
    const expired = isPaymentExpired(plan)
    let shouldSave = false

    if (
      expiryDate &&
      (!plan.expiresAt || plan.expiresAt.getTime() !== expiryDate.getTime())
    ) {
      plan.expiresAt = expiryDate
      shouldSave = true
    }

    if (expired) {
      plan.planStatus = 'deactivate'
      shouldSave = true
    } else {
      hasCurrentPlan = true
    }

    if (shouldSave) await plan.save()
  }

  if (hasCurrentPlan) return true

  pitch.status = 'deactivate'
  await pitch.save()
  return false
}

export const getAvailableCandidatePitch = async (
  userId: string | Types.ObjectId
) => {
  const pitch = await ElevatorPitch.findOne({ userId })
  if (!pitch) return null
  return (await isCandidatePitchAvailable(pitch, userId)) ? pitch : null
}
