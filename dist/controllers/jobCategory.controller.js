"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteJobCategory = exports.updateJobCategory = exports.getAllCategorys = exports.createJobCategory = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const jobCategory_model_1 = require("../models/jobCategory.model");
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const http_status_1 = __importDefault(require("http-status"));
const cloudinary_1 = require("../utils/cloudinary");
const AppError_1 = __importDefault(require("../errors/AppError"));
// create category
exports.createJobCategory = (0, catchAsync_1.default)(async (req, res) => {
    const { name } = req.body;
    if (!name) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Please fill in all fields');
    }
    let categoryIcon = '';
    if (req.file) {
        const result = await (0, cloudinary_1.uploadToCloudinary)(req.file.path);
        if (!result) {
            throw new AppError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to upload image');
        }
        categoryIcon = result.secure_url;
    }
    const category = await jobCategory_model_1.JobCategory.create({
        name,
        categoryIcon,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Job category created successfully',
        data: category,
    });
});
// get all categorys
exports.getAllCategorys = (0, catchAsync_1.default)(async (req, res) => {
    const category = await jobCategory_model_1.JobCategory.find().sort({ createdAt: -1 });
    console.log('first');
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Job category fetched successfully',
        data: category,
    });
});
// updateJobCategory
exports.updateJobCategory = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    const category = await jobCategory_model_1.JobCategory.findById(id);
    if (!category) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Job category not found');
    }
    let newIcon = category.categoryIcon;
    if (req.file) {
        const result = await (0, cloudinary_1.uploadToCloudinary)(req.file.path);
        if (!result) {
            throw new AppError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to upload image');
        }
        await (0, cloudinary_1.deleteFromCloudinary)(category.categoryIcon);
        newIcon = result.secure_url;
    }
    category.name = name;
    category.categoryIcon = newIcon;
    await category.save();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Job category updated successfully',
        data: category,
    });
});
// delete category
exports.deleteJobCategory = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const category = await jobCategory_model_1.JobCategory.findById(id);
    if (!category) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Category not found');
    }
    // Delete icon from Cloudinary
    const publicId = category.categoryIcon?.split('/').pop()?.split('.')[0];
    if (publicId) {
        await (0, cloudinary_1.deleteFromCloudinary)(publicId);
    }
    await category.deleteOne();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Category deleted successfully',
        data: null,
    });
});
