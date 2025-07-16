import express from 'express'
import {
  createJob,
  getAllJobs,
  updateJob,
  deleteJob,
  getSingleJob,
  recommendJobs,
} from '../controllers/job.controller'

const router = express.Router()

router.post('/jobs', createJob)
router.get('/jobs', getAllJobs)
router.get('/:id', getSingleJob)
router.patch('/jobs/:id', updateJob)
router.delete('/jobs/:id', deleteJob)

/************************
 * JOB RECOMMEND SYSTEM *
 ************************/
router.get('/recommend', recommendJobs)

export default router
