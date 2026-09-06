import express from 'express'
import {
  createPaypalOrder,
  capturePaypalPayment,
  getAllPayments,
  getPaymentsByUserId,
  refundPaypalPayment,
  createStripePaymentIntent,
  confirmStripePayment,
  getStripeConfig,
} from '../controllers/payment.controller'

import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

// paypal
router.post('/paypal/create-order', createPaypalOrder)
router.post('/paypal/capture-order', capturePaypalPayment)
router.post('/paypal/refund-order', protect, refundPaypalPayment)

// stripe
// NOTE: /stripe/webhook is mounted directly in app.ts because signature
// verification requires the raw (unparsed) request body.
router.get('/stripe/config', getStripeConfig)
router.post('/stripe/create-payment-intent', createStripePaymentIntent)
router.post('/stripe/confirm', confirmStripePayment)

// provider-agnostic refund (handles both Stripe and PayPal payments)
router.post('/refund-order', protect, refundPaypalPayment)

router.get('/all-payments', getAllPayments)
router.get('/user/:userId', getPaymentsByUserId)

export default router
