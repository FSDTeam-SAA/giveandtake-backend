import express from 'express'
import {
  createAwardAndHonor,
  getByUserId,
  updateAwardsAndHonor,
  deleteAwardsAndHonor,
} from '../controllers/awardsAndHonor.controller'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/award-honor', protect, createAwardAndHonor)
router.get('/award-honor/:userId', protect, getByUserId)
router.patch('/award-honor/:id', protect, updateAwardsAndHonor)
router.delete('/award-honor/:id', protect, deleteAwardsAndHonor)

export default router
