import express from 'express'
import {
  createSubscriptionPlan,
  getAllSubscriptionPlans,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getSingleSubscriptionPlans,
  unSubscribePlan,
} from '../controllers/subscriptionPlan.controller'
import { protect, isAdmin } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/plans', protect, isAdmin, createSubscriptionPlan)
router.get('/plans', getAllSubscriptionPlans)
router.patch('/plans/:id', protect, isAdmin, updateSubscriptionPlan)
router.get('/plans/:id', protect, getSingleSubscriptionPlans)
router.delete('/plans/:id', protect, isAdmin, deleteSubscriptionPlan)
router.post('/plans/unsubscribe', protect, unSubscribePlan)

export default router
