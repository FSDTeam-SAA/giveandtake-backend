import express from 'express'
import {
  createJob,
  getAllJobs,
  updateJob,
  deleteJob,
  getSingleJob,
} from '../controllers/job.controller'

const router = express.Router()

router.post('/jobs', createJob)
router.get('/jobs', getAllJobs)
router.get('/:id', getSingleJob)
router.patch('/jobs/:id', updateJob)
router.delete('/jobs/:id', deleteJob)

export default router
