import express from 'express'
import {
  createAwardAndHonor,
  getByUserId,
  updateAwardsAndHonor,
  deleteAwardsAndHonor,
} from '../controllers/awardsAndHonor.controller'

const router = express.Router()

router.post('/award-honor', createAwardAndHonor)
router.get('/award-honor/:userId', getByUserId)
router.patch('/award-honor/:id', updateAwardsAndHonor)
router.delete('/award-honor/:id', deleteAwardsAndHonor)

export default router
