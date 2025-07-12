import express from 'express'
import {
  // getClientToken,
  // makePayment,
  getTotalRevenue,
  getTotalBookings,
  getTotalCustomers,
  getTotalDeals,
  createPaypalOrder,
  capturePaypalPayment,
  createPayment,
  confirmPayment,
} from '../controllers/payment.controller'

const router = express.Router()

// paypal
router.post('/paypal/create-order', createPaypalOrder)
router.post('/paypal/capture-order', capturePaypalPayment)

// stripe payment
router.post('/stripe/create-payment', createPayment)
router.post('/stripe/confirm-payment', confirmPayment)

// Analytics routes
router.get('/analytics/revenue', getTotalRevenue)
router.get('/analytics/bookings', getTotalBookings)
router.get('/analytics/customers', getTotalCustomers)
router.get('/analytics/deals', getTotalDeals)

export default router
