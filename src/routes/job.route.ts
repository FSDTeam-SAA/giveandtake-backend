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
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.route('/jobs').post(createJob).get(getAllJobs)

router.route('/jobs/:id').get(getSingleJob).patch(updateJob).delete(deleteJob)

/************************
 * JOB RECOMMEND SYSTEM *
 ************************/
router.route('/jobs/recommend').get(recommendJobs)

/*******************************
 * GET ARCRIVED JOBS BY USERID *
 *******************************/
router.route('/jobs/archived/user').get(protect, getArchivedJobs)

export default router
