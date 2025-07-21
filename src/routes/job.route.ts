import express from 'express'
import {
  createJob,
  getAllJobs,
  updateJob,
  deleteJob,
  getSingleJob,
  recommendJobs,
  getArchivedJobs,
} from '../controllers/job.controller'

const router = express.Router()

router.post('/jobs', createJob)
router.get('/jobs', getAllJobs)
router.get('/jobs/:id', getSingleJob)
router.patch('/jobs/:id', updateJob)
router.delete('/jobs/:id', deleteJob)

/************************
 * JOB RECOMMEND SYSTEM *
 ************************/
router.get('/jobs/recommend', recommendJobs)

/*******************************
 * GET ARCRIVED JOBS BY USERID *
 *******************************/
router.route('/jobs/archived').get(getArchivedJobs)

export default router
