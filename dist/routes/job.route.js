"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const job_controller_1 = require("../controllers/job.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = express_1.default.Router();
router.route('/jobs').post(job_controller_1.createJob).get(job_controller_1.getAllJobs);
router.route('/jobs/:id').get(job_controller_1.getSingleJob).patch(job_controller_1.updateJob).delete(job_controller_1.deleteJob);
/************************
 * JOB RECOMMEND SYSTEM *
 ************************/
router.route('/jobs/recommend').get(job_controller_1.recommendJobs);
/*******************************
 * GET ARCRIVED JOBS BY USERID *
 *******************************/
router.route('/jobs/archived/user').get(auth_middleware_1.protect, job_controller_1.getArchivedJobs);
router.route('/jobs/ricruiter/company').get(auth_middleware_1.protect, job_controller_1.getRicruitercompanyJobs);
exports.default = router;
