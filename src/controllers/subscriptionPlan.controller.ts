import { Request, Response } from 'express'
import { SubscriptionPlan } from '../models/subscriptionPlan.model'
import catchAsync from '../utils/catchAsync'
import sendResponse from '../utils/sendResponse'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'

// CREATE
export const createSubscriptionPlan = catchAsync(
  async (req: Request, res: Response) => {
    const { title, description, price, features, for: planFor } = req.body

    if (!title || !description || !price || !planFor) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'All required fields must be provided'
      )
    }

    const plan = await SubscriptionPlan.create({
      title,
      description,
      price,
      features,
      for: planFor,
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
    const plans = await SubscriptionPlan.find().sort({ createdAt: -1 })

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
    const updated = await SubscriptionPlan.findByIdAndUpdate(id, req.body, {
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
