import express from 'express'
import {
  createPaypalOrder,
  capturePaypalPayment,
  getAllPayments,
  getPaymentsByUserId,
} from '../controllers/payment.controller'

const router = express.Router()

// paypal
router.post('/paypal/create-order', createPaypalOrder)
router.post('/paypal/capture-order', capturePaypalPayment)

router.get('/all-payments', getAllPayments)
router.get('/user/:userId', getPaymentsByUserId)

export default router
