"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteApplication = exports.updateApplicationStatus = exports.getApplicationsByUser = exports.getApplicationsByJob = exports.applyForJob = void 0;
const http_status_1 = __importDefault(require("http-status"));
const mongoose_1 = __importDefault(require("mongoose"));
const appliedJob_model_1 = require("../models/appliedJob.model");
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const pagination_1 = require("../utils/pagination");
const createResume_model_1 = require("../models/createResume.model");
const education_model_1 = require("../models/education.model");
const experience_model_1 = require("../models/experience.model");
const elevatorPitch_model_1 = require("../models/elevatorPitch.model");
const awardsAndHonor_model_1 = require("../models/awardsAndHonor.model");
const notification_service_1 = require("../sockets/notification.service");
const job_model_1 = require("../models/job.model");
const sendEmail_1 = require("../utils/sendEmail");
const user_model_1 = require("../models/user.model");
const server_1 = require("../server");
/***************
 * CREATE Application
//  ***************/
// export const applyForJob = catchAsync(async (req: Request, res: Response) => {
//   const { jobId, userId, status, resumeId } = req.body
//   // Check if already applied
//   const exists = await AppliedJob.findOne({ jobId, userId, resumeId })
//   if (exists) {
//     throw new AppError(httpStatus.CONFLICT, 'Already applied to this job')
//   }
//   // Create application
//   const application = await AppliedJob.create({
//     jobId,
//     userId,
//     status,
//     resumeId,
//   })
//   // 🔹 Fetch job details (to know who posted it)
//   const job = await Job.findById(jobId).populate('userId', 'username')
//   if (!job) {
//     throw new AppError(httpStatus.NOT_FOUND, 'Job not found')
//   }
//   // ✅ Notify the Job Owner
//   await createNotification({
//     to: job.userId as mongoose.Types.ObjectId,
//     message: `A new candidate has applied for your job "${job.title}".`,
//     type: 'job_application',
//     id: application._id,
//   })
//   // ✅ Notify the Applicant
//   await createNotification({
//     to: userId,
//     message: `You have successfully applied for the job "${job.title}".`,
//     type: 'job_application_confirmation',
//     id: application._id,
//   })
//   res.status(httpStatus.CREATED).json({
//     success: true,
//     message: 'Application submitted',
//     data: application,
//   })
// })
exports.applyForJob = (0, catchAsync_1.default)(async (req, res) => {
    const { jobId, userId, status, resumeId, answer } = req.body;
    // 🔹 Check if already applied
    const exists = await appliedJob_model_1.AppliedJob.findOne({ jobId, userId, resumeId });
    if (exists) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'Already applied to this job');
    }
    // 🔹 Fetch job details (with recruiter info)
    const job = await job_model_1.Job.findById(jobId).populate('userId', 'name email');
    if (!job) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Job not found');
    }
    const resume = await createResume_model_1.CreateResume.findOne({ userId });
    // 🔹 Find the requirement with key "noticePeriod"
    const noticePeriodReq = job.applicationRequirement.find((req) => req.requirement === "noticePeriod");
    if (noticePeriodReq) {
        // convert both to string/boolean properly before comparing
        const resumeAvailable = resume?.immediatelyAvailable?.toString();
        if (noticePeriodReq.status === resumeAvailable) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Requirement not matched");
        }
    }
    // 🔹 Create application
    const application = await appliedJob_model_1.AppliedJob.create({
        jobId,
        userId,
        status,
        resumeId,
        answer
    });
    // 🔹 Fetch candidate info
    const candidate = await user_model_1.User.findById(userId).select('name email');
    if (!candidate) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Candidate not found');
    }
    // ✅ Notify the Job Owner
    await (0, notification_service_1.createNotification)({
        to: job.userId,
        message: `A new candidate has applied for your job "${job.title}".`,
        type: 'job_application',
        id: application._id,
    });
    // Emit socket event
    server_1.io.to(job.userId.toString()).emit('newNotification', { message: `A new candidate has applied for your job "${job.title}".`, });
    // ✅ Notify the Applicant
    await (0, notification_service_1.createNotification)({
        to: userId,
        message: `You have successfully applied for the job "${job.title}".`,
        type: 'job_application_confirmation',
        id: application._id,
    });
    // Emit socket event
    server_1.io.to(userId).emit('newNotification', { message: `You have successfully applied for the job "${job.title}".`, });
    // ✅ Send email to Applicant
    if (candidate.email) {
        const recruiterName = job.userId?.name || 'Recruiter';
        const emailSubject = `Application Received: ${job.title}`;
        const emailBody = `
      <div style="font-family: Arial, sans-serif; background: rgb(43,127,208); color: white; padding: 20px; border-radius: 8px;">
        <h2 style="margin-top: 0;">Application Confirmation</h2>
        <p>Dear ${candidate.name?.split(' ')[0] || 'Candidate'},</p>
        <p>Your application has been received and is now being reviewed.</p>
        <p>Thank you for your patience and good luck!</p>
        <p style="margin-top: 20px;">Best regards,<br/>${recruiterName}</p>
      </div>
    `;
        await (0, sendEmail_1.sendEmail)(candidate.email, emailSubject, emailBody);
    }
    res.status(http_status_1.default.CREATED).json({
        success: true,
        message: 'Application submitted',
        data: application,
    });
});
/****************************
 * GET Applications by Job ID
 ***************/
exports.getApplicationsByJob = (0, catchAsync_1.default)(async (req, res) => {
    const { jobId } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(jobId)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid Job ID');
    }
    // ✅ Extract pagination params (default: page=1, limit=10)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    // ✅ Get total count for pagination metadata
    const total = await appliedJob_model_1.AppliedJob.countDocuments({ jobId });
    // ✅ Fetch applications with pagination
    const applications = await appliedJob_model_1.AppliedJob.find({ jobId })
        .populate('userId', 'name email avatar')
        .populate('resumeId')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }); // optional: newest first
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Applications fetched by job',
        data: applications,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    });
});
/***************
 * GET Applications by User ID (with optional query)
 ***************/
exports.getApplicationsByUser = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.params;
    const { status } = req.query;
    const { page, limit, skip } = (0, pagination_1.getPaginationParams)(req.query);
    if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid User ID');
    }
    const filter = { userId };
    if (status)
        filter.status = status;
    const totalItems = await appliedJob_model_1.AppliedJob.countDocuments(filter);
    const applications = await appliedJob_model_1.AppliedJob.find(filter)
        .populate('jobId')
        .populate('userId', 'name email')
        .populate('resumeId')
        .skip(skip)
        .limit(limit);
    const createResume = await createResume_model_1.CreateResume.findOne({ userId }).lean();
    const education = await education_model_1.Education.find({ userId });
    const experience = await experience_model_1.Experience.find({ userId });
    const awardsAndHonor = await awardsAndHonor_model_1.AwardsAndHonor.find({ userId });
    const elevatorPitch = await elevatorPitch_model_1.ElevatorPitch.findOne({ userId });
    const meta = (0, pagination_1.buildMetaPagination)(totalItems, page, limit);
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Applications fetched by user',
        meta,
        data: {
            applications,
            createResume,
            education,
            experience,
            elevatorPitch,
            awardsAndHonor,
        },
    });
});
/***************
 * UPDATE Application Status
 ***************/
// export const updateApplicationStatus = catchAsync(
//   async (req: Request, res: Response) => {
//     const { id } = req.params
//     const { status } = req.body
//     if (!['shortlisted', 'rejected'].includes(status)) {
//       throw new AppError(httpStatus.BAD_REQUEST, 'Invalid status value')
//     }
//     const updated = await AppliedJob.findByIdAndUpdate(
//       id,
//       { status },
//       { new: true }
//     ).populate('jobId', 'title')
//     if (!updated) {
//       throw new AppError(httpStatus.NOT_FOUND, 'Application not found')
//     }
//     // ✅ Notify the applicant about status change
//     const jobTitle = (updated.jobId as any)?.title || 'the job'
//     let notifyMessage =
//       status === 'shortlisted'
//         ? `You have been shortlisted for the job "${jobTitle}".`
//         : `You have been rejected for the job "${jobTitle}".`
//     await createNotification({
//       to: updated.userId as mongoose.Types.ObjectId,
//       message: notifyMessage,
//       type: 'job_application_status',
//       id: updated._id,
//     })
//     res.status(httpStatus.OK).json({
//       success: true,
//       message: 'Application status updated',
//       data: updated,
//     })
//   }
// )
exports.updateApplicationStatus = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params; // candidate user id
    const { status } = req.body;
    if (!['shortlisted', 'rejected'].includes(status)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid status value');
    }
    const updated = await appliedJob_model_1.AppliedJob.findByIdAndUpdate(id, { status }, { new: true })
        .populate('jobId', 'title')
        .populate('userId', 'name email'); // ✅ fetch candidate info
    if (!updated) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Application not found');
    }
    const candidate = updated.userId;
    const recruiter = req.user; // ✅ assuming you attach recruiter info in middleware
    const jobTitle = updated.jobId?.title || 'the job';
    let emailSubject = '';
    let emailBody = '';
    if (status === 'rejected') {
        emailSubject = `Application Update: ${jobTitle}`;
        emailBody = `
    <div style="font-family: Arial, sans-serif; background: rgb(43,127,208); color: white; padding: 20px; border-radius: 8px;">
      <h2 style="margin-top: 0;">Application Update</h2>
      <p>Dear ${candidate.name?.split(' ')[0] || 'Candidate'},</p>
      <p>I’m sorry to let you know your application has been <strong>unsuccessful</strong> on this occasion and, unfortunately, due to the sheer volume of applications we receive, we cannot give personalised feedback at this stage.</p>
      <p>Please keep applying and remain hopeful that the best of your career is yet to come!</p>
      <p style="margin-top: 20px;">Best regards,<br/>${recruiter?.name || 'Recruiter'}</p>
    </div>
  `;
    }
    if (status === 'shortlisted') {
        emailSubject = `Application Update: ${jobTitle}`;
        emailBody = `
    <div style="font-family: Arial, sans-serif; background: rgb(43,127,208); color: white; padding: 20px; border-radius: 8px;">
      <h2 style="margin-top: 0;">Application Update</h2>
      <p>Dear ${candidate.name?.split(' ')[0] || 'Candidate'},</p>
      <p>Your application has been <strong>forwarded to the hiring manager</strong>, and you will be contacted outside of EVP’s platform if the hiring manager wishes to progress your application.</p>
      <p>Good luck!</p>
      <p style="margin-top: 20px;">${recruiter?.name || 'Recruiter'}</p>
    </div>
  `;
    }
    // ✅ send email
    if (candidate?.email) {
        await (0, sendEmail_1.sendEmail)(candidate.email, emailSubject, emailBody);
    }
    // ✅ also send notification in-app
    let notification = await (0, notification_service_1.createNotification)({
        to: updated.userId,
        message: status === 'shortlisted'
            ? `You have been shortlisted for the job "${jobTitle}".`
            : `You have been rejected for the job "${jobTitle}".`,
        type: 'job_application_status',
        id: updated._id,
    });
    // Emit socket event
    server_1.io.to(updated.userId.toString()).emit('newNotification', notification);
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Application status updated',
        data: updated,
    });
});
/***************
 * DELETE Application
 ***************/
exports.deleteApplication = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const deleted = await appliedJob_model_1.AppliedJob.findByIdAndDelete(id);
    if (!deleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Application not found');
    }
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Application deleted',
        data: deleted,
    });
});
