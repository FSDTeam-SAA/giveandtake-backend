import { Request, Response } from 'express'
import httpStatus from 'http-status'
import { Blog } from '../models/Blog.model'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import sendResponse from '../utils/sendResponse'
import { deleteFromCloudinary, uploadToCloudinary } from '../utils/cloudinary'
import fs from 'fs'

/***************
 * CREATE BLOG *
 ***************/
export const createBlog = catchAsync(async (req: Request, res: Response) => {
  const { title, description, userId } = req.body

  if (!title || !description || !userId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Missing required fields')
  }

  let imageUrl: string | null = null
  let imagePublicId: string | null = null

  if (req.file) {
    const localPath = req.file.path

    // Upload image to Cloudinary
    const uploadResult = await uploadToCloudinary(localPath, 'blogs')

    if (!uploadResult?.secure_url) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Image upload failed'
      )
    }

    imageUrl = uploadResult.secure_url
    imagePublicId = uploadResult.public_id

    // Remove local file after upload
    fs.unlinkSync(localPath)
  }

  const blog = await Blog.create({
    title,
    description,
    userId,
    image: imageUrl,
    imagePublicId,
  })

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
  const blogs = await Blog.find().sort({ createdAt: -1 })

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
  const { title, description } = req.body

  const blog = await Blog.findById(id)
  if (!blog) {
    throw new AppError(httpStatus.NOT_FOUND, 'Blog not found')
  }

  // Handle new image upload
  if (req.file) {
    const localPath = req.file.path

    // Upload new image to Cloudinary
    const uploadResult = await uploadToCloudinary(localPath, 'blogs')

    if (!uploadResult?.secure_url) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Image upload failed'
      )
    }

    // Delete old image from Cloudinary if exists
    if (blog.imagePublicId) {
      await deleteFromCloudinary(blog.imagePublicId)
    }

    // Update with new image details
    blog.image = uploadResult.secure_url
    blog.imagePublicId = uploadResult.public_id

    // Remove local file
    fs.unlinkSync(localPath)
  }

  // Update other fields if provided
  if (title) blog.title = title
  if (description) blog.description = description

  await blog.save()

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Blog updated successfully',
    data: blog,
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
