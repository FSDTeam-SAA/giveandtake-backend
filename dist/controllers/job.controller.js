"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRicruitercompanyJobs = exports.getArchivedJobs = exports.recommendJobs = exports.getSingleJob = exports.deleteJob = exports.updateJob = exports.getAllJobs = exports.createJob = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const job_model_1 = require("../models/job.model");
const pagination_1 = require("../utils/pagination");
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const createResume_model_1 = require("../models/createResume.model");
/*******************
 * // CREATE A JOB *
 *******************/
// export const createJob = catchAsync(async (req: Request, res: Response) => {
//   const {
//     userId,
//     title,
//     description,
//     location,
//     companyName,
//     salaryRange,
//     shift,
//     jobType,
//     company,
//   } = req.body
//   if (!userId || !title) {
//     throw new AppError(httpStatus.BAD_REQUEST, 'Please fill in all fields')
//   }
//   const job = await Job.create({
//     userId,
//     title,
//     description,
//     companyName,
//     salaryRange,
//     location,
//     jobType,
//     company,
//     shift,
//   })
//   sendResponse(res, {
//     statusCode: httpStatus.CREATED,
//     success: true,
//     message: 'Job created successfully',
//     data: job,
//   })
// })
exports.createJob = (0, catchAsync_1.default)(async (req, res) => {
    const { userId, companyId, title, description, companyName, salaryRange, location, shift, responsibilities, educationExperience, benefits, vacancy, experience, deadline, status, jobCategoryId, compensation, arcrivedJob, applicationRequirement, customQuestion, } = req.body;
    if (!userId || !title || !description) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Please fill in all required fields');
    }
    const job = new job_model_1.Job({
        userId,
        companyId,
        title,
        description,
        companyName,
        salaryRange,
        location,
        shift,
        responsibilities,
        educationExperience,
        benefits,
        vacancy,
        experience,
        deadline,
        status,
        jobCategoryId,
        compensation,
        arcrivedJob,
        applicationRequirement,
        customQuestion,
    });
    await job.save();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Job created successfully',
        data: job,
    });
});
/********************************************
 * GET ALL JOBS WITH FILTERS AND PAGINATION *
 ********************************************/
exports.getAllJobs = (0, catchAsync_1.default)(async (req, res) => {
    const { title, location } = req.query;
    const filter = {};
    if (title)
        filter.title = { $regex: title, $options: 'i' };
    if (location)
        filter.location = { $regex: location, $options: 'i' };
    const { page, limit, skip } = (0, pagination_1.getPaginationParams)(req.query);
    const totalJobs = await job_model_1.Job.countDocuments(filter);
    console.log('first');
    const jobs = await job_model_1.Job.find({ ...filter, arcrivedJob: false })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        // .populate('userId', 'name email')
        .populate('companyId');
    console.log(2, jobs);
    const meta = (0, pagination_1.buildMetaPagination)(totalJobs, page, limit);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Jobs fetched successfully',
        data: { meta, jobs },
    });
});
/*******************
 * // UPDATE A JOB *
 *******************/
exports.updateJob = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const updated = await job_model_1.Job.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Job not found');
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Job updated successfully',
        data: updated,
    });
});
/*******************
 * // DELETE A JOB *
 *******************/
exports.deleteJob = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const deleted = await job_model_1.Job.findByIdAndDelete(id);
    if (!deleted)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Job not found');
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Job deleted successfully',
        data: deleted,
    });
});
/***************************
 *    // GET SINGLE JOB    *
 * // GET SINGLE JOB BY ID *
 ***************************/
exports.getSingleJob = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const job = await job_model_1.Job.findById(id);
    if (!job) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Job not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Job retrieved successfully',
        data: job,
    });
});
/************************
 * JOB RECOMMEND SYSTEM *
 ************************/
exports.recommendJobs = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.query;
    if (!userId) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'userId is required');
    }
    const resume = await createResume_model_1.CreateResume.findOne({ userId }).lean();
    if (!resume) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Resume not found');
    }
    const { title, country, skills = [], jobCategoryId } = resume;
    const matchConditions = [];
    if (title)
        matchConditions.push({ title: { $regex: new RegExp(title, 'i') } });
    if (country)
        matchConditions.push({ location: { $regex: new RegExp(country, 'i') } });
    if (skills.length > 0)
        matchConditions.push({ responsibilities: { $in: skills } });
    if (jobCategoryId)
        matchConditions.push({ jobCategoryId });
    const jobs = await job_model_1.Job.find({ $or: matchConditions, status: 'active' })
        .limit(50)
        .lean();
    const exactMatches = [];
    const partialMatches = [];
    jobs.forEach((job) => {
        let score = 0;
        if (title && job.title?.toLowerCase().includes(title.toLowerCase()))
            score += 3;
        if (country && job.location?.toLowerCase().includes(country.toLowerCase()))
            score += 2;
        if (skills.length > 0 &&
            job.responsibilities?.some((r) => skills.includes(r)))
            score += 1;
        if (score >= 5) {
            exactMatches.push({ job, score });
        }
        else {
            partialMatches.push({ job, score });
        }
    });
    // Sort by score (highest first)
    exactMatches.sort((a, b) => b.score - a.score);
    partialMatches.sort((a, b) => b.score - a.score);
    if (exactMatches.length === 0 && partialMatches.length === 0) {
        const fallbackJobs = await job_model_1.Job.find({ status: 'active' }).limit(5);
        (0, sendResponse_1.default)(res, {
            statusCode: http_status_1.default.OK,
            success: true,
            message: 'No exact or partial matches found.',
            data: {
                exactMatches,
                partialMatches,
                fallbackJobs,
            },
        });
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Recommended jobs fetched successfully',
        data: {
            exactMatches,
            partialMatches,
        },
    });
});
/*******************************
 * GET ARCRIVED JOBS BY USERID *
 *******************************/
exports.getArchivedJobs = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req.user?._id;
    if (!userId)
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'User not found');
    const archivedJobs = await job_model_1.Job.find({ userId, arcrivedJob: true }).sort({
        createAt: -1,
    });
    if (!archivedJobs)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'No archived jobs found');
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Archived jobs fetched successfully',
        data: archivedJobs,
    });
});
/************************************************
 * FETCH JOBS THAT RICRUTER AND COMPANY CREATED *
 ************************************************/
exports.getRicruitercompanyJobs = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req.user?._id;
    if (!userId)
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'User not found');
    const Jobs = await job_model_1.Job.find({ userId, arcrivedJob: false }).sort({
        createAt: -1,
    });
    if (!Jobs)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'No archived jobs found');
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'jobs fetched successfully',
        data: Jobs,
    });
});
