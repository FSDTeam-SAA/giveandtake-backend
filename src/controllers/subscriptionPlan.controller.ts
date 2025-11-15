// src/controllers/subscriptionPlan.controller.ts

import { Request, Response, NextFunction } from 'express'
import { SubscriptionPlan } from '../models/subscriptionPlan.model'
import { ISubscriptionPlan } from '../interface/subscriptionPlan.interface'

// Create a new subscription plan
export const createSubscriptionPlan = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      title,
      titleColor, // <-- added here
      description,
      price,
      features,
      for: forWhom,
      valid,
    } = req.body as Partial<ISubscriptionPlan>

    const plan = await SubscriptionPlan.create({
      title,
      titleColor, // <-- saved here
      description,
      price,
      features,
      for: forWhom,
      valid,
    })

    return res.status(201).json({
      success: true,
      data: plan,
    })
  } catch (error) {
    next(error)
  }
}

// Get all subscription plans
export const getSubscriptionPlans = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const plans = await SubscriptionPlan.find()

    return res.status(200).json({
      success: true,
      data: plans,
    })
  } catch (error) {
    next(error)
  }
}

// Get a single subscription plan by id
export const getSubscriptionPlanById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params

    const plan = await SubscriptionPlan.findById(id)

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found',
      })
    }

    return res.status(200).json({
      success: true,
      data: plan,
    })
  } catch (error) {
    next(error)
  }
}

// Update subscription plan
export const updateSubscriptionPlan = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params

    const {
      title,
      titleColor, // <-- added here
      description,
      price,
      features,
      for: forWhom,
      valid,
    } = req.body as Partial<ISubscriptionPlan>

    const updatedPlan = await SubscriptionPlan.findByIdAndUpdate(
      id,
      {
        title,
        titleColor, // <-- updated here
        description,
        price,
        features,
        for: forWhom,
        valid,
      },
      {
        new: true,
        runValidators: true,
      }
    )

    if (!updatedPlan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found',
      })
    }

    return res.status(200).json({
      success: true,
      data: updatedPlan,
    })
  } catch (error) {
    next(error)
  }
}

// Delete subscription plan
export const deleteSubscriptionPlan = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params

    const deleted = await SubscriptionPlan.findByIdAndDelete(id)

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found',
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Subscription plan deleted successfully',
    })
  } catch (error) {
    next(error)
  }
}
