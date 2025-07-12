import express from 'express'
import {
  createPaypalOrder,
  capturePaypalPayment,
} from '../controllers/payment.controller'

const router = express.Router()

// paypal
router.post('/paypal/create-order', createPaypalOrder)
router.post('/paypal/capture-order', capturePaypalPayment)

export default router
