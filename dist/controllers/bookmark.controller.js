"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBookmarksByUser = exports.updateBookmarked = exports.createBookmark = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const bookmark_model_1 = require("../models/bookmark.model");
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const pagination_1 = require("../utils/pagination");
/***********************
 * CREATE BOOKMARK
 ***********************/
exports.createBookmark = (0, catchAsync_1.default)(async (req, res) => {
    const { userId, jobId, bookmarked } = req.body;
    const existing = await bookmark_model_1.Bookmark.findOne({ userId, jobId });
    if (existing)
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Job already bookmarked by user");
    const bookmark = await bookmark_model_1.Bookmark.create({ userId, jobId, bookmarked });
    (0, sendResponse_1.default)(res, {
        statusCode: 201,
        success: true,
        message: "Bookmark created successfully",
        data: bookmark,
    });
});
exports.updateBookmarked = (0, catchAsync_1.default)(async (req, res) => {
    const { bookmarked, userId, jobId } = req.body;
    let update = await bookmark_model_1.Bookmark.findOneAndUpdate({ userId: userId, jobId: jobId }, { bookmarked }, { new: true });
    if (!update) {
        update = await bookmark_model_1.Bookmark.create({ userId, jobId, bookmarked });
    }
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: bookmarked === true ? "Bookmarked Successfully" : "Bookmarked Removed",
        data: update,
    });
});
/***********************
 * GET ALL BY USER ID
 ***********************/
exports.getBookmarksByUser = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.params;
    // GET QUERYES FOR PAGINATION
    const { page, limit, skip } = (0, pagination_1.getPaginationParams)(req.query);
    const bookmarks = await bookmark_model_1.Bookmark.find({ userId })
        .sort({ createdAt: -1 })
        .populate("jobId")
        .skip(skip)
        .limit(limit);
    // TOTAL COUNT
    const totalItems = await bookmark_model_1.Bookmark.countDocuments({ userId });
    // BUILD META DATA
    const meta = (0, pagination_1.buildMetaPagination)(totalItems, page, limit);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Bookmarks fetched successfully",
        data: { bookmarks, meta },
    });
});
