import { Request, Response } from 'express'
import { SubscriptionPlan } from '../models/subscriptionPlan.model'
import catchAsync from '../utils/catchAsync'
import sendResponse from '../utils/sendResponse'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { paymentInfo } from '../models/paymentInfo.model'
import { ElevatorPitch } from '../models/elevatorPitch.model'

// CREATE
export const createSubscriptionPlan = catchAsync(
  async (req: Request, res: Response) => {
    const { title, titleColor, description, price, features, for: planFor, valid } = req.body

    const normalizeNumericField = (value: any, field: string) => {
      if (value === undefined || value === null || value === '') return undefined
      const asNumber = Number(value)
      if (Number.isNaN(asNumber) || asNumber < 0) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          `${field} must be a positive number`
        )
      }
      return asNumber
    }

    const annualLimit = normalizeNumericField(req.body?.maxJobPostsPerYear, 'maxJobPostsPerYear')
    const monthlyLimit = normalizeNumericField(req.body?.maxJobPostsPerMonth, 'maxJobPostsPerMonth')

    if (!title || !description || !price || !planFor) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'All required fields must be provided'
      )
    }

    const isJobPostingPlan = ['company', 'recruiter'].includes(
      (planFor as string)?.toLowerCase()
    )

    if (isJobPostingPlan && annualLimit === undefined) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'maxJobPostsPerYear is required for recruiter and company plans'
      )
    }

    const resolvedMonthlyLimit =
      monthlyLimit ??
      (annualLimit !== undefined
        ? Math.max(1, Math.ceil(annualLimit / 12))
        : undefined)

    const plan = await SubscriptionPlan.create({
      title,
      description,
      titleColor,
      price,
      features,
      for: planFor,
      valid,
      maxJobPostsPerYear: annualLimit,
      maxJobPostsPerMonth: resolvedMonthlyLimit,
    })

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Subscription plan created successfully',
      data: plan,
    })
  }
)

// GET ALL
export const getAllSubscriptionPlans = catchAsync(
  async (req: Request, res: Response) => {
    const plans = await SubscriptionPlan.find().sort({ price: 1 })

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'All subscription plans fetched successfully',
      data: plans,
    })
  }
)
// GET ALL
export const getSingleSubscriptionPlans = catchAsync(
  async (req: Request, res: Response) => {
    const{id} = req.params
    const plans = await SubscriptionPlan.findById(id)

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'All subscription plans fetched successfully',
      data: plans,
    })
  }
)

// UPDATE
export const updateSubscriptionPlan = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params

    const normalizeNumericField = (value: any) => {
      if (value === undefined || value === null || value === '') return undefined
      const asNumber = Number(value)
      if (Number.isNaN(asNumber) || asNumber < 0) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'maxJobPostsPerYear / maxJobPostsPerMonth must be positive numbers'
        )
      }
      return asNumber
    }

    const nextAnnualLimit = normalizeNumericField(req.body?.maxJobPostsPerYear)
    const nextMonthlyLimit = normalizeNumericField(req.body?.maxJobPostsPerMonth)

    const partialUpdate: Record<string, any> = {
      ...req.body,
    }

    if (nextAnnualLimit !== undefined) {
      partialUpdate.maxJobPostsPerYear = nextAnnualLimit
      if (nextMonthlyLimit === undefined) {
        partialUpdate.maxJobPostsPerMonth = Math.max(
          1,
          Math.ceil(nextAnnualLimit / 12)
        )
      }
    }

    if (nextMonthlyLimit !== undefined) {
      partialUpdate.maxJobPostsPerMonth = nextMonthlyLimit
    }

    const updated = await SubscriptionPlan.findByIdAndUpdate(id, partialUpdate, {
      new: true,
      runValidators: true,
    })

    if (!updated) {
      throw new AppError(httpStatus.NOT_FOUND, 'Subscription plan not found')
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Subscription plan updated successfully',
      data: updated,
    })
  }
)

// DELETE
export const deleteSubscriptionPlan = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params
    const deleted = await SubscriptionPlan.findByIdAndDelete(id)

    if (!deleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Subscription plan not found')
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Subscription plan deleted successfully',
      data: null,
    })
  }
)



export const unSubscribePlan = catchAsync(async(req,res)=>{
  const userId = req.user?._id

  const deletePayment = await paymentInfo.deleteMany({userId})
  const deleteElevatorPitch = await ElevatorPitch.deleteMany({userId})

  sendResponse(res,{
    statusCode: 200,
    success:  true,
    message: "You are Successfully unsubscribe this plan",
    data: ""
  })
})
