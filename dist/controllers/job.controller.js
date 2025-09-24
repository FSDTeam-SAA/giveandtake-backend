"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminApproveJobs = exports.getPendingJobsForCompany = exports.getRicruitercompanyJobs1 = exports.getRecruiterCompanyJobs = exports.getArchivedJobs = exports.recommendJobs = exports.getSingleJob = exports.deleteJob = exports.updateJob = exports.getAllJobs = exports.createJob = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const job_model_1 = require("../models/job.model");
const pagination_1 = require("../utils/pagination");
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const createResume_model_1 = require("../models/createResume.model");
const user_model_1 = require("../models/user.model");
const recruiterAccount_model_1 = require("../models/recruiterAccount.model");
const company_model_1 = require("../models/company.model");
const appliedJob_model_1 = require("../models/appliedJob.model");
const sendEmail_1 = require("../utils/sendEmail");
const server_1 = require("../server");
const notification_service_1 = require("../sockets/notification.service");
const notification_model_1 = require("../models/notification.model");
const following_model_1 = require("../models/following.model");
/*******************
 * // CREATE A JOB *
 *******************/
exports.createJob = (0, catchAsync_1.default)(async (req, res) => {
    const { userId, title, description, companyName, salaryRange, location, shift, responsibilities, educationExperience, benefits, vacancy, experience, deadline, status, jobCategoryId, compensation, arcrivedJob, applicationRequirement, customQuestion, employement_Type, website_Url, publishDate, career_Stage, location_Type, name, role, } = req.body;
    if (!userId || !title || !description) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Please fill in all required fields');
    }
    // CHECK THE USER
    const user = await user_model_1.User.findById(userId);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    }
    // ROLE BASE APPROVE LOGIC
    let jobApprove = 'approved';
    let companyId;
    let recruiterId;
    if (user.role === 'company') {
        jobApprove = 'approved';
        const a = await company_model_1.Company.findOne({ userId: userId });
        if (a) {
            companyId = a._id;
        }
    }
    else if (user.role === 'recruiter') {
        jobApprove = 'approved';
        const a = await recruiterAccount_model_1.RecruiterAccount.findOne({ userId: userId });
        if (a) {
            if (a.companyId) {
                companyId = a.companyId;
            }
            else {
                recruiterId = a._id;
            }
        }
    }
    else {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'You are not authorized to create a job');
    }
    // await checkIfUserCanPostJob(userId)
    const job = new job_model_1.Job({
        userId,
        companyId,
        recruiterId,
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
        jobApprove,
        employement_Type,
        website_Url,
        publishDate,
        location_Type,
        career_Stage,
        name,
        role,
    });
    await job.save();
    // 🔹 Find followers
    let followers = [];
    if (companyId) {
        followers = await following_model_1.Following.find({ companyId });
    }
    else if (recruiterId) {
        followers = await following_model_1.Following.find({ recruiterId });
    }
    if (followers.length > 0) {
        const notifications = followers.map((f) => ({
            userId: f.userId,
            message: `New job posted: ${title}`,
            jobId: job._id,
            type: "job_post",
        }));
        const saved = await notification_model_1.Notification.insertMany(notifications);
        // 🔹 Emit via socket
        saved.forEach((n) => {
            server_1.io.to(n.userId.toString()).emit("newNotification", n);
        });
    }
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
    const { title, location, jobCategoryId } = req.query;
    const filter = {};
    if (title)
        filter.title = { $regex: title, $options: 'i' };
    if (location)
        filter.location = { $regex: location, $options: 'i' };
    if (jobCategoryId)
        filter.jobCategoryId = jobCategoryId; // <-- filter by category
    // Ensure publishDate is null OR publishDate <= today
    filter.$or = [
        { publishDate: { $exists: false } },
        { publishDate: null },
        { publishDate: { $lte: new Date() } },
    ];
    const { page, limit, skip } = (0, pagination_1.getPaginationParams)(req.query);
    const totalJobs = await job_model_1.Job.countDocuments({
        ...filter,
        arcrivedJob: false,
        jobApprove: 'approved',
        adminApprove: true,
    });
    const jobs = await job_model_1.Job.find({
        ...filter,
        arcrivedJob: false,
        adminApprove: true,
        jobApprove: 'approved',
    })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .populate('companyId recruiterId');
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
    const job = await job_model_1.Job.findById(id).populate("userId");
    if (!job) {
        throw new AppError_1.default(400, "job not found");
    }
    const user = job.userId;
    if (req.body.adminApprove) {
        // const recruiterName = (job.userId as any)?.name || 'Recruiter'
        const emailSubject = `Job Post Approved By Admin`;
        const emailBody = `
      <div style="font-family: Arial, sans-serif; background: rgb(43,127,208); color: white; padding: 20px; border-radius: 8px;">
        <h2 style="margin-top: 0;">Application Confirmation</h2>
        <p>Dear ${user?.name || 'Company'},</p> 
        <p>Your post has been approved by Admin and will be posted at your scheduled time’,</br> Best regards, EVP Admin</p>
      </div>
    `;
        await (0, sendEmail_1.sendEmail)(user?.email, emailSubject, emailBody);
        let notification = await (0, notification_service_1.createNotification)({
            to: job.userId._id,
            message: 'Job Post Approved By Admin',
            type: 'job_application_status',
            id: job._id,
        });
        // Emit socket event
        server_1.io.to(job.userId._id.toString()).emit('newNotification', notification);
    }
    else {
        const emailSubject = `Job Post Denied By Admin`;
        const emailBody = `
      <div style="font-family: Arial, sans-serif; background: rgb(43,127,208); color: white; padding: 20px; border-radius: 8px;">
        <h2 style="margin-top: 0;">Application Denied</h2>
        <p>Dear ${user?.name || 'Company'},</p>  
        <p>‘Please reach out to Admin for support regarding your job post’ on Info@evp.com</p>
      </div>
    `;
        await (0, sendEmail_1.sendEmail)(user?.email, emailSubject, emailBody);
        let notification = await (0, notification_service_1.createNotification)({
            to: job.userId._id,
            message: 'Job Post Denied By Admin',
            type: 'job_application_status',
            id: job._id,
        });
        // Emit socket event
        server_1.io.to(job.userId._id.toString()).emit('newNotification', notification);
    }
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
    const job = await job_model_1.Job.findById(id).populate('companyId recruiterId');
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
    // const { userId } = req.query
    const userId = req.user?._id;
    if (!userId) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'userId is required');
    }
    const resume = await createResume_model_1.CreateResume.findOne({ userId }).lean();
    if (!resume) {
        (0, sendResponse_1.default)(res, {
            statusCode: 200,
            success: true,
            message: 'No resume found for the User',
            data: { exactMatches: [], partialMatches: [] },
        });
    }
    const title = resume?.title;
    const country = resume?.country;
    const skills = resume?.skills || [];
    const jobCategoryId = resume?.jobCategoryId;
    // const { title, country, skills = [], jobCategoryId } = resume
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
// export const getRicruitercompanyJobs = catchAsync(async (req, res) => {
//   const userId = req.user?._id;
//   if (!userId) throw new AppError(httpStatus.BAD_REQUEST, "User not found");
//   // const Jobs = await Job.find({ userId, arcrivedJob: false }).sort({
//   //   createAt: -1,
//   // });
//   // if (!Jobs) throw new AppError(httpStatus.NOT_FOUND, "No archived jobs found");
//   // const applicantCount = await AppliedJob.countDocuments({jobId: Jobs._id})
//   const Jobs = await Job.find({ userId, arcrivedJob: false }).sort({
//     createdAt: -1,
//   });
//   if (!Jobs.length) {
//     sendResponse(res, {
//       statusCode: httpStatus.OK,
//       success: true,
//       message: "No jobs found",
//       data: [],
//     });
//   }
//   const jobsWithApplicants = await Promise.all(
//     Jobs.map(async (job) => {
//       const applicantCount = await AppliedJob.countDocuments({
//         jobId: job._id,
//       });
//       return { ...job.toObject(), applicantCount };
//     })
//   );
//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: "jobs fetched successfully",
//     data: jobsWithApplicants,
//   });
// });
// export const getRecruiterCompanyJobs = catchAsync(async (req, res) => {
//   const userId = req.user?._id
//   if (!userId) throw new AppError(httpStatus.BAD_REQUEST, 'User not found')
//   // Get the company document for this user, if any
//   const company = await Company.findOne({ userId })
//   // Match jobs where:
//   // 1. job.userId === logged-in user
//   // 2. job.companyId === logged-in user (if user is a company)
//   // 3. job.companyId === company._id (if user has a company record)
//   const Jobs = await Job.find({
//     $or: [
//       { userId }, // jobs created by the user
//       { companyId: userId }, // user account itself is a company
//       ...(company ? [{ companyId: company._id }] : []), // jobs created by user's company
//     ],
//     arcrivedJob: false,
//   }).sort({ createdAt: -1 })
//   if (!Jobs.length) {
//     return sendResponse(res, {
//       statusCode: httpStatus.OK,
//       success: true,
//       message: 'No jobs found',
//       data: [],
//     })
//   }
//   const jobsWithApplicants = await Promise.all(
//     Jobs.map(async (job) => {
//       const applicantCount = await AppliedJob.countDocuments({ jobId: job._id })
//       return { ...job.toObject(), applicantCount }
//     })
//   )
//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: 'Jobs fetched successfully',
//     data: jobsWithApplicants,
//   })
// })
exports.getRecruiterCompanyJobs = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req.user?._id;
    if (!userId)
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'User not found');
    // Get the company document for this user, if any
    const company = await company_model_1.Company.findOne({ userId });
    // Match jobs where:
    const Jobs = await job_model_1.Job.find({
        $or: [
            { userId }, // jobs created by the user
            { companyId: userId }, // user account itself is a company
            ...(company ? [{ companyId: company._id }] : []), // jobs created by user's company
        ],
        arcrivedJob: false,
    }).sort({ createdAt: -1 });
    if (!Jobs.length) {
        return (0, sendResponse_1.default)(res, {
            statusCode: http_status_1.default.OK,
            success: true,
            message: 'No jobs found',
            data: [],
        });
    }
    const today = new Date();
    const jobsWithApplicants = await Promise.all(Jobs.map(async (job) => {
        const applicantCount = await appliedJob_model_1.AppliedJob.countDocuments({ jobId: job._id });
        let derivedStatus = 'Pending';
        if (job.publishDate && job.adminApprove) {
            if (job.publishDate <= today) {
                derivedStatus = 'Live';
            }
            else {
                derivedStatus = 'Scheduled (Admin Approved)';
            }
        }
        else if (job.publishDate && !job.adminApprove) {
            if (job.publishDate > today) {
                derivedStatus = 'Scheduled';
            }
        }
        return {
            ...job.toObject(),
            applicantCount,
            derivedStatus, // 👈 new status field
        };
    }));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Jobs fetched successfully',
        data: jobsWithApplicants,
    });
});
exports.getRicruitercompanyJobs1 = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req.params.id;
    const Jobs = await job_model_1.Job.find({
        companyId: userId,
        arcrivedJob: false,
        jobApprove: 'approved',
    })
        .sort({
        createdAt: -1,
    })
        .populate('companyId');
    // if (!Jobs) throw new AppError(httpStatus.NOT_FOUND, 'No jobs found')
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'jobs fetched successfully',
        data: Jobs,
    });
});
/*************************************
 * GET ALL PENDING JOB ---> COMPANY *
 *************************************/
exports.getPendingJobsForCompany = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req.user?._id;
    // ✅ Extract pagination params (default: page=1, limit=10)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const company = await company_model_1.Company.findOne({ userId: userId });
    const companyId = company?._id;
    console.log(1, companyId);
    if (!companyId) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Company ID is required');
    }
    // FIND ALL RECRUITER CONNECTED TO THE COMPANY
    const recruiters = await recruiterAccount_model_1.RecruiterAccount.find({ companyId }).select('userId');
    console.log('recruiter', recruiters);
    if (!recruiters || recruiters.length === 0) {
        (0, sendResponse_1.default)(res, {
            statusCode: http_status_1.default.OK,
            success: true,
            message: 'No recruiters found for this company',
            data: [],
        });
        return;
    }
    // EXTRACT RECRUITER USER IDs
    const recruiterUserIds = recruiters.map((recruiter) => recruiter.userId);
    console.log('recruiterUserIds', recruiterUserIds);
    // FIND ALL pending JOBS POSTED BY THESE RECRUITERS
    const pendingJobs = await job_model_1.Job.find({
        userId: { $in: recruiterUserIds },
    })
        .sort({ createdAt: -1 })
        .populate('userId', 'name role avatar')
        .populate('jobCategoryId')
        .skip(skip)
        .limit(limit);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Pending jobs fetched successfully',
        data: pendingJobs,
    });
});
// Api for fetch jobs that need to be admin approvals
exports.adminApproveJobs = (0, catchAsync_1.default)(async (req, res) => {
    const { page, limit, skip } = (0, pagination_1.getPaginationParams)(req.query);
    const jobs = await job_model_1.Job.find({ jobApprove: 'approved' })
        .populate('companyId recruiterId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    const total = await job_model_1.Job.countDocuments({});
    const meta = (0, pagination_1.buildMetaPagination)(total, page, limit);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Pending jobs fetched successfully',
        data: { jobs, meta },
    });
});
