import { Request, Response } from 'express'
import httpStatus from 'http-status'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import { ContactUs } from '../models/contactUs.model'
import { User } from '../models/user.model'
import sendResponse from '../utils/sendResponse'

export const createContactUs = catchAsync(
  async (req: Request, res: Response) => {
    const { firstName, lastName, address, phoneNumber, subject, message } =
      req.body

    if (!firstName || !lastName || !subject || !message) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Missing required fields')
    }

    if (typeof subject !== 'string') {
      throw new AppError(httpStatus.BAD_REQUEST, 'Subject must be text')
    }
    if ((subject.match(/\S+/g) ?? []).length > 6) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Subject cannot exceed 6 words.')
    }

    if (typeof message !== 'string') {
      throw new AppError(httpStatus.BAD_REQUEST, 'Message must be text')
    }
    if ((message.match(/\S+/g) ?? []).length > 50) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Message cannot exceed 50 words.')
    }

    const contactEntry = await ContactUs.create({
      firstName,
      lastName,
      address,
      phoneNumber,
      subject,
      message,
    })

    // Find all admin users
    const adminUsers = await User.find({ role: 'admin' }).select('email')

    if (!adminUsers.length) {
      throw new AppError(httpStatus.NOT_FOUND, 'No admin users found to notify')
    }

    // Email notifications for contact messages are temporarily disabled.

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Message sent successfully to admins',
      data: contactEntry,
    })
  }
)
