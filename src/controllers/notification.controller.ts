import { Request, Response } from 'express'
import { Notification } from '../models/notification.model'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'

/*********************************
 * GET ALL NOTIFICATIONS BY USER *
 *********************************/
export const getUserNotifications = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params

    const notifications = await Notification.find({ to: userId }).sort({
      createdAt: -1,
    })

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Notifications fetched successfully',
      data: notifications,
    })
  }
)

/**********************************
 * MARK ALL NOTIFICATIONS AS READ *
 **********************************/
export const markAllAsRead = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.params

  const result = await Notification.updateMany(
    { to: userId, isViewed: false },
    { isViewed: true }
  )

  res.status(httpStatus.OK).json({
    success: true,
    message: 'All notifications marked as read',
    modifiedCount: result.modifiedCount,
  })
})



/**
 import { createNotification } from '../services/notification.service'

await createNotification({
  to: user._id,
  message: 'You have a new message',
  type: 'message',
  id: message._id,
})

 */