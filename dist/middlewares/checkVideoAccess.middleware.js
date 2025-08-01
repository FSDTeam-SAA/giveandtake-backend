"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkVideoAccess = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const elevatorPitch_model_1 = require("../models/elevatorPitch.model");
const AppError_1 = __importDefault(require("../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const appliedJob_model_1 = require("../models/appliedJob.model");
const job_model_1 = require("../models/job.model");
exports.checkVideoAccess = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params; // ElevatorPitch ID
    const userId = req.user?.id; // From auth middleware
    const pitch = await elevatorPitch_model_1.ElevatorPitch.findById(id);
    if (!pitch) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Elevator pitch not found');
    }
    // Check if the user is the owner
    if (pitch.userId.toString() === userId) {
        return next();
    }
    // Check if the user is an applicant for a job where this pitch was submitted
    const appliedJob = await appliedJob_model_1.AppliedJob.findOne({
        userId: pitch.userId, // The pitch owner applied for a job
    });
    if (!appliedJob) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Access denied');
    }
    // Check if the requesting user is the job poster
    const job = await job_model_1.Job.findById(appliedJob.jobId);
    if (job && job.userId.toString() === userId) {
        return next();
    }
    throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Access denied');
});
