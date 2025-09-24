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
const cloudinary_1 = require("../utils/cloudinary");
const fs_1 = __importDefault(require("fs"));
const pagination_1 = require("../utils/pagination");
/***************
 * CREATE BLOG *
 ***************/
exports.createBlog = (0, catchAsync_1.default)(async (req, res) => {
    const { title, description, userId } = req.body;
    if (!title || !description || !userId) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Missing required fields');
    }
    let imageUrl = null;
    let imagePublicId = null;
    if (req.file) {
        const localPath = req.file.path;
        // Upload image to Cloudinary
        const uploadResult = await (0, cloudinary_1.uploadToCloudinary)(localPath, 'blogs');
        if (!uploadResult?.secure_url) {
            throw new AppError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Image upload failed');
        }
        imageUrl = uploadResult.secure_url;
        imagePublicId = uploadResult.public_id;
        // Remove local file after upload
        fs_1.default.unlinkSync(localPath);
    }
    const blog = await Blog_model_1.Blog.create({
        title,
        description,
        userId,
        image: imageUrl,
        imagePublicId,
    });
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
    const { page, limit, skip } = (0, pagination_1.getPaginationParams)(req.query);
    const blogs = await Blog_model_1.Blog.find().sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    const total = await Blog_model_1.Blog.countDocuments({});
    const meta = (0, pagination_1.buildMetaPagination)(total, page, limit);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Blogs fetched successfully',
        data: { blogs, meta },
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
    const { title, description } = req.body;
    const blog = await Blog_model_1.Blog.findById(id);
    if (!blog) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Blog not found');
    }
    // Handle new image upload
    if (req.file) {
        const localPath = req.file.path;
        // Upload new image to Cloudinary
        const uploadResult = await (0, cloudinary_1.uploadToCloudinary)(localPath, 'blogs');
        if (!uploadResult?.secure_url) {
            throw new AppError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Image upload failed');
        }
        // Delete old image from Cloudinary if exists
        if (blog.imagePublicId) {
            await (0, cloudinary_1.deleteFromCloudinary)(blog.imagePublicId);
        }
        // Update with new image details
        blog.image = uploadResult.secure_url;
        blog.imagePublicId = uploadResult.public_id;
        // Remove local file
        fs_1.default.unlinkSync(localPath);
    }
    // Update other fields if provided
    if (title)
        blog.title = title;
    if (description)
        blog.description = description;
    await blog.save();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Blog updated successfully',
        data: blog,
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
