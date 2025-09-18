import { Request, Response } from 'express'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { Job } from '../models/job.model'
import { getPaginationParams, buildMetaPagination } from '../utils/pagination'
import sendResponse from '../utils/sendResponse'
import { CreateResume } from '../models/createResume.model'
import { checkIfUserCanPostJob } from '../helper/canPostJob'
import { User } from '../models/user.model'
import { RecruiterAccount } from '../models/recruiterAccount.model'
import { Company } from '../models/company.model'
import { AppliedJob } from '../models/appliedJob.model'
import { sendEmail } from '../utils/sendEmail'
import { io } from '../server'
import { createNotification } from '../sockets/notification.service'
import mongoose from 'mongoose'
import { Notification } from '../models/notification.model'
import { Following } from '../models/following.model'

/*******************
 * // CREATE A JOB *
 *******************/
export const createJob = catchAsync(async (req: Request, res: Response) => {
  const {
    userId,
    title,
    description,
    companyName,
    salaryRange,
    location,
    shift,
    responsibilities,
    educationExperience,
    benefits,
    vacancy,
    experience,
    deadline,
    status,
    jobCategoryId,
    compensation,
    arcrivedJob,
    applicationRequirement,
    customQuestion,
    employement_Type,
    website_Url,
    publishDate,
    career_Stage,
    location_Type,
    name,
    role,
  } = req.body

  if (!userId || !title || !description) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Please fill in all required fields'
    )
  }

  // CHECK THE USER
  const user = await User.findById(userId)

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  // ROLE BASE APPROVE LOGIC
  let jobApprove: 'pending' | 'approved' | 'denied' = 'approved'
  let companyId
  let recruiterId

  if (user.role === 'company') {
    jobApprove = 'approved'
    const a = await Company.findOne({ userId: userId })
    if (a) {
      companyId = a._id
    }
  } else if (user.role === 'recruiter') {
    jobApprove = 'approved'
    const a = await RecruiterAccount.findOne({ userId: userId })
    if (a) {
      if (a.companyId) {
        companyId = a.companyId
      }
      else {
        recruiterId = a._id
      }
    }
  } else {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not authorized to create a job'
    )
  }

  // await checkIfUserCanPostJob(userId)

  const job = new Job({
    userId,
    companyId,
    recruiterId,
    title,
    description,
    companyName,
    salaryRange,
    location,
    shift,
    responsibilities,
    educationExperience,
    benefits,
    vacancy,
    experience,
    deadline,
    status,
    jobCategoryId,
    compensation,
    arcrivedJob,
    applicationRequirement,
    customQuestion,
    jobApprove,
    employement_Type,
    website_Url,
    publishDate,
    location_Type,
    career_Stage,
    name,
    role,
  })

  await job.save()


    // 🔹 Find followers
  let followers: any[] = [];
  if (companyId) {
    followers = await Following.find({ companyId });
  } else if (recruiterId) {
    followers = await Following.find({ recruiterId });
  }

  if (followers.length > 0) {
    const notifications = followers.map((f) => ({
      userId: f.userId,
      message: `New job posted: ${title}`,
      jobId: job._id,
      type: "job_post",
    }));

    const saved = await Notification.insertMany(notifications);

    // 🔹 Emit via socket
    saved.forEach((n) => {
        io.to(n.userId.toString()).emit("newNotification", n);
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Job created successfully',
    data: job,
  })
})

/********************************************
 * GET ALL JOBS WITH FILTERS AND PAGINATION *
 ********************************************/
export const getAllJobs = catchAsync(async (req: Request, res: Response) => {
  const { title, location, jobCategoryId } = req.query

  const filter: any = {}
  if (title) filter.title = { $regex: title, $options: 'i' }
  if (location) filter.location = { $regex: location, $options: 'i' }
  if (jobCategoryId) filter.jobCategoryId = jobCategoryId // <-- filter by category

  // Ensure publishDate is null OR publishDate <= today
  filter.$or = [
    { publishDate: { $exists: false } },
    { publishDate: null },
    { publishDate: { $lte: new Date() } },
  ]

  const { page, limit, skip } = getPaginationParams(req.query)

  const totalJobs = await Job.countDocuments({
    ...filter,
    arcrivedJob: false,
    jobApprove: 'approved',
    adminApprove: true,
  })

  const jobs = await Job.find({
    ...filter,
    arcrivedJob: false,
    adminApprove: true,
    jobApprove: 'approved',
  })
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .populate('companyId')

  const meta = buildMetaPagination(totalJobs, page, limit)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Jobs fetched successfully',
    data: { meta, jobs },
  })
})

/*******************
 * // UPDATE A JOB *
 *******************/

export const updateJob = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params


  const job = await Job.findById(id).populate("userId")
  if (!job) {
    throw new AppError(400, "job not found")
  }

  if (req.body.adminApprove) {
    // const recruiterName = (job.userId as any)?.name || 'Recruiter'

    const emailSubject = `Job Post Approved By Admin`
    const emailBody = `
      <div style="font-family: Arial, sans-serif; background: rgb(43,127,208); color: white; padding: 20px; border-radius: 8px;">
        <h2 style="margin-top: 0;">Application Confirmation</h2>
        <p>Dear ${job?.userId?.name || 'Company'},</p> 
        <p>Your post has been approved by Admin and will be posted at your scheduled time’,</br> Best regards, EVP Admin</p>
      </div>
    `

    await sendEmail(job?.userId?.email, emailSubject, emailBody)
    let notification = await createNotification({
      to: job.userId._id as mongoose.Types.ObjectId,
      message: 'Job Post Approved By Admin',
      type: 'job_application_status',
      id: job._id as mongoose.Types.ObjectId,
    })
    // Emit socket event
    io.to(job.userId._id.toString()).emit('newNotification', notification)
  } else {

    const emailSubject = `Job Post Denied By Admin`
    const emailBody = `
      <div style="font-family: Arial, sans-serif; background: rgb(43,127,208); color: white; padding: 20px; border-radius: 8px;">
        <h2 style="margin-top: 0;">Application Denied</h2>
        <p>Dear ${job?.userId?.name || 'Company'},</p>  
        <p>‘Please reach out to Admin for support regarding your job post’ on Info@evp.com</p>
      </div>
    `

    await sendEmail(job?.userId?.email, emailSubject, emailBody)

        let notification = await createNotification({
      to: job.userId._id as mongoose.Types.ObjectId,
      message: 'Job Post Denied By Admin',
      type: 'job_application_status',
      id: job._id as mongoose.Types.ObjectId,
    })
    // Emit socket event
    io.to(job.userId._id.toString()).emit('newNotification', notification)

  }

  const updated = await Job.findByIdAndUpdate(id, req.body, { new: true })

  if (!updated) throw new AppError(httpStatus.NOT_FOUND, 'Job not found')

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Job updated successfully',
    data: updated,
  })
})

/*******************
 * // DELETE A JOB *
 *******************/

export const deleteJob = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params
  const deleted = await Job.findByIdAndDelete(id)

  if (!deleted) throw new AppError(httpStatus.NOT_FOUND, 'Job not found')

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Job deleted successfully',
    data: deleted,
  })
})

/***************************
 *    // GET SINGLE JOB    *
 * // GET SINGLE JOB BY ID *
 ***************************/
export const getSingleJob = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params
  const job = await Job.findById(id).populate('companyId')

  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, 'Job not found')
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Job retrieved successfully',
    data: job,
  })
})

/************************
 * JOB RECOMMEND SYSTEM *
 ************************/
export const recommendJobs = catchAsync(async (req: Request, res: Response) => {
  // const { userId } = req.query
  const userId = req.user?._id

  if (!userId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'userId is required')
  }

  const resume = await CreateResume.findOne({ userId }).lean()

  if (!resume) {
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'No resume found for the User',
      data: { exactMatches: [], partialMatches: [] },
    })
  }

  const title = resume?.title
  const country = resume?.country
  const skills = resume?.skills || []
  const jobCategoryId = resume?.jobCategoryId

  // const { title, country, skills = [], jobCategoryId } = resume

  const matchConditions = []

  if (title) matchConditions.push({ title: { $regex: new RegExp(title, 'i') } })
  if (country)
    matchConditions.push({ location: { $regex: new RegExp(country, 'i') } })
  if (skills.length > 0)
    matchConditions.push({ responsibilities: { $in: skills } })
  if (jobCategoryId as string) matchConditions.push({ jobCategoryId })

  const jobs = await Job.find({ $or: matchConditions, status: 'active' })
    .limit(50)
    .lean()

  const exactMatches = [] as any[]
  const partialMatches = [] as any[]

  jobs.forEach((job) => {
    let score = 0

    if (title && job.title?.toLowerCase().includes(title.toLowerCase()))
      score += 3
    if (country && job.location?.toLowerCase().includes(country.toLowerCase()))
      score += 2
    if (
      skills.length > 0 &&
      job.responsibilities?.some((r: string) => skills.includes(r))
    )
      score += 1

    if (score >= 5) {
      exactMatches.push({ job, score })
    } else {
      partialMatches.push({ job, score })
    }
  })

  // Sort by score (highest first)
  exactMatches.sort((a, b) => b.score - a.score)
  partialMatches.sort((a, b) => b.score - a.score)

  if (exactMatches.length === 0 && partialMatches.length === 0) {
    const fallbackJobs = await Job.find({ status: 'active' }).limit(5)

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'No exact or partial matches found.',
      data: {
        exactMatches,
        partialMatches,
        fallbackJobs,
      },
    })
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Recommended jobs fetched successfully',
    data: {
      exactMatches,
      partialMatches,
    },
  })
})

/*******************************
 * GET ARCRIVED JOBS BY USERID *
 *******************************/
export const getArchivedJobs = catchAsync(async (req, res) => {
  const userId = req.user?._id
  if (!userId) throw new AppError(httpStatus.BAD_REQUEST, 'User not found')
  const archivedJobs = await Job.find({ userId, arcrivedJob: true }).sort({
    createAt: -1,
  })

  if (!archivedJobs)
    throw new AppError(httpStatus.NOT_FOUND, 'No archived jobs found')

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Archived jobs fetched successfully',
    data: archivedJobs,
  })
})

/************************************************
 * FETCH JOBS THAT RICRUTER AND COMPANY CREATED *
 ************************************************/
// export const getRicruitercompanyJobs = catchAsync(async (req, res) => {
//   const userId = req.user?._id;
//   if (!userId) throw new AppError(httpStatus.BAD_REQUEST, "User not found");
//   // const Jobs = await Job.find({ userId, arcrivedJob: false }).sort({
//   //   createAt: -1,
//   // });

//   // if (!Jobs) throw new AppError(httpStatus.NOT_FOUND, "No archived jobs found");

//   // const applicantCount = await AppliedJob.countDocuments({jobId: Jobs._id})

//   const Jobs = await Job.find({ userId, arcrivedJob: false }).sort({
//     createdAt: -1,
//   });

//   if (!Jobs.length) {
//     sendResponse(res, {
//       statusCode: httpStatus.OK,
//       success: true,
//       message: "No jobs found",
//       data: [],
//     });
//   }

//   const jobsWithApplicants = await Promise.all(
//     Jobs.map(async (job) => {
//       const applicantCount = await AppliedJob.countDocuments({
//         jobId: job._id,
//       });
//       return { ...job.toObject(), applicantCount };
//     })
//   );

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: "jobs fetched successfully",
//     data: jobsWithApplicants,
//   });
// });

// export const getRecruiterCompanyJobs = catchAsync(async (req, res) => {
//   const userId = req.user?._id
//   if (!userId) throw new AppError(httpStatus.BAD_REQUEST, 'User not found')

//   // Get the company document for this user, if any
//   const company = await Company.findOne({ userId })

//   // Match jobs where:
//   // 1. job.userId === logged-in user
//   // 2. job.companyId === logged-in user (if user is a company)
//   // 3. job.companyId === company._id (if user has a company record)
//   const Jobs = await Job.find({
//     $or: [
//       { userId }, // jobs created by the user
//       { companyId: userId }, // user account itself is a company
//       ...(company ? [{ companyId: company._id }] : []), // jobs created by user's company
//     ],
//     arcrivedJob: false,
//   }).sort({ createdAt: -1 })

//   if (!Jobs.length) {
//     return sendResponse(res, {
//       statusCode: httpStatus.OK,
//       success: true,
//       message: 'No jobs found',
//       data: [],
//     })
//   }

//   const jobsWithApplicants = await Promise.all(
//     Jobs.map(async (job) => {
//       const applicantCount = await AppliedJob.countDocuments({ jobId: job._id })
//       return { ...job.toObject(), applicantCount }
//     })
//   )

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: 'Jobs fetched successfully',
//     data: jobsWithApplicants,
//   })
// })

export const getRecruiterCompanyJobs = catchAsync(async (req, res) => {
  const userId = req.user?._id
  if (!userId) throw new AppError(httpStatus.BAD_REQUEST, 'User not found')

  // Get the company document for this user, if any
  const company = await Company.findOne({ userId })

  // Match jobs where:
  const Jobs = await Job.find({
    $or: [
      { userId }, // jobs created by the user
      { companyId: userId }, // user account itself is a company
      ...(company ? [{ companyId: company._id }] : []), // jobs created by user's company
    ],
    arcrivedJob: false,
  }).sort({ createdAt: -1 })

  if (!Jobs.length) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'No jobs found',
      data: [],
    })
  }

  const today = new Date()

  const jobsWithApplicants = await Promise.all(
    Jobs.map(async (job) => {
      const applicantCount = await AppliedJob.countDocuments({ jobId: job._id })

      let derivedStatus = 'Pending'

      if (job.publishDate && job.adminApprove) {
        if (job.publishDate <= today) {
          derivedStatus = 'Live'
        } else {
          derivedStatus = 'Scheduled (Admin Approved)'
        }
      } else if (job.publishDate && !job.adminApprove) {
        if (job.publishDate > today) {
          derivedStatus = 'Scheduled'
        }
      }

      return {
        ...job.toObject(),
        applicantCount,
        derivedStatus, // 👈 new status field
      }
    })
  )

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Jobs fetched successfully',
    data: jobsWithApplicants,
  })
})



export const getRicruitercompanyJobs1 = catchAsync(async (req, res) => {
  const userId = req.params.id
  const Jobs = await Job.find({
    companyId: userId,
    arcrivedJob: false,
    jobApprove: 'approved',
  })
    .sort({
      createdAt: -1,
    })
    .populate('companyId')

  // if (!Jobs) throw new AppError(httpStatus.NOT_FOUND, 'No jobs found')

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'jobs fetched successfully',
    data: Jobs,
  })
})

/*************************************
 * GET ALL PENDING JOB ---> COMPANY *
 *************************************/
export const getPendingJobsForCompany = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user?._id
    // ✅ Extract pagination params (default: page=1, limit=10)
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10
    const skip = (page - 1) * limit

    const company = await Company.findOne({ userId: userId })
    const companyId = company?._id
    console.log(1, companyId)

    if (!companyId) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Company ID is required')
    }

    // FIND ALL RECRUITER CONNECTED TO THE COMPANY
    const recruiters = await RecruiterAccount.find({ companyId }).select(
      'userId'
    )

    console.log('recruiter', recruiters)

    if (!recruiters || recruiters.length === 0) {
      sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'No recruiters found for this company',
        data: [],
      })
      return
    }

    // EXTRACT RECRUITER USER IDs
    const recruiterUserIds = recruiters.map((recruiter) => recruiter.userId)
    console.log('recruiterUserIds', recruiterUserIds)

    // FIND ALL pending JOBS POSTED BY THESE RECRUITERS
    const pendingJobs = await Job.find({
      userId: { $in: recruiterUserIds },
    })
      .sort({ createdAt: -1 })
      .populate('userId', 'name role avatar')
      .populate('jobCategoryId')
      .skip(skip)
      .limit(limit)

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Pending jobs fetched successfully',
      data: pendingJobs,
    })
  }
)

// Api for fetch jobs that need to be admin approvals
export const adminApproveJobs = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query)

  const jobs = await Job.find({ jobApprove: 'approved' })
    .populate('companyId')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)

  const total = await Job.countDocuments({})

  const meta = buildMetaPagination(total, page, limit)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Pending jobs fetched successfully',
    data: { jobs, meta },
  })
})
