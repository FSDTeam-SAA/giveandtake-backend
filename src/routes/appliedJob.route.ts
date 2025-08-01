import express from 'express'
import {
  applyForJob,
  getApplicationsByJob,
  getApplicationsByUser,
  updateApplicationStatus,
  deleteApplication,
} from '../controllers/appliedJob.controller'

const router = express.Router()

router.post('/', applyForJob)
router.get('/job/:jobId', getApplicationsByJob)
router.get('/user/:userId', getApplicationsByUser)
router.patch('/:id/status', updateApplicationStatus)
router.delete('/:id', deleteApplication)

export default router
