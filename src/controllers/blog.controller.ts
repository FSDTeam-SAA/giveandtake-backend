import { Request, Response } from 'express'
import httpStatus from 'http-status'
import { Blog } from '../models/Blog.model'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import sendResponse from '../utils/sendResponse'
import { deleteFromCloudinary, uploadToCloudinary } from '../utils/cloudinary'
import fs from 'fs'
import { buildMetaPagination, getPaginationParams } from '../utils/pagination'
import chatbotService from '../services/chatbot.service'
import slugify from 'slugify'
import { Types } from 'mongoose'
import { assertOwner } from '../utils/authz'

/**
 * Minimal server-side HTML sanitizer for rich-text blog content. Removes the
 * dangerous constructs that enable stored XSS while preserving formatting:
 *  - <script>/<style>/<iframe>/<object>/<embed>/<link>/<meta>/<base> elements,
 *  - inline event-handler attributes (onclick, onerror, ...),
 *  - javascript:/vbscript:/data: URIs in href/src/etc.
 * (No HTML-sanitizer package is installed in this repo and we must not add one,
 * so this is a conservative allow-the-rest, strip-the-dangerous pass.)
 */
const sanitizeBlogHtml = (input: unknown): string => {
  if (typeof input !== 'string') return ''
  let html = input

  // Strip dangerous elements (including their content) entirely.
  html = html.replace(
    /<\s*(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
    ''
  )
  // Strip standalone/void dangerous tags that may not have a closing tag.
  html = html.replace(
    /<\s*\/?\s*(script|style|iframe|object|embed|noscript|template|link|meta|base)\b[^>]*>/gi,
    ''
  )
  // Remove inline event-handler attributes: on*="..." / on*='...' / on*=value
  html = html.replace(
    /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    ''
  )
  // Neutralise dangerous URI schemes in any attribute value.
  html = html.replace(
    /((?:href|src|xlink:href|formaction|action|data|poster)\s*=\s*)("|')?\s*(?:javascript|vbscript|data)\s*:[^"'>\s]*("|')?/gi,
    '$1$2#$3'
  )

  return html.trim()
}

const generateUniqueSlug = async (title: string, excludeId?: string) => {
  const baseSlug =
    slugify(title, { lower: true, strict: true }) || `blog-${Date.now()}`
  let slug = baseSlug
  let counter = 1

  const query: Record<string, unknown> = { slug }
  if (excludeId) {
    query._id = { $ne: excludeId }
  }

  while (await Blog.exists(query)) {
    slug = `${baseSlug}-${counter++}`
    query.slug = slug
  }

  return slug
}

/***************
 * CREATE BLOG *
 ***************/
export const createBlog = catchAsync(async (req: Request, res: Response) => {
  const { title, description, authorName } = req.body

  // Author is always the authenticated user — never trust a client-supplied id.
  const userId = String(req.user?._id)

  if (!title || !description || !authorName) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Missing required fields')
  }

  const sanitizedDescription = sanitizeBlogHtml(description)

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
    slug: await generateUniqueSlug(title),
    description: sanitizedDescription,
    userId,
    authorName,
    image: imageUrl,
    imagePublicId,
  })

  await chatbotService.syncSingleBlog(blog.id)

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
  const { page, limit, skip } = getPaginationParams(req.query)

  const blogs = await Blog.find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)

  const total = await Blog.countDocuments({})

  const meta = buildMetaPagination(total, page, limit)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Blogs fetched successfully',
    data: { blogs, meta },
  })
})

/*******************
 * GET SINGLE BLOG *
 *******************/
export const getSingleBlog = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params
  let blog = null

  if (Types.ObjectId.isValid(id)) {
    blog = await Blog.findById(id)
  }

  if (!blog) {
    blog = await Blog.findOne({ slug: id })
  }

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
  const { title, description, authorName } = req.body

  const blog = await Blog.findById(id)
  if (!blog) {
    throw new AppError(httpStatus.NOT_FOUND, 'Blog not found')
  }

  // Only the author (or an admin/super-admin) may modify a blog.
  assertOwner(req, blog.userId, 'You are not allowed to modify this blog.')

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
  if (title) {
    blog.title = title
    blog.slug = await generateUniqueSlug(title, blog.id)
  }
  if (description) blog.description = sanitizeBlogHtml(description)
  if (authorName) blog.authorName = authorName

  await blog.save()

  await chatbotService.syncSingleBlog(blog.id)

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

  const blog = await Blog.findById(id)
  if (!blog) {
    throw new AppError(httpStatus.NOT_FOUND, 'Blog not found')
  }

  // Only the author (or an admin/super-admin) may delete a blog.
  assertOwner(req, blog.userId, 'You are not allowed to delete this blog.')

  const deleted = await Blog.findByIdAndDelete(id)

  if (!deleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Blog not found')
  }

  await chatbotService.removeSource('blog', id)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Blog deleted successfully',
    data: deleted,
  })
})
