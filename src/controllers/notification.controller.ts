import { Request, Response } from 'express'
import { Notification } from '../models/notification.model'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { broadcastUnreadCount } from '../sockets/notification.service'

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

  const unreadCount = await broadcastUnreadCount(userId, 0)

  res.status(httpStatus.OK).json({
    success: true,
    message: 'All notifications marked as read',
    modifiedCount: result.modifiedCount,
    unreadCount,
  })
})

/****************************************
 * MARK A SINGLE NOTIFICATION AS READ  *
 ****************************************/
export const markNotificationAsRead = catchAsync(
  async (req: Request, res: Response) => {
    const { userId, notificationId } = req.params

    if (!notificationId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Notification ID is required'
      )
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, to: userId },
      { isViewed: true },
      { new: true }
    )

    if (!notification) {
      throw new AppError(httpStatus.NOT_FOUND, 'Notification not found')
    }

    const unreadCount = await broadcastUnreadCount(userId)

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Notification marked as read',
      data: notification,
      unreadCount,
    })
  }
)



/**
 import { createNotification } from '../services/notification.service'

await createNotification({
  to: user._id,
  message: 'You have a new message',
  type: 'message',
  id: message._id,
})

 */
