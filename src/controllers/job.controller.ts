import { Request, Response } from 'express'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { Job } from '../models/job.model'
import { getPaginationParams, buildMetaPagination } from '../utils/pagination'
import sendResponse from '../utils/sendResponse'

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
  