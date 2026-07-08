import catchAsync from '../utils/catchAsync'
import { Request, Response, NextFunction } from 'express'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import AppError from '../errors/AppError'
import httpStatus from 'http-status'
import { AppliedJob } from '../models/appliedJob.model'
import { Job } from '../models/job.model'

export const checkVideoAccess = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params // ElevatorPitch ID
    const userId = req.user?._id // From auth middleware

    const pitch = await ElevatorPitch.findById(id).populate('userId', 'role') // populate role
    if (!pitch) {
      throw new AppError(httpStatus.NOT_FOUND, 'Elevator pitch not found')
    }

    const ownerRole = (pitch.userId as any).role

    // If the pitch owner is a recruiter or company, allow everyone
    if (ownerRole === 'recruiter' || ownerRole === 'company') {
      return next()
    }

    // Check if the user is the owner
    if (pitch.userId._id.toString() === userId.toString()) {
      return next()
    }

    // Check if the user is an applicant for a job where this pitch was submitted
    const appliedJob = await AppliedJob.findOne({
      userId: pitch.userId, // The pitch owner applied for a job
    })

    if (!appliedJob) {
      throw new AppError(httpStatus.FORBIDDEN, 'Access denied')
    }

    // Check if the requesting user is the job poster
    const job = await Job.findById(appliedJob.jobId)
    if (job && job.userId.toString() === userId) {
      return next()
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
