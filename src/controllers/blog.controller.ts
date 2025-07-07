import { Request, Response } from 'express'
import httpStatus from 'http-status'
import { Blog } from '../models/Blog.model'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import sendResponse from '../utils/sendResponse'

/***************
 * CREATE BLOG *
 ***************/
export const createBlog = catchAsync(async (req: Request, res: Response) => {
  const { title, description, image, userId } = req.body

  if (!title || !description || !userId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Missing required fields')
  }

  const blog = await Blog.create({ title, description, image, userId })

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Blog created successfully',
    data: blog,
  })
})

/*********************************************
 * GET ALL BLOGS (OPTIONAL FILTER BY USERID) *
 *********************************************/
export const getAllBlogs = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.query
  const filter: any = {}

  if (userId) {
    filter.userId = userId
  }

  const blogs = await Blog.find(filter).sort({ createdAt: -1 })

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Blogs fetched successfully',
    data: blogs,
  })
})

/*******************
 * GET SINGLE BLOG *
 *******************/
export const getSingleBlog = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params
  const blog = await Blog.findById(id)

  if (!blog) {
    throw new AppError(httpStatus.NOT_FOUND, 'Blog not found')
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Blog retrieved successfully',
    data: blog,
  })
})

/***************
 * UPDATE BLOG *
 ***************/
export const updateBlog = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params
  const updated = await Blog.findByIdAndUpdate(id, req.body, { new: true })

  if (!updated) {
    throw new AppError(httpStatus.NOT_FOUND, 'Blog not found')
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Blog updated successfully',
    data: updated,
  })
})

/***************
 * DELETE BLOG *
 ***************/
export const deleteBlog = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params
  const deleted = await Blog.findByIdAndDelete(id)

  if (!deleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Blog not found')
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Blog deleted successfully',
    data: deleted,
  })
})
