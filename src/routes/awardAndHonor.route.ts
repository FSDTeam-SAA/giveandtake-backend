import { fieldLimits } from '../middlewares/fieldLimits'
import express from 'express'
import {
  createAwardAndHonor,
  getByUserId,
  updateAwardsAndHonor,
  deleteAwardsAndHonor,
} from '../controllers/awardsAndHonor.controller'

const router = express.Router()

router.post('/award-honor', fieldLimits('award'), createAwardAndHonor)
router.get('/award-honor/:userId', getByUserId)
router.patch('/award-honor/:id', fieldLimits('award'), updateAwardsAndHonor)
router.delete('/award-honor/:id', deleteAwardsAndHonor)

export default router
