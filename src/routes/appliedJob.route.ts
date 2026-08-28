import express from 'express'
import {
  applyForJob,
  getMyAppliedJobIds,
  getApplicationsByJob,
  getApplicationsByUser,
  updateApplicationStatus,
  deleteApplication,
} from '../controllers/appliedJob.controller'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/', protect, applyForJob)
router.get('/me/job-ids', protect, getMyAppliedJobIds)
router.get('/job/:jobId', getApplicationsByJob)
router.get('/user/:userId', getApplicationsByUser)
router.patch('/:id/status', protect, updateApplicationStatus)
router.delete('/:id', deleteApplication)

export default router
