import { Request, Response } from 'express'
import httpStatus from 'http-status'
import mongoose from 'mongoose'
import { AppliedJob } from '../models/appliedJob.model'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import { buildMetaPagination, getPaginationParams } from '../utils/pagination'
import { CreateResume } from '../models/createResume.model'
import { Education } from '../models/education.model'
import { Experience } from '../models/experience.model'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import { AwardsAndHonor } from '../models/awardsAndHonor.model'
import { createNotification } from '../sockets/notification.service'
import { Job } from '../models/job.model'
import { sendEmail } from '../utils/sendEmail'
import { User } from '../models/user.model'

/***************
 * CREATE Application
//  ***************/
// export const applyForJob = catchAsync(async (req: Request, res: Response) => {
//   const { jobId, userId, status, resumeId } = req.body

//   // Check if already applied
//   const exists = await AppliedJob.findOne({ jobId, userId, resumeId })
//   if (exists) {
//     throw new AppError(httpStatus.CONFLICT, 'Already applied to this job')
//   }

//   // Create application
//   const application = await AppliedJob.create({
//     jobId,
//     userId,
//     status,
//     resumeId,
//   })

//   // 🔹 Fetch job details (to know who posted it)
//   const job = await Job.findById(jobId).populate('userId', 'username')
//   if (!job) {
//     throw new AppError(httpStatus.NOT_FOUND, 'Job not found')
//   }

//   // ✅ Notify the Job Owner
//   await createNotification({
//     to: job.userId as mongoose.Types.ObjectId,
//     message: `A new candidate has applied for your job "${job.title}".`,
//     type: 'job_application',
//     id: application._id,
//   })

//   // ✅ Notify the Applicant
//   await createNotification({
//     to: userId,
//     message: `You have successfully applied for the job "${job.title}".`,
//     type: 'job_application_confirmation',
//     id: application._id,
//   })

//   res.status(httpStatus.CREATED).json({
//     success: true,
//     message: 'Application submitted',
//     data: application,
//   })
// })

export const applyForJob = catchAsync(async (req: Request, res: Response) => {
  const { jobId, userId, status, resumeId } = req.body

  // 🔹 Check if already applied
  const exists = await AppliedJob.findOne({ jobId, userId, resumeId })
  if (exists) {
    throw new AppError(httpStatus.CONFLICT, 'Already applied to this job')
  }

  // 🔹 Create application
  const application = await AppliedJob.create({
    jobId,
    userId,
    status,
    resumeId,
  })

  // 🔹 Fetch job details (with recruiter info)
  const job = await Job.findById(jobId).populate('userId', 'name email')
  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, 'Job not found')
  }

  // 🔹 Fetch candidate info
  const candidate = await User.findById(userId).select('name email')
  if (!candidate) {
    throw new AppError(httpStatus.NOT_FOUND, 'Candidate not found')
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

  // ✅ Send email to Applicant
  if (candidate.email) {
    const recruiterName = (job.userId as any)?.name || 'Recruiter'

    const emailSubject = `Application Received: ${job.title}`
    const emailBody = `
      <div style="font-family: Arial, sans-serif; background: rgb(43,127,208); color: white; padding: 20px; border-radius: 8px;">
        <h2 style="margin-top: 0;">Application Confirmation</h2>
        <p>Dear ${candidate.name?.split(' ')[0] || 'Candidate'},</p>
        <p>Your application has been received and is now being reviewed.</p>
        <p>Thank you for your patience and good luck!</p>
        <p style="margin-top: 20px;">Best regards,<br/>${recruiterName}</p>
      </div>
    `

    await sendEmail(candidate.email, emailSubject, emailBody)
  }

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

    // ✅ Extract pagination params (default: page=1, limit=10)
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10
    const skip = (page - 1) * limit

    // ✅ Get total count for pagination metadata
    const total = await AppliedJob.countDocuments({ jobId })

    // ✅ Fetch applications with pagination
    const applications = await AppliedJob.find({ jobId })
      .populate('userId', 'name email avatar')
      .populate('resumeId')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }) // optional: newest first

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Applications fetched by job',
      data: applications,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
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
      .populate('resumeId')
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
// export const updateApplicationStatus = catchAsync(
//   async (req: Request, res: Response) => {
//     const { id } = req.params
//     const { status } = req.body

//     if (!['shortlisted', 'rejected'].includes(status)) {
//       throw new AppError(httpStatus.BAD_REQUEST, 'Invalid status value')
//     }

//     const updated = await AppliedJob.findByIdAndUpdate(
//       id,
//       { status },
//       { new: true }
//     ).populate('jobId', 'title')

//     if (!updated) {
//       throw new AppError(httpStatus.NOT_FOUND, 'Application not found')
//     }

//     // ✅ Notify the applicant about status change
//     const jobTitle = (updated.jobId as any)?.title || 'the job'
//     let notifyMessage =
//       status === 'shortlisted'
//         ? `You have been shortlisted for the job "${jobTitle}".`
//         : `You have been rejected for the job "${jobTitle}".`

//     await createNotification({
//       to: updated.userId as mongoose.Types.ObjectId,
//       message: notifyMessage,
//       type: 'job_application_status',
//       id: updated._id,
//     })

//     res.status(httpStatus.OK).json({
//       success: true,
//       message: 'Application status updated',
//       data: updated,
//     })
//   }
// )

export const updateApplicationStatus = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params // candidate user id
    const { status } = req.body

    if (!['shortlisted', 'rejected'].includes(status)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid status value')
    }

    const updated = await AppliedJob.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    )
      .populate('jobId', 'title')
      .populate('userId', 'name email') // ✅ fetch candidate info

    if (!updated) {
      throw new AppError(httpStatus.NOT_FOUND, 'Application not found')
    }

    const candidate = updated.userId as any
    const recruiter = req.user // ✅ assuming you attach recruiter info in middleware
    const jobTitle = (updated.jobId as any)?.title || 'the job'

    let emailSubject = ''
    let emailBody = ''

    if (status === 'rejected') {
      emailSubject = `Application Update: ${jobTitle}`
      emailBody = `
    <div style="font-family: Arial, sans-serif; background: rgb(43,127,208); color: white; padding: 20px; border-radius: 8px;">
      <h2 style="margin-top: 0;">Application Update</h2>
      <p>Dear ${candidate.name?.split(' ')[0] || 'Candidate'},</p>
      <p>I’m sorry to let you know your application has been <strong>unsuccessful</strong> on this occasion and, unfortunately, due to the sheer volume of applications we receive, we cannot give personalised feedback at this stage.</p>
      <p>Please keep applying and remain hopeful that the best of your career is yet to come!</p>
      <p style="margin-top: 20px;">Best regards,<br/>${
        recruiter?.name || 'Recruiter'
      }</p>
    </div>
  `
    }

    if (status === 'shortlisted') {
      emailSubject = `Application Update: ${jobTitle}`
      emailBody = `
    <div style="font-family: Arial, sans-serif; background: rgb(43,127,208); color: white; padding: 20px; border-radius: 8px;">
      <h2 style="margin-top: 0;">Application Update</h2>
      <p>Dear ${candidate.name?.split(' ')[0] || 'Candidate'},</p>
      <p>Your application has been <strong>forwarded to the hiring manager</strong>, and you will be contacted outside of EVP’s platform if the hiring manager wishes to progress your application.</p>
      <p>Good luck!</p>
      <p style="margin-top: 20px;">${recruiter?.name || 'Recruiter'}</p>
    </div>
  `
    }

    // ✅ send email
    if (candidate?.email) {
      await sendEmail(candidate.email, emailSubject, emailBody)
    }

    // ✅ also send notification in-app
    await createNotification({
      to: updated.userId as mongoose.Types.ObjectId,
      message:
        status === 'shortlisted'
          ? `You have been shortlisted for the job "${jobTitle}".`
          : `You have been rejected for the job "${jobTitle}".`,
      type: 'job_application_status',
      id: updated._id,
    })

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
