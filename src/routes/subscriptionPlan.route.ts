import express from 'express'
import {
  createSubscriptionPlan,
  getAllSubscriptionPlans,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
} from '../controllers/subscriptionPlan.controller'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/plans', protect, createSubscriptionPlan)
router.get('/plans', getAllSubscriptionPlans)
router.patch('/plans/:id', protect, updateSubscriptionPlan)
router.delete('/plans/:id', protect, deleteSubscriptionPlan)

export default router
