import { Request, Response, NextFunction } from 'express'
import { paymentInfo } from '../models/paymentInfo.model'
import catchAsync from '../utils/catchAsync'
import {SubscriptionPlan} from '../models/subscriptionPlan.model'
import {User} from '../models/user.model'
import { createOrder, captureOrder } from '../services/paypal.service'



// JSON validation middleware
const validateJsonBody = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON payload',
      details: err.message,
    })
  }
  next()
}

/****************************
 * PAYPAL CREATEPAYPALORDER *
 ****************************/
export const createPaypalOrder = async (req: Request, res: Response) => {
  try {
    const { amount } = req.body
    const order = await createOrder(amount)
    res.status(200).json({
      success: true,
      message: 'PayPal order created',
      orderId: order.id,
      links: order.links,
    })
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: 'Failed to create PayPal order', error })
  }
}

const mapPaypalStatusToEnum = (
  paypalStatus: string
): 'complete' | 'pending' | 'failed' => {
  switch (paypalStatus.toUpperCase()) {
    case 'COMPLETED':
      return 'complete'
    case 'PENDING':
      return 'pending'
    case 'FAILED':
    case 'DECLINED':
    case 'DENIED':
      return 'failed'
    default:
      return 'failed' // fallback for unexpected values
  }
}

/****************************
 * PAYPAL CAPTUREPAYPALPAYMENT *
 ****************************/
export const capturePaypalPayment = async (req: Request, res: Response) => {
  try {
    const { orderId, userId, bookingId, seasonId } = req.body
    const capture = await captureOrder(orderId)

    const captureDetails = capture.purchase_units[0].payments.captures[0]

    const newPayment = await paymentInfo.create({
      userId,
      bookingId,
      price: captureDetails.amount.value,
      paymentStatus: mapPaypalStatusToEnum(captureDetails.status),
      transactionId: captureDetails.id,
      paymentMethod: 'PayPal',
      seasonId,
    })

    res.status(200).json({
      message: 'Payment captured successfully',
      payment: newPayment,
    })
  } catch (error) {
    res.status(500).json({ message: 'Payment capture failed', error })
  }
}

