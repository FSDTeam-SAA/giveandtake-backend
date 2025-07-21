import { Request, Response } from 'express'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { Job } from '../models/job.model'
import { getPaginationParams, buildMetaPagination } from '../utils/pagination'
import sendResponse from '../utils/sendResponse'
import { CreateResume } from '../models/createResume.model'
import { create } from 'domain'

/*******************
 * // CREATE A JOB *
 *******************/
// export const createJob = catchAsync(async (req: Request, res: Response) => {
//   const {
//     userId,
//     title,
//     description,
//     location,
//     companyName,
//     salaryRange,
//     shift,
//     jobType,
//     company,
//   } = req.body
//   if (!userId || !title) {
//     throw new AppError(httpStatus.BAD_REQUEST, 'Please fill in all fields')
//   }

//   const job = await Job.create({
//     userId,
//     title,
//     description,
//     companyName,
//     salaryRange,
//     location,
//     jobType,
//     company,
//     shift,
//   })

//   sendResponse(res, {
//     statusCode: httpStatus.CREATED,
//     success: true,
//     message: 'Job created successfully',
//     data: job,
//   })
// })

export const createJob = catchAsync(async (req: Request, res: Response) => {
  const {
    userId,
    companyId,
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
  } = req.body

  if (!userId || !title || !description) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Please fill in all required fields'
    )
  }

  const job = new Job({
    userId,
    companyId,
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
  })

  await job.save()

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
  const { title, location } = req.query

  const filter: any = {}
  if (title) filter.title = { $regex: title, $options: 'i' }
  if (location) filter.location = { $regex: location, $options: 'i' }

  const { page, limit, skip } = getPaginationParams(req.query)

  const totalJobs = await Job.countDocuments(filter)
  console.log('first')
  const jobs = await Job.find({ ...filter, arcrivedJob: false })
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })

  console.log(2, jobs)

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
  const job = await Job.findById(id)

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
  const { userId } = req.query

  if (!userId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'userId is required')
  }

  const resume = await CreateResume.findOne({ userId }).lean()

  if (!resume) {
    throw new AppError(httpStatus.NOT_FOUND, 'Resume not found')
  }

  const { title, country, skills = [], jobCategoryId } = resume

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
