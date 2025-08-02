"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.countFollowers = exports.unfollowEntity = exports.followEntity = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const following_model_1 = require("../models/following.model");
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
/***********************
 * CREATE FOLLOW ENTRY *
 ***********************/
exports.followEntity = (0, catchAsync_1.default)(async (req, res) => {
    const { recruiterId, companyId } = req.body;
    const userId = req.user?._id;
    //   console.log("first", userId)
    if (!recruiterId && !companyId) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'recruiterId or companyId is required');
    }
    // Check for duplicate follow
    const alreadyFollowing = await following_model_1.Following.findOne({
        userId,
        ...(recruiterId ? { recruiterId } : { companyId }),
    });
    if (alreadyFollowing) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'Already following');
    }
    const follow = await following_model_1.Following.create({
        userId,
        recruiterId,
        companyId,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Followed successfully',
        data: follow,
    });
});
/***********************
 * DELETE FOLLOW ENTRY *
 ***********************/
exports.unfollowEntity = (0, catchAsync_1.default)(async (req, res) => {
    const { recruiterId, companyId } = req.body;
    const userId = req.user?._id;
    if (!recruiterId && !companyId) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'recruiterId or companyId is required');
    }
    const unfollow = await following_model_1.Following.findOneAndDelete({
        userId,
        ...(recruiterId ? { recruiterId } : { companyId }),
    });
    if (!unfollow) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Follow entry not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Unfollowed successfully',
        data: null,
    });
});
/***********************
 * COUNT FOLLOWERS     *
 ***********************/
exports.countFollowers = (0, catchAsync_1.default)(async (req, res) => {
    const { recruiterId, companyId } = req.query;
    if (!recruiterId && !companyId) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'recruiterId or companyId is required');
    }
    const count = await following_model_1.Following.countDocuments({
        ...(recruiterId ? { recruiterId } : { companyId }),
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Follower count retrieved',
        data: { count },
    });
});
