import { Request, Response } from 'express'
import httpStatus from 'http-status'
import mongoose from 'mongoose'
import { AppliedJob } from '../models/appliedJob.model'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'

/***************
 * CREATE Application
 ***************/
export const applyForJob = catchAsync(async (req: Request, res: Response) => {
  const { jobId, userId, status } = req.body

  const exists = await AppliedJob.findOne({ jobId, userId })
  if (exists) {
    throw new AppError(httpStatus.CONFLICT, 'Already applied to this job')
  }

  const application = await AppliedJob.create({ jobId, userId, status })

  res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Application submitted',
    data: application,
  })
})

/***************
 * GET Applications by Job ID
 ***************/
export const getApplicationsByJob = catchAsync(
  async (req: Request, res: Response) => {
    const { jobId } = req.params

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid Job ID')
    }

    const applications = await AppliedJob.find({ jobId }).populate(
      'userId',
      'name email'
    )

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Applications fetched by job',
      data: applications,
    })
  }
)

/***************
 * GET Applications by User ID (with optional query)
 ***************/
export const getApplicationsByUser = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params
    const { status } = req.query

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid User ID')
    }

    const filter: any = { userId }
    if (status) filter.status = status

    const applications = await AppliedJob.find(filter).populate('jobId')

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Applications fetched by user',
      data: applications,
    })
  }
)

/***************
 * UPDATE Application Status
 ***************/
export const updateApplicationStatus = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params
    const { status } = req.body

    if (!['shortlisted', 'rejected'].includes(status)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid status value')
    }

    const updated = await AppliedJob.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    )

    if (!updated) {
      throw new AppError(httpStatus.NOT_FOUND, 'Application not found')
    }

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Application status updated',
      data: updated,
    })
  }
)

/***************
 * DELETE Application
 ***************/
export const deleteApplication = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params

    const deleted = await AppliedJob.findByIdAndDelete(id)

    if (!deleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Application not found')
    }

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Application deleted',
      data: deleted,
    })
  }
)
