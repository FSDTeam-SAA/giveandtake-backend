import catchAsync from '../utils/catchAsync'
import { Request, Response, NextFunction } from 'express'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import AppError from '../errors/AppError'
import httpStatus from 'http-status'
import { AppliedJob } from '../models/appliedJob.model'
import { Job } from '../models/job.model'
import { verifyToken } from '../utils/authToken'

export const PITCH_PLAYBACK_SECRET =
  process.env.PITCH_PLAYBACK_SECRET || process.env.JWT_ACCESS_SECRET || ''
export const PITCH_PLAYBACK_SCOPE = 'pitch-playback'

const PUBLIC_OWNER_ROLES = ['recruiter', 'company']

/**
 * Is `viewerId` allowed to watch a CANDIDATE's pitch?
 * Owner + admins + any recruiter/company who posted a job the candidate applied to.
 * (Company/recruiter pitches are public and never reach this function.)
 */
export const canViewCandidatePitch = async (
  pitch: { userId: any },
  viewer?: { _id: any; role?: string } | null
): Promise<boolean> => {
  if (!viewer?._id) return false

  const ownerId = pitch.userId?._id ?? pitch.userId
  const viewerId = viewer._id

  if (ownerId?.toString() === viewerId?.toString()) return true
  if (viewer.role === 'admin' || viewer.role === 'super-admin') return true

  // Recruiter/company whose posted job the candidate applied to
  const appliedJobs = await AppliedJob.find({ userId: ownerId }).select('jobId')
  if (appliedJobs.length === 0) return false
  const jobIds = appliedJobs.map((a) => a.jobId)
  const postedByViewer = await Job.exists({
    _id: { $in: jobIds },
    userId: viewerId,
  })
  return Boolean(postedByViewer)
}

/**
 * Resolve the viewer for a pitch request: either the header-authenticated user
 * (set by optionalAuth) or a valid short-lived `?t=` playback token that was
 * minted for THIS pitch.
 */
const resolveViewer = (
  req: Request,
  pitchId: string
): { _id: any; role?: string } | null => {
  if (req.user?._id) return req.user as any

  const raw = Array.isArray(req.query.t) ? req.query.t[0] : req.query.t
  if (typeof raw !== 'string' || !raw) return null
  try {
    const decoded = verifyToken<any>(raw, PITCH_PLAYBACK_SECRET)
    if (
      decoded?.scope === PITCH_PLAYBACK_SCOPE &&
      decoded?.pitchId === pitchId &&
      decoded?.viewerId
    ) {
      return { _id: decoded.viewerId, role: decoded.viewerRole }
    }
  } catch {
    // invalid/expired token → no viewer
  }
  return null
}

/**
 * Gate for the pitch media routes. Company/recruiter pitches stay fully public
 * (anonymous + mobile unaffected). Candidate pitches require an authorized
 * viewer via header token or `?t=` playback token.
 *
 * Handles both route shapes: `/stream/:id` (pitch _id) and
 * `/stream/:userId/:segment` + `/key/:userId/:key` (owner userId).
 */
export const gatePitchAccess = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    const { id, userId } = req.params

    const pitch = id
      ? await ElevatorPitch.findById(id).populate('userId', 'role')
      : await ElevatorPitch.findOne({ userId }).populate('userId', 'role')

    if (!pitch) {
      throw new AppError(httpStatus.NOT_FOUND, 'Elevator pitch not found')
    }

    const ownerRole = (pitch.userId as any)?.role

    // Public: company & recruiter pitches
    if (PUBLIC_OWNER_ROLES.includes(ownerRole)) return next()

    // Candidate (or unknown role): must be an authorized viewer
    const pitchId = (pitch._id as any).toString()
    const viewer = resolveViewer(req, pitchId)
    if (!viewer) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Login required to view this video')
    }
    const allowed = await canViewCandidatePitch(pitch as any, viewer)
    if (!allowed) {
      throw new AppError(httpStatus.FORBIDDEN, 'Access denied')
    }
    return next()
  }
)
