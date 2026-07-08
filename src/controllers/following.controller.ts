import { Request, Response } from 'express'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { Following } from '../models/following.model'
import sendResponse from '../utils/sendResponse'

/***********************
 * CREATE FOLLOW ENTRY *
 ***********************/
export const followEntity = catchAsync(async (req: Request, res: Response) => {
  const { recruiterId, companyId } = req.body
  const userId = req.user?._id
  //   console.log("first", userId)

  if (!recruiterId && !companyId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'recruiterId or companyId is required'
    )
  }

  // Check for duplicate follow
  const alreadyFollowing = await Following.findOne({
    userId,
    ...(recruiterId ? { recruiterId } : { companyId }),
  })

  if (alreadyFollowing) {
    throw new AppError(httpStatus.CONFLICT, 'Already following')
  }

  const follow = await Following.create({
    userId,
    recruiterId,
    companyId,
  })

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Followed successfully',
    data: follow,
  })
})

/***********************
 * DELETE FOLLOW ENTRY *
 ***********************/
export const unfollowEntity = catchAsync(
  async (req: Request, res: Response) => {
    const { recruiterId, companyId } = req.body
    const userId = req.user?._id

    if (!recruiterId && !companyId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'recruiterId or companyId is required'
      )
    }

    const unfollow = await Following.findOneAndDelete({
      userId,
      ...(recruiterId ? { recruiterId } : { companyId }),
    })

    if (!unfollow) {
      throw new AppError(httpStatus.NOT_FOUND, 'Follow entry not found')
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Unfollowed successfully',
      data: null,
    })
  }
)

/***********************
 * COUNT FOLLOWERS     *
 ***********************/
export const countFollowers = catchAsync(
  async (req: Request, res: Response) => {
    const { recruiterId, companyId } = req.query

    if (!recruiterId && !companyId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'recruiterId or companyId is required'
      )
    }

    const count = await Following.countDocuments({
      ...(recruiterId ? { recruiterId } : { companyId }),
    })

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Follower count retrieved',
      data: { count },
    })
  }
)
