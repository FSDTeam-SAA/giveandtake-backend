"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBookmarksByUser = exports.createBookmark = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const bookmark_model_1 = require("../models/bookmark.model");
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../errors/AppError"));
/***********************
 * CREATE BOOKMARK
 ***********************/
exports.createBookmark = (0, catchAsync_1.default)(async (req, res) => {
    const { userId, jobId } = req.body;
    const existing = await bookmark_model_1.Bookmark.findOne({ userId, jobId });
    if (existing)
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Job already bookmarked by user');
    const bookmark = await bookmark_model_1.Bookmark.create({ userId, jobId });
    (0, sendResponse_1.default)(res, {
        statusCode: 201,
        success: true,
        message: 'Bookmark created successfully',
        data: bookmark,
    });
});
/***********************
 * GET ALL BY USER ID
 ***********************/
exports.getBookmarksByUser = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.params;
    const bookmarks = await bookmark_model_1.Bookmark.find({ userId })
        .sort({ createdAt: -1 })
        .populate('jobId');
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Bookmarks fetched successfully',
        data: bookmarks,
    });
});
