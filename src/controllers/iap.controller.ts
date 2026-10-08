import { Request, Response } from 'express'
import catchAsync from '../utils/catchAsync'
import sendResponse from '../utils/sendResponse'
import AppError from '../errors/AppError'
import { APPLE_IAP, GOOGLE_PLAY_IAP } from '../config/iap'
import {
  getApplePurchase,
  getGoogleSubscription,
  StoreSubscriptionSnapshot,
  StoreUnavailableError,
  StoreVerificationError,
} from '../services/storeSubscription.service'
import {
  getCandidatePremiumStatus,
  handleAppleNotification,
  handleGooglePlayNotification,
  linkStoreSubscription,
} from '../services/candidateIap.service'

/*************************************************
 * IN-APP PURCHASE: VERIFY (mobile candidate app) *
 *************************************************/
export const verifyStorePurchase = catchAsync(async (req: Request, res: Response) => {
  const user = req.user
  if (!user) throw new AppError(401, 'Unauthorized')
  if (user.role !== 'candidate') {
    throw new AppError(403, 'In-app subscriptions are only available to candidate accounts')
  }

  const { platform, productId, transactionId, purchaseToken } = req.body ?? {}

  let snapshot: StoreSubscriptionSnapshot
  try {
    if (platform === 'ios') {
      const isCandidateProduct =
        APPLE_IAP.candidateProductIds.includes(productId) ||
        APPLE_IAP.candidateYearlyProductIds.includes(productId)
      if (!isCandidateProduct || typeof transactionId !== 'string' || !transactionId) {
        throw new AppError(400, 'A valid App Store product and transaction id are required')
      }
      snapshot = await getApplePurchase(productId, transactionId)
    } else if (platform === 'android') {
      if (!GOOGLE_PLAY_IAP.candidateProductIds.includes(productId) || typeof purchaseToken !== 'string' || !purchaseToken) {
        throw new AppError(400, 'A valid Google Play product and purchase token are required')
      }
      snapshot = await getGoogleSubscription(purchaseToken)
    } else {
      throw new AppError(400, "platform must be 'ios' or 'android'")
    }
  } catch (error) {
    if (error instanceof StoreVerificationError) throw new AppError(400, error.message)
    if (error instanceof StoreUnavailableError) {
      console.error('[iap] Store verification unavailable:', error.message)
      throw new AppError(503, 'The store could not confirm this purchase right now. Please try again shortly.')
    }
    throw error
  }

  await linkStoreSubscription({ _id: user._id }, snapshot)
  const status = await getCandidatePremiumStatus(user._id)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: status.isPremium ? 'Premium subscription is active' : 'This subscription is no longer active',
    data: status,
  })
})

/*****************************************
 * IN-APP PURCHASE: CANDIDATE PREMIUM STATUS *
 *****************************************/
export const getCandidateSubscriptionStatus = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError(401, 'Unauthorized')
  const status = await getCandidatePremiumStatus(req.user._id)

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Subscription status retrieved',
    data: status,
  })
})

/*******************************************
 * APP STORE SERVER NOTIFICATIONS (V2)      *
 *******************************************/
export const appleStoreNotification = async (req: Request, res: Response) => {
  const signedPayload = req.body?.signedPayload
  if (typeof signedPayload !== 'string') {
    res.status(400).json({ success: false, message: 'signedPayload is required' })
    return
  }

  try {
    await handleAppleNotification(signedPayload)
  } catch (error) {
    console.error('[iap] Apple notification failed:', error)
    // A non-2xx makes Apple retry, which only helps when Apple was unreachable.
    if (error instanceof StoreUnavailableError) {
      res.status(503).json({ success: false })
      return
    }
  }
  res.status(200).json({ success: true })
}

/*******************************************
 * GOOGLE PLAY REAL-TIME DEVELOPER NOTIFICATIONS *
 *******************************************/
export const googlePlayNotification = async (req: Request, res: Response) => {
  if (GOOGLE_PLAY_IAP.rtdnToken && req.query.token !== GOOGLE_PLAY_IAP.rtdnToken) {
    res.status(401).json({ success: false })
    return
  }

  const data = req.body?.message?.data
  if (typeof data === 'string') {
    try {
      await handleGooglePlayNotification(data)
    } catch (error) {
      console.error('[iap] Google Play notification failed:', error)
      // A non-2xx makes Pub/Sub redeliver, which only helps when Google was unreachable.
      if (error instanceof StoreUnavailableError) {
        res.status(503).json({ success: false })
        return
      }
    }
  }
  res.status(204).end()
}
