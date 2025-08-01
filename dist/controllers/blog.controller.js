"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBlog = exports.updateBlog = exports.getSingleBlog = exports.getAllBlogs = exports.createBlog = void 0;
const http_status_1 = __importDefault(require("http-status"));
const Blog_model_1 = require("../models/Blog.model");
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
/***************
 * CREATE BLOG *
 ***************/
exports.createBlog = (0, catchAsync_1.default)(async (req, res) => {
    const { title, description, image, userId } = req.body;
    if (!title || !description || !userId) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Missing required fields');
    }
    const blog = await Blog_model_1.Blog.create({ title, description, image, userId });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Blog created successfully',
        data: blog,
    });
});
/*********************************************
 * GET ALL BLOGS (OPTIONAL FILTER BY USERID) *
 *********************************************/
exports.getAllBlogs = (0, catchAsync_1.default)(async (req, res) => {
    const blogs = await Blog_model_1.Blog.find().sort({ createdAt: -1 });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Blogs fetched successfully',
        data: blogs,
    });
});
/*******************
 * GET SINGLE BLOG *
 *******************/
exports.getSingleBlog = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const blog = await Blog_model_1.Blog.findById(id);
    if (!blog) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Blog not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Blog retrieved successfully',
        data: blog,
    });
});
/***************
 * UPDATE BLOG *
 ***************/
exports.updateBlog = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const updated = await Blog_model_1.Blog.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Blog not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Blog updated successfully',
        data: updated,
    });
});
/***************
 * DELETE BLOG *
 ***************/
exports.deleteBlog = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const deleted = await Blog_model_1.Blog.findByIdAndDelete(id);
    if (!deleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Blog not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Blog deleted successfully',
        data: deleted,
    });
});
