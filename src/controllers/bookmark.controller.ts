import { Request, Response } from 'express'
import catchAsync from '../utils/catchAsync'
import { Bookmark } from '../models/bookmark.model'
import sendResponse from '../utils/sendResponse'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'

/***********************
 * CREATE BOOKMARK
 ***********************/
export const createBookmark = catchAsync(
  async (req: Request, res: Response) => {
    const { userId, jobId } = req.body

    const existing = await Bookmark.findOne({ userId, jobId })
    if (existing)
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Job already bookmarked by user'
      )

    const bookmark = await Bookmark.create({ userId, jobId })

    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: 'Bookmark created successfully',
      data: bookmark,
    })
  }
)

/***********************
 * GET ALL BY USER ID
 ***********************/
export const getBookmarksByUser = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params

    const bookmarks = await Bookmark.find({ userId })
      .sort({ createdAt: -1 })
      .populate('jobId')

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Bookmarks fetched successfully',
      data: bookmarks,
    })
  }
)
