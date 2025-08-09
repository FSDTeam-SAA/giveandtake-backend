import { Request, Response } from 'express'
import httpStatus from 'http-status'
import mongoose from 'mongoose'
import { AppliedJob } from '../models/appliedJob.model'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import { buildMetaPagination, getPaginationParams } from '../utils/pagination';
import { CreateResume } from '../models/createResume.model';
import { Education } from '../models/education.model';
import { Experience } from '../models/experience.model';
import { ElevatorPitch } from '../models/elevatorPitch.model';
import { AwardsAndHonor } from '../models/awardsAndHonor.model'


/***************
 * CREATE Application
 ***************/
export const applyForJob = catchAsync(async (req: Request, res: Response) => {
  const { jobId, userId, status, resumeId } = req.body

  const exists = await AppliedJob.findOne({ jobId, userId, resumeId: resumeId })
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

/****************************
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
    ).populate("resumeId")

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
    const { page, limit, skip } = getPaginationParams(req.query)

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid User ID')
    }

    const filter: any = { userId }
    if (status) filter.status = status

    const totalItems = await AppliedJob.countDocuments(filter)

    const applications = await AppliedJob.find(filter)
      .populate('jobId')
      .populate('userId', 'name email')
      .populate("resumeId")
      .skip(skip)
      .limit(limit)

    const createResume = await CreateResume.findOne({ userId }).lean()

    const education = await Education.find({ userId })

    const experience = await Experience.find({ userId })

    const awardsAndHonor = await AwardsAndHonor.find({ userId })

    const elevatorPitch = await ElevatorPitch.findOne({ userId })



    const meta = buildMetaPagination(totalItems, page, limit)

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Applications fetched by user',
      meta,
      data: {
        applications,
        createResume,
        education,
        experience,
        elevatorPitch,
        awardsAndHonor,
      },
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
