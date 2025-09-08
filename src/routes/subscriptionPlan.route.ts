import express from 'express'
import {
  createSubscriptionPlan,
  getAllSubscriptionPlans,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getSingleSubscriptionPlans,
  unSubscribePlan,
} from '../controllers/subscriptionPlan.controller'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/plans', protect, createSubscriptionPlan)
router.get('/plans', getAllSubscriptionPlans)
router.patch('/plans/:id', protect, updateSubscriptionPlan)
router.get('/plans/:id', protect, getSingleSubscriptionPlans)
router.delete('/plans/:id', protect, deleteSubscriptionPlan)
router.post('/plans/unsubscribe', protect, unSubscribePlan)

export default router
