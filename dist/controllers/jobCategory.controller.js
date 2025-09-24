"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteJobCategory = exports.updateJobCategory = exports.getSingleCategorys = exports.getAllCategorys = exports.createJobCategory = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const jobCategory_model_1 = require("../models/jobCategory.model");
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const http_status_1 = __importDefault(require("http-status"));
const cloudinary_1 = require("../utils/cloudinary");
const AppError_1 = __importDefault(require("../errors/AppError"));
const pagination_1 = require("../utils/pagination");
// create category
exports.createJobCategory = (0, catchAsync_1.default)(async (req, res) => {
    const { name, role } = req.body;
    if (!name) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Please fill in all fields");
    }
    let categoryIcon = "";
    if (req.file) {
        const result = await (0, cloudinary_1.uploadToCloudinary)(req.file.path);
        if (!result) {
            throw new AppError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to upload image");
        }
        categoryIcon = result.secure_url;
    }
    const category = await jobCategory_model_1.JobCategory.create({
        name,
        categoryIcon,
        role: JSON.parse(role || "{}"),
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: "Job category created successfully",
        data: category,
    });
});
// get all categories
exports.getAllCategorys = (0, catchAsync_1.default)(async (req, res) => {
    const { page, limit, skip } = (0, pagination_1.getPaginationParams)(req.query);
    const search = req.query.search ? String(req.query.search) : '';
    // Build search filter
    let filter = {};
    if (search) {
        filter = {
            $or: [
                { name: { $regex: search, $options: "i" } }, // case-insensitive search for name
                { role: { $in: [new RegExp(search, "i")] } }, // search inside role array
            ],
        };
    }
    // Fetch categories
    const category = await jobCategory_model_1.JobCategory.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    // Count total for pagination
    const total = await jobCategory_model_1.JobCategory.countDocuments(filter);
    const meta = (0, pagination_1.buildMetaPagination)(total, page, limit);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Job categories fetched successfully",
        data: { category, meta },
    });
});
// get all categorys
exports.getSingleCategorys = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const category = await jobCategory_model_1.JobCategory.findById(id);
    console.log("first");
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Job category fetched successfully",
        data: category,
    });
});
// updateJobCategory
exports.updateJobCategory = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const { name, role } = req.body;
    const category = await jobCategory_model_1.JobCategory.findById(id);
    if (!category) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Job category not found");
    }
    let newIcon = category.categoryIcon;
    if (req.file) {
        const result = await (0, cloudinary_1.uploadToCloudinary)(req.file.path);
        if (!result) {
            throw new AppError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to upload image");
        }
        await (0, cloudinary_1.deleteFromCloudinary)(category.categoryIcon);
        newIcon = result.secure_url;
    }
    category.name = name;
    category.categoryIcon = newIcon;
    category.role = JSON.parse(role);
    await category.save();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Job category updated successfully",
        data: category,
    });
});
// delete category
exports.deleteJobCategory = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const category = await jobCategory_model_1.JobCategory.findById(id);
    if (!category) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Category not found");
    }
    // Delete icon from Cloudinary
    const publicId = category.categoryIcon?.split("/").pop()?.split(".")[0];
    if (publicId) {
        await (0, cloudinary_1.deleteFromCloudinary)(publicId);
    }
    await category.deleteOne();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Category deleted successfully",
        data: null,
    });
});
