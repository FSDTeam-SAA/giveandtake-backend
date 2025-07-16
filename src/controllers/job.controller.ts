import { Request, Response } from 'express'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { Job } from '../models/job.model'
import { getPaginationParams, buildMetaPagination } from '../utils/pagination'
import sendResponse from '../utils/sendResponse'
import { CreateResume } from '../models/createResume.model'


/*******************
 * // CREATE A JOB *
 *******************/
export const createJob = catchAsync(async (req: Request, res: Response) => {
    const { title,description, location,companyName,salaryRange,shift, jobType, company,  } = req.body
    if (!title || !location || !jobType || !company || !shift) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Please fill in all fields')
    }

  const job = await Job.create({
    title,
    description,
    companyName,
    salaryRange,
    location,
    jobType,
    company,
    shift,
  })

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
  const jobs = await Job.find(filter).skip(skip).limit(limit)

  const meta = buildMetaPagination(totalJobs, page, limit)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Jobs fetched successfully',
    data: {meta,jobs},
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
  

export const recommendJobs = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user

  if (!userId) {
    return res
      .status(400)
      .json({ success: false, message: 'userId is required' })
  }

  const resume = await CreateResume.findOne({ userId }).lean()

  if (!resume) {
    return res.status(404).json({ success: false, message: 'Resume not found' })
  }

  const { title, country, skills = [] } = resume

  const matchConditions = []

  // 1. Match resume.title with job.title using case-insensitive partial match
  if (title) {
    matchConditions.push({ title: { $regex: new RegExp(title, 'i') } })
  }

  // 2. Match resume.country with job.location using case-insensitive partial match
  if (country) {
    matchConditions.push({ location: { $regex: new RegExp(country, 'i') } })
  }

  // 3. Match skills with responsibilities
  if (skills.length > 0) {
    matchConditions.push({ responsibilities: { $in: skills } })
  }

  // Run query to find relevant jobs
  const jobs = await Job.find({ $or: matchConditions, status: 'active' })
    .limit(50)
    .lean()

  const exactMatches: any[] = []
  const partialMatches: any[] = []

  jobs.forEach((job) => {
    let matchCount = 0
    if (title && job.title?.toLowerCase().includes(title.toLowerCase()))
      matchCount++
    if (country && job.location?.toLowerCase().includes(country.toLowerCase()))
      matchCount++
    if (
      skills.length > 0 &&
      job.responsibilities?.some((r: string) => skills.includes(r))
    )
      matchCount++

    if (matchCount >= 2) {
      exactMatches.push(job)
    } else {
      partialMatches.push(job)
    }
  })

  res.status(200).json({
    success: true,
    data: {
      exactMatches,
      partialMatches,
    },
  })
})