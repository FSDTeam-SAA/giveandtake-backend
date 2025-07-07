import { Request, Response } from 'express'
import httpStatus from 'http-status'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import { ContactUs } from '../models/contactUs.model'
import { User } from '../models/user.model'
import sendResponse from '../utils/sendResponse'
import { sendEmail } from '../utils/sendEmail'

export const createContactUs = catchAsync(
  async (req: Request, res: Response) => {
    const { firstName, lastName, address, phoneNumber, subject, message } =
      req.body

    if (!firstName || !lastName || !subject || !message) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Missing required fields')
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

    const htmlContent = `
    <h3>New Contact Us Submission</h3>
    <p><strong>Name:</strong> ${firstName} ${lastName}</p>
    <p><strong>Phone:</strong> ${phoneNumber || 'N/A'}</p>
    <p><strong>Address:</strong> ${address || 'N/A'}</p>
    <p><strong>Subject:</strong> ${subject}</p>
    <p><strong>Message:</strong></p>
    <p>${message}</p>
  `

    // Send email to each admin
    for (const admin of adminUsers) {
      await sendEmail(admin.email, `Contact Us: ${subject}`, htmlContent)
    }

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Message sent successfully to admins',
      data: contactEntry,
    })
  }
)
