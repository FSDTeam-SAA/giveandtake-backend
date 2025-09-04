import { Request, Response } from 'express'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import { Newsletter } from '../models/newsletter.model'
import sendResponse from '../utils/sendResponse'
import AppError from '../errors/AppError'
import { sendEmail } from '../utils/sendEmail'
import { buildMetaPagination, getPaginationParams } from '../utils/pagination'

/**********************************
 * CREATE NEWSLETTER SUBSCRIPTION *
 **********************************/
export const createNewsletterSubscription = catchAsync(
  async (req: Request, res: Response) => {
    const { email } = req.body

    if (!email) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Email is required')
    }

    // Check if email already exists
    const existingSubscription = await Newsletter.findOne({ email })
    if (existingSubscription) {
      throw new AppError(
        httpStatus.CONFLICT,
        'This email is already subscribed'
      )
    }

    const subscription = await Newsletter.create({ email })

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Successfully subscribed to newsletter',
      data: subscription,
    })
  }
)

/**********************************
 * DELETE NEWSLETTER SUBSCRIPTION *
 **********************************/
export const deleteNewsletterSubscription = catchAsync(
  async (req: Request, res: Response) => {
    const { email } = req.params

    const deletedSubscription = await Newsletter.findOneAndDelete({ email })

    if (!deletedSubscription) {
      throw new AppError(httpStatus.NOT_FOUND, 'Subscription not found')
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Successfully unsubscribed from newsletter',
      data: null,
    })
  }
)

/************************
 * GET ALL SUBSCRIBERSP *
 ************************/
export const getAllSubscribers = catchAsync(
  async (req: Request, res: Response) => {
    const { page, limit, skip } = getPaginationParams(req.query)
    const subscribers = await Newsletter.find().select('email createdAt')
    .skip(skip)
    .limit(limit)

      const total = await Newsletter.countDocuments({  })

  const meta = buildMetaPagination(total, page, limit)

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Subscribers retrieved successfully',
      data: {subscribers,meta}
    })
  }
)

/*********************************
 * SEND EMAIL TO ALL SUBSCRIBERS *
 *********************************/
export const sendNewsletterToSubscribers = catchAsync(
  async (req: Request, res: Response) => {
    const { subject, htmlContent } = req.body

    if (!subject || !htmlContent) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Subject and content are required'
      )
    }

    const subscribers = await Newsletter.find().select('email')
    const subscriberEmails = subscribers.map((sub) => sub.email)

    if (subscriberEmails.length === 0) {
      throw new AppError(httpStatus.NOT_FOUND, 'No subscribers found')
    }

    await sendEmail(subscriberEmails, subject, htmlContent)

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Newsletter sent successfully to all subscribers',
      data: {
        recipientsCount: subscriberEmails.length,
      },
    })
  }
)
