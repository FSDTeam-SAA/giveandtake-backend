import express from 'express'
import {
  applyForJob,
  getMyAppliedJobIds,
  getApplicationsByJob,
  getApplicationsByUser,
  updateApplicationStatus,
  deleteApplication,
  getApplicationRequirements,
} from '../controllers/appliedJob.controller'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/', protect, applyForJob)
router.get('/me/job-ids', protect, getMyAppliedJobIds)
router.get('/me/requirements', protect, getApplicationRequirements)
router.get('/job/:jobId', protect, getApplicationsByJob)
router.get('/user/:userId', protect, getApplicationsByUser)
router.patch('/:id/status', protect, updateApplicationStatus)
router.delete('/:id', protect, deleteApplication)

export default router
