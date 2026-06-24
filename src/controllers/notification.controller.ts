import { Request, Response } from 'express'
import { Notification } from '../models/notification.model'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { broadcastUnreadCount } from '../sockets/notification.service'
import { asQueryString, assertOwner, isPrivilegedRole } from '../utils/authz'
import { AppliedJob } from '../models/appliedJob.model'
import { Job } from '../models/job.model'
import { ReqCompany } from '../models/assignCompanyReq.model'

/*********************************
 * GET ALL NOTIFICATIONS BY USER *
 *********************************/
export const getUserNotifications = catchAsync(
  async (req: Request, res: Response) => {
    // Notifications are private: only the recipient (or an admin) may read
    // them, and the query is always scoped to the authenticated user.
    assertOwner(req, req.params.userId, 'You are not allowed to view these notifications.')
    const userId = isPrivilegedRole(req.user?.role)
      ? asQueryString(req.params.userId) || String(req.user?._id)
      : String(req.user?._id)

    const notifications = await Notification.find({ to: userId }).sort({
      createdAt: -1,
    })
    const applicationNotificationIds = notifications
      .filter((notification) => notification.type === 'job_application')
      .map((notification) => notification.id)

    const applications = applicationNotificationIds.length
      ? await AppliedJob.find({ _id: { $in: applicationNotificationIds } }).select('jobId')
      : []
    const applicationJobIds = new Map(
      applications.map((application) => [
        String(application._id),
        application.jobId,
      ])
    )
    const expiryNotificationJobIds = notifications
      .filter((notification) => notification.type === 'job_expiry_warning')
      .map((notification) => notification.id)
    const expiryJobs = expiryNotificationJobIds.length
      ? await Job.find({ _id: { $in: expiryNotificationJobIds } }).select('companyId recruiterId')
      : []
    const expiryJobHrefs = new Map(
      expiryJobs.map((job) => [
        String(job._id),
        job.companyId ? `/manage-jobs/${job.companyId}` : '/recruiter-dashboard',
      ])
    )
    const companyRequestNotificationIds = notifications
      .filter((notification) => notification.type === 'req_application')
      .map((notification) => notification.id)
    const companyRequests = companyRequestNotificationIds.length
      ? await ReqCompany.find({ _id: { $in: companyRequestNotificationIds } })
          .select('company')
          .populate('company', 'userId')
      : []
    const companyRequestHrefs = new Map(
      companyRequests
        .map((request) => {
          const company = request.company as any
          const companyUserId = company?.userId
          return companyUserId
            ? [String(request._id), `/internal-recruiter-list/${companyUserId}`]
            : null
        })
        .filter((entry): entry is [string, string] => Boolean(entry))
    )
    const data = notifications.map((notification) => {
      const plainNotification = notification.toObject()
      const jobId = applicationJobIds.get(String(notification.id))
      const href = expiryJobHrefs.get(String(notification.id))
        ?? (
          notification.message.toLowerCase().includes('request received')
            ? companyRequestHrefs.get(String(notification.id))
            : undefined
        )

      if (jobId) return { ...plainNotification, id: jobId }
      if (href) return { ...plainNotification, href }
      return plainNotification
    })

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Notifications fetched successfully',
      data,
    })
  }
)

/**********************************
 * MARK ALL NOTIFICATIONS AS READ *
 **********************************/
export const markAllAsRead = catchAsync(async (req: Request, res: Response) => {
  // Only the recipient (or an admin) may mark notifications read; always
  // scope the update to the authenticated user.
  assertOwner(req, req.params.userId, 'You are not allowed to modify these notifications.')
  const userId = isPrivilegedRole(req.user?.role)
    ? asQueryString(req.params.userId) || String(req.user?._id)
    : String(req.user?._id)

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
    const { notificationId } = req.params

    if (!notificationId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Notification ID is required'
      )
    }

    // Only the recipient (or an admin) may mark a notification read; always
    // scope the update to the authenticated user.
    assertOwner(req, req.params.userId, 'You are not allowed to modify this notification.')
    const userId = isPrivilegedRole(req.user?.role)
      ? asQueryString(req.params.userId) || String(req.user?._id)
      : String(req.user?._id)

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
