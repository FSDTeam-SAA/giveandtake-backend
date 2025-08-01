"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCompany = exports.getCompanyByUserId = exports.updateCompany = exports.createCompany = void 0;
const company_model_1 = require("../models/company.model");
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const http_status_1 = __importDefault(require("http-status"));
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const cloudinary_1 = require("../utils/cloudinary");
/******************
 * CREATE COMPANY *
 ******************/
exports.createCompany = (0, catchAsync_1.default)(async (req, res) => {
    const companyData = req.body;
    // Upload logo if file exists
    if (req.file?.path) {
        const cloudinaryRes = await (0, cloudinary_1.uploadToCloudinary)(req.file.path);
        if (cloudinaryRes?.secure_url) {
            companyData.clogo = cloudinaryRes.secure_url;
        }
    }
    const newCompany = await company_model_1.Company.create(companyData);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Company created successfully',
        data: newCompany,
    });
});
/************************
 * UPDATE COMPANY BY ID *
 ************************/
exports.updateCompany = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    // Upload new logo if provided
    if (req.file?.path) {
        const cloudinaryRes = await (0, cloudinary_1.uploadToCloudinary)(req.file.path);
        if (cloudinaryRes?.secure_url) {
            req.body.clogo = cloudinaryRes.secure_url;
        }
    }
    const updated = await company_model_1.Company.findByIdAndUpdate(id, req.body, {
        new: true,
        runValidators: true,
    });
    if (!updated) {
        res.status(http_status_1.default.NOT_FOUND).json({
            success: false,
            message: 'Company not found',
        });
        return;
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Company updated successfully',
        data: updated,
    });
});
/**************************
 * GET COMPANY BY USER ID *
 **************************/
exports.getCompanyByUserId = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.params;
    const companies = await company_model_1.Company.find({ userId: userId });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Company(s) fetched successfully',
        data: companies,
    });
});
/************************
 * DELETE COMPANY BY ID *
 ************************/
exports.deleteCompany = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const deleted = await company_model_1.Company.findByIdAndDelete(id);
    if (!deleted) {
        res.status(404).json({
            success: false,
            message: 'Company not found',
        });
        return;
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Company deleted successfully',
        data: deleted,
    });
});
