import express from "express";
import {
  createJob,
  getAllJobs,
  updateJob,
  deleteJob,
  getSingleJob,
  recommendJobs,
  getArchivedJobs,
  getRecruiterCompanyJobs,
  getPendingJobsForCompany,
  getRicruitercompanyJobs1,
  adminApproveJobs,
  getRicruitercompanyJobs2,
  getRicruitercompanyJobs3,
  toggleArchiveJob,
  editJob,
  getJobPostingUsage,
} from "../controllers/job.controller";
import { getJobFitInsight } from "../controllers/jobFit.controller";
import { protect } from "../middlewares/auth.middleware";

const router = express.Router();

router.route("/jobs").post(createJob).get(getAllJobs);
router.get("/jobs/posting/usage", protect, getJobPostingUsage);
router.get("/jobs/:jobId/ai-fit", protect, getJobFitInsight);

/************************
 * JOB RECOMMEND SYSTEM *
 ************************/
router.route("/jobs/recommend").get(protect, recommendJobs);
router.route("/jobs/:id").get(getSingleJob).patch(updateJob).delete(deleteJob);

router.route("/jobs/update/:id").patch(protect, editJob);

/*******************************
 * GET ARCRIVED JOBS BY USERID *
 *******************************/

router.route("/jobs/archived/user").get(protect, getArchivedJobs);
router.patch("/jobs/:jobId/archive", protect, toggleArchiveJob);

router.route("/jobs/recruiter/company").get(protect, getRecruiterCompanyJobs);
router.route("/all-jobs/company/:id").get(getRicruitercompanyJobs1);
router.route("/all-jobs/recruiter/:id").get(getRicruitercompanyJobs3);
router.route("/all-jobs-for-company/company/:id").get(getRicruitercompanyJobs2);

/*************************************
 * GET ALL PENDING JOB ---> COMPANY *
 *************************************/
router.get("/pending/job/company", protect, getPendingJobsForCompany);

// Api for fetch jobs that need to be admin approvals
router.get(
  "/admin/job/approve",
  // protect,
  adminApproveJobs
);

export default router;
