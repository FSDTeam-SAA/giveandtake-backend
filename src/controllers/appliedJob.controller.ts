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
import { createNotification } from '../sockets/notification.service'
import { Job } from '../models/job.model'


/***************
 * CREATE Application
 ***************/
// export const applyForJob = catchAsync(async (req: Request, res: Response) => {
//   const { jobId, userId, status, resumeId } = req.body

//   const exists = await AppliedJob.findOne({ jobId, userId, resumeId: resumeId })
//   if (exists) {
//     throw new AppError(httpStatus.CONFLICT, 'Already applied to this job')
//   }

//   const application = await AppliedJob.create({ jobId, userId, status, resumeId })

//   res.status(httpStatus.CREATED).json({
//     success: true,
//     message: 'Application submitted',
//     data: application,
//   })
// })

export const applyForJob = catchAsync(async (req: Request, res: Response) => {
  const { jobId, userId, status, resumeId } = req.body

  // Check if already applied
  const exists = await AppliedJob.findOne({ jobId, userId, resumeId })
  if (exists) {
    throw new AppError(httpStatus.CONFLICT, 'Already applied to this job')
  }

  // Create application
  const application = await AppliedJob.create({
    jobId,
    userId,
    status,
    resumeId,
  })

  // 🔹 Fetch job details (to know who posted it)
  const job = await Job.findById(jobId).populate('userId', 'username')
  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, 'Job not found')
  }

  // ✅ Notify the Job Owner
  await createNotification({
    to: job.userId as mongoose.Types.ObjectId,
    message: `A new candidate has applied for your job "${job.title}".`,
    type: 'job_application',
    id: application._id,
  })

  // ✅ Notify the Applicant
  await createNotification({
    to: userId,
    message: `You have successfully applied for the job "${job.title}".`,
    type: 'job_application_confirmation',
    id: application._id,
  })

  res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Application submitted',
    data: application,
  })
})


/****************************
 * GET Applications by Job ID
 ***************/
// export const getApplicationsByJob = catchAsync(
//   async (req: Request, res: Response) => {
//     const { jobId } = req.params

//     if (!mongoose.Types.ObjectId.isValid(jobId)) {
//       throw new AppError(httpStatus.BAD_REQUEST, 'Invalid Job ID')
//     }

//     const applications = await AppliedJob.find({ jobId }).populate(
//       'userId',
//       'name email'
//     ).populate("resumeId")

//     res.status(httpStatus.OK).json({
//       success: true,
//       message: 'Applications fetched by job',
//       data: applications,
//     })
//   }
// )


export const getApplicationsByJob = catchAsync(
  async (req: Request, res: Response) => {
    const { jobId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid Job ID");
    }

    // ✅ Extract pagination params (default: page=1, limit=10)
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // ✅ Get total count for pagination metadata
    const total = await AppliedJob.countDocuments({ jobId });

    // ✅ Fetch applications with pagination
    const applications = await AppliedJob.find({ jobId })
      .populate("userId", "name email")
      .populate("resumeId")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }); // optional: newest first

    res.status(httpStatus.OK).json({
      success: true,
      message: "Applications fetched by job",
      data: applications,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  }
);


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
