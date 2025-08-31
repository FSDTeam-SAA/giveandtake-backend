import express from 'express'
import {
  createJob,
  getAllJobs,
  updateJob,
  deleteJob,
  getSingleJob,
  recommendJobs,
  getArchivedJobs,
  getRicruitercompanyJobs,
  getPendingJobsForCompany,
  getRicruitercompanyJobs1,
  adminApproveJobs,
} from '../controllers/job.controller'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.route('/jobs').post(createJob).get(getAllJobs)

/************************
 * JOB RECOMMEND SYSTEM *
 ************************/
router.route('/jobs/recommend').get(protect,recommendJobs)
router.route('/jobs/:id').get(getSingleJob).patch(updateJob).delete(deleteJob)


/*******************************
 * GET ARCRIVED JOBS BY USERID *
 *******************************/
router.route('/jobs/archived/user').get(protect, getArchivedJobs)
router.route('/jobs/recruiter/company').get(protect, getRicruitercompanyJobs)
router.route('/all-jobs/company/:id').get( getRicruitercompanyJobs1)

/*************************************
 * GET ALL PENDING JOB ---> COMPANY *
 *************************************/
router.get('/pending/job/company', protect, getPendingJobsForCompany)

// Api for fetch jobs that need to be admin approvals  
router.get('/admin/job/approve', 
  // protect,
   adminApproveJobs)

export default router
