"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteRecruiterAccount = exports.updateRecruiterAccount = exports.getRecruiterAccountByUserId = exports.createRecruiterAccount = void 0;
const http_status_1 = __importDefault(require("http-status"));
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const recruiterAccount_model_1 = require("../models/recruiterAccount.model");
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const cloudinary_1 = require("../utils/cloudinary");
/****************************
 * CREATE RECRUITER ACCOUNT *
 ****************************/
exports.createRecruiterAccount = (0, catchAsync_1.default)(async (req, res) => {
    const { userId, ...rest } = req.body;
    const existing = await recruiterAccount_model_1.RecruiterAccount.findOne({ userId });
    if (existing) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Account already exists for this user');
    }
    let videoUrl = '';
    let photoUrl = '';
    // @ts-ignore
    const files = req.files;
    if (files?.videoFile?.[0]) {
        const uploaded = await (0, cloudinary_1.uploadToCloudinary)(files.videoFile[0].path);
        if (uploaded)
            videoUrl = uploaded.secure_url;
    }
    if (files?.photo?.[0]) {
        const uploaded = await (0, cloudinary_1.uploadToCloudinary)(files.photo[0].path);
        if (uploaded)
            photoUrl = uploaded.secure_url;
    }
    const recruiterAccount = await recruiterAccount_model_1.RecruiterAccount.create({
        userId,
        videoFile: videoUrl,
        photo: photoUrl,
        ...rest,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Recruiter account created successfully',
        data: recruiterAccount,
    });
});
/************************************
 * GET RECRUITER ACCOUNT BY USER ID *
 ************************************/
exports.getRecruiterAccountByUserId = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.params;
    const account = await recruiterAccount_model_1.RecruiterAccount.findOne({ userId });
    if (!account) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Recruiter account not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Recruiter account fetched successfully',
        data: account,
    });
});
/****************************
 * UPDATE RECRUITER ACCOUNT *
 ****************************/
exports.updateRecruiterAccount = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.params;
    const updates = { ...req.body };
    // @ts-ignore
    const files = req.files;
    const existingAccount = await recruiterAccount_model_1.RecruiterAccount.findOne({ userId });
    if (!existingAccount) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Recruiter account not found');
    }
    // Handle new video upload
    if (files?.videoFile?.[0]) {
        const uploadedVideo = await (0, cloudinary_1.uploadToCloudinary)(files.videoFile[0].path);
        if (uploadedVideo?.secure_url) {
            updates.videoFile = uploadedVideo.secure_url;
            // Optional: delete old video from Cloudinary if storing public_id
        }
    }
    // Handle new photo upload
    if (files?.photo?.[0]) {
        const uploadedPhoto = await (0, cloudinary_1.uploadToCloudinary)(files.photo[0].path);
        if (uploadedPhoto?.secure_url) {
            updates.photo = uploadedPhoto.secure_url;
            // Optional: delete old photo from Cloudinary if storing public_id
        }
    }
    const updatedAccount = await recruiterAccount_model_1.RecruiterAccount.findOneAndUpdate({ userId }, updates, { new: true, runValidators: true });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Recruiter account updated successfully',
        data: updatedAccount,
    });
});
/*******************************
 * * DELETE RECRUITER ACCOUNT *
 *******************************/
exports.deleteRecruiterAccount = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.params;
    const deleted = await recruiterAccount_model_1.RecruiterAccount.findOneAndDelete({ userId });
    if (!deleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Recruiter account not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Recruiter account deleted successfully',
        data: deleted,
    });
});
