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
const user_model_1 = require("../models/user.model");
const assignCompanyReq_model_1 = require("../models/assignCompanyReq.model");
const mongoose_1 = __importDefault(require("mongoose"));
const elevatorPitch_model_1 = require("../models/elevatorPitch.model");
/****************************
 * CREATE RECRUITER ACCOUNT *
 ****************************/
exports.createRecruiterAccount = (0, catchAsync_1.default)(async (req, res) => {
    const { userId, ...rest } = req.body;
    const user = await user_model_1.User.findById(userId);
    if (!user) {
        throw new AppError_1.default(400, "User Not Found");
    }
    const existing = await recruiterAccount_model_1.RecruiterAccount.findOne({ userId });
    if (existing) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Account already exists for this user');
    }
    let videoUrl = '';
    let photoUrl = '';
    let banner = '';
    // @ts-ignore
    const files = req.files;
    if (files?.videoFile?.[0]) {
        const uploaded = await (0, cloudinary_1.uploadToCloudinary)(files.videoFile[0].path);
        if (uploaded)
            videoUrl = uploaded.secure_url;
    }
    if (files?.photo?.[0]) {
        const uploaded = await (0, cloudinary_1.uploadToCloudinary)(files.photo[0].path);
        if (uploaded) {
            photoUrl = uploaded.secure_url;
            if (!user.avatar) {
                user.avatar = { url: "" }; // initialize if missing
            }
            user.avatar.url = uploaded.secure_url || "";
            await user?.save();
        }
    }
    if (files?.banner?.[0]?.path) {
        const certRes = await (0, cloudinary_1.uploadToCloudinary)(files.banner[0].path);
        if (certRes?.secure_url) {
            banner = certRes.secure_url;
        }
    }
    const { companyId, ...saferest } = rest;
    if (companyId) {
        const reqCom = await assignCompanyReq_model_1.ReqCompany.findOneAndUpdate({ userId, company: companyId }, // match condition
        { $setOnInsert: { userId, company: new mongoose_1.default.Types.ObjectId(companyId) } }, // insert only if not exists
        { upsert: true, new: true } // create if not exists, return the doc
        );
    }
    const recruiterAccount = await recruiterAccount_model_1.RecruiterAccount.create({
        userId,
        videoFile: videoUrl,
        photo: photoUrl,
        banner,
        ...saferest,
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
    const account = await recruiterAccount_model_1.RecruiterAccount.findOne({ userId }).populate('companyId', '-verificationInfo -password_reset_token -deactivate');
    if (!account) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Recruiter account not found');
    }
    const pitch = await elevatorPitch_model_1.ElevatorPitch.findOne({ userId: userId });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Recruiter account fetched successfully',
        data: { ...account.toObject(), elevatorPitch: pitch || null, // add pitch data or null
        },
    });
});
/****************************
 * UPDATE RECRUITER ACCOUNT *
 ****************************/
exports.updateRecruiterAccount = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.params;
    const updates = { ...req.body };
    const user = await user_model_1.User.findById(userId);
    if (!user) {
        throw new AppError_1.default(400, "User Not Found");
    }
    // @ts-ignore
    const files = req.files;
    const existingAccount = await recruiterAccount_model_1.RecruiterAccount.findOne({ userId });
    if (!existingAccount) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Recruiter account not found');
    }
    if (files?.videoFile) {
        const uploaded = await (0, cloudinary_1.uploadToCloudinary)(files.videoFile[0].path);
        if (uploaded)
            updates.videoFile = uploaded.secure_url;
    }
    // // Handle new video upload
    if (files?.banner) {
        const uploadedVideo = await (0, cloudinary_1.uploadToCloudinary)(files?.banner[0]?.path);
        if (uploadedVideo?.secure_url) {
            updates.banner = uploadedVideo.secure_url;
            // Optional: delete old video from Cloudinary if storing public_id
        }
    }
    // Handle new photo upload
    if (files?.photo) {
        const uploadedPhoto = await (0, cloudinary_1.uploadToCloudinary)(files?.photo[0]?.path);
        if (uploadedPhoto?.secure_url) {
            updates.photo = uploadedPhoto.secure_url;
            // Optional: delete old photo from Cloudinary if storing public_id
            if (!user.avatar) {
                user.avatar = { url: "" }; // initialize if missing
            }
            user.avatar.url = uploadedPhoto.secure_url || "";
            await user?.save();
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
