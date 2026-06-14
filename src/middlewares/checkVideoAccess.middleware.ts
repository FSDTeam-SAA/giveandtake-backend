import catchAsync from '../utils/catchAsync'
import { Request, Response, NextFunction } from 'express'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import AppError from '../errors/AppError'
import httpStatus from 'http-status'
import { AppliedJob } from '../models/appliedJob.model'
import { Job } from '../models/job.model'
import { Company } from '../models/company.model'
import { RecruiterAccount } from '../models/recruiterAccount.model'
import { idToString, isPrivilegedRole } from '../utils/authz'

export const checkVideoAccess = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params // ElevatorPitch ID
    const requesterId = idToString(req.user?._id) // From auth middleware

    const pitch = await ElevatorPitch.findById(id).populate('userId', 'role') // populate role
    if (!pitch) {
      throw new AppError(httpStatus.NOT_FOUND, 'Elevator pitch not found')
    }

    const ownerRole = (pitch.userId as any)?.role
    const ownerId = idToString((pitch.userId as any)?._id ?? pitch.userId)

    // A recruiter/company pitch is public to any authenticated viewer.
    if (ownerRole === 'recruiter' || ownerRole === 'company') {
      return next()
    }

    // The owner can always view their own pitch; so can an admin.
    if (ownerId === requesterId || isPrivilegedRole(req.user?.role)) {
      return next()
    }

    // Otherwise this is a candidate's pitch: allow only a recruiter/company who
    // owns a job this candidate applied to. We must look across ALL of the
    // candidate's applications (not an arbitrary one) and resolve job ownership
    // the same way the applicants list does — direct poster, company owner, or
    // recruiter-account owner.
    const applications = await AppliedJob.find({ userId: ownerId }).select('jobId')
    if (applications.length === 0) {
      throw new AppError(httpStatus.FORBIDDEN, 'Access denied')
    }

    const jobIds = applications.map((a) => a.jobId)
    const jobs = await Job.find({ _id: { $in: jobIds } }).select(
      'userId companyId recruiterId'
    )

    // Direct ownership (the requester posted the job).
    if (jobs.some((job) => idToString(job.userId) === requesterId)) {
      return next()
    }

    // Company ownership (job posted under a company the requester owns).
    const companyIds = jobs.map((job) => job.companyId).filter(Boolean)
    if (companyIds.length > 0) {
      const companies = await Company.find({ _id: { $in: companyIds } }).select(
        'userId'
      )
      if (companies.some((c) => idToString(c.userId) === requesterId)) {
        return next()
      }
    }

    // Recruiter-account ownership (job posted under the requester's recruiter account).
    const recruiterIds = jobs.map((job) => job.recruiterId).filter(Boolean)
    if (recruiterIds.length > 0) {
      const recruiters = await RecruiterAccount.find({
        _id: { $in: recruiterIds },
      }).select('userId')
      if (recruiters.some((r) => idToString(r.userId) === requesterId)) {
        return next()
      }
    }

    throw new AppError(httpStatus.FORBIDDEN, 'Access denied')
  }
)

// export const checkVideoAccess = catchAsync(
//   async (req: Request, res: Response, next: NextFunction) => {
//     const { id } = req.params // ElevatorPitch ID
//     const userId = req.user?.id // From auth middleware

//     const pitch = await ElevatorPitch.findById(id)
//     if (!pitch) {
//       throw new AppError(httpStatus.NOT_FOUND, 'Elevator pitch not found')
//     }

//     // Check if the user is the owner
//     if (pitch.userId.toString() === userId) {
//       return next()
//     }

//     // Check if the user is an applicant for a job where this pitch was submitted
//     const appliedJob = await AppliedJob.findOne({
//       userId: pitch.userId, // The pitch owner applied for a job
//     })

//     if (!appliedJob) {
//       throw new AppError(httpStatus.FORBIDDEN, 'Access denied')
//     }

//     // Check if the requesting user is the job poster
//     const job = await Job.findById(appliedJob.jobId)
//     if (job && job.userId.toString() === userId) {
//       return next()
//     }

//     throw new AppError(httpStatus.FORBIDDEN, 'Access denied')
//   }
// )
