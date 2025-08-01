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
/***************
 * CREATE Application
 ***************/
exports.applyForJob = (0, catchAsync_1.default)(async (req, res) => {
    const { jobId, userId, status } = req.body;
    const exists = await appliedJob_model_1.AppliedJob.findOne({ jobId, userId });
    if (exists) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'Already applied to this job');
    }
    const application = await appliedJob_model_1.AppliedJob.create({ jobId, userId, status });
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
    const applications = await appliedJob_model_1.AppliedJob.find({ jobId }).populate('userId', 'name email');
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Applications fetched by job',
        data: applications,
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
        .skip(skip)
        .limit(limit);
    const createResume = await createResume_model_1.CreateResume.findOne({ userId }).lean();
    const education = await education_model_1.Education.find({ userId });
    const experience = await experience_model_1.Experience.find({ userId });
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
        },
    });
});
/***************
 * UPDATE Application Status
 ***************/
exports.updateApplicationStatus = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!['shortlisted', 'rejected'].includes(status)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid status value');
    }
    const updated = await appliedJob_model_1.AppliedJob.findByIdAndUpdate(id, { status }, { new: true });
    if (!updated) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Application not found');
    }
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
