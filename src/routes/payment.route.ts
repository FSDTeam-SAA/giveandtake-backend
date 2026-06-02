import express from 'express'
import {
  createPaypalOrder,
  capturePaypalPayment,
  getAllPayments,
  getPaymentsByUserId,
  refundPaypalPayment,
} from '../controllers/payment.controller'
import { protect, isAdmin } from '../middlewares/auth.middleware'

const router = express.Router()

// paypal — all require authentication (C5). Capture binds the userId to the
// authenticated user and validates the amount server-side (C6).
router.post('/paypal/create-order', protect, createPaypalOrder)
router.post('/paypal/capture-order', protect, capturePaypalPayment)
// Real PayPal refunds against arbitrary payments -> admin only (C5).
router.post('/paypal/refund-order', protect, isAdmin, refundPaypalPayment)

// Full payment ledger -> admin only (C5).
router.get('/all-payments', protect, isAdmin, getAllPayments)
// A user's payment history -> self or admin (scoped in the controller, C5).
router.get('/user/:userId', protect, getPaymentsByUserId)

export default router
