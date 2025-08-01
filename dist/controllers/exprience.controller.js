"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteExperience = exports.updateExperience = exports.getExperienceById = exports.getExperiencesByUser = exports.createExperience = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const experience_model_1 = require("../models/experience.model");
const AppError_1 = __importDefault(require("../errors/AppError"));
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
// Dummy allowed values for career fields
const dummyCareerFields = ['Technology', 'Healthcare', 'Finance'];
const dummyCareerSubfields = {
    Technology: ['Software Development', 'Data Science', 'IT Support'],
    Healthcare: ['Nursing', 'Surgery'],
    Finance: ['Accounting', 'Investment Banking'],
};
exports.createExperience = (0, catchAsync_1.default)(async (req, res) => {
    const { employer, jobTitle, firstName, startDate, endDate, country, city, zip, jobDescription, careerField, careerSubfield, } = req.body;
    if (!employer || !jobTitle || !startDate) {
        throw new AppError_1.default(400, 'employer, jobTitle, and startDate are required');
    }
    if (endDate && new Date(startDate) > new Date(endDate)) {
        throw new AppError_1.default(400, 'startDate cannot be after endDate');
    }
    if (careerField && !dummyCareerFields.includes(careerField)) {
        throw new AppError_1.default(400, `Invalid careerField. Allowed: ${dummyCareerFields.join(', ')}`);
    }
    if (careerSubfield && careerField) {
        const allowedSubs = dummyCareerSubfields[careerField] || [];
        if (!allowedSubs.includes(careerSubfield)) {
            throw new AppError_1.default(400, `Invalid careerSubfield for ${careerField}. Allowed: ${allowedSubs.join(', ')}`);
        }
    }
    const experience = await experience_model_1.Experience.create({
        userId: req.user?._id,
        employer,
        jobTitle,
        firstName,
        startDate,
        endDate,
        country,
        city,
        zip,
        jobDescription,
        careerField,
        careerSubfield,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: 201,
        success: true,
        message: 'Experience created successfully',
        data: experience,
    });
});
exports.getExperiencesByUser = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req?.user?._id;
    const experiences = await experience_model_1.Experience.find({ userId }).sort({ startDate: -1 });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Experiences retrieved successfully',
        data: experiences,
    });
});
exports.getExperienceById = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        throw new AppError_1.default(400, 'Invalid experience ID');
    }
    const experience = await experience_model_1.Experience.findOne({ _id: id, userId: req.user?._id });
    if (!experience) {
        throw new AppError_1.default(404, 'Experience not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Experience retrieved successfully',
        data: experience,
    });
});
exports.updateExperience = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        throw new AppError_1.default(400, 'Invalid experience ID');
    }
    const existing = await experience_model_1.Experience.findOne({ _id: id, userId: req.user?._id });
    if (!existing) {
        throw new AppError_1.default(404, 'Experience not found');
    }
    const { startDate, endDate, careerField, careerSubfield, } = req.body;
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        throw new AppError_1.default(400, 'startDate cannot be after endDate');
    }
    if (careerField && !dummyCareerFields.includes(careerField)) {
        throw new AppError_1.default(400, `Invalid careerField. Allowed: ${dummyCareerFields.join(', ')}`);
    }
    if (careerSubfield && careerField) {
        const allowedSubs = dummyCareerSubfields[careerField] || [];
        if (!allowedSubs.includes(careerSubfield)) {
            throw new AppError_1.default(400, `Invalid careerSubfield for ${careerField}. Allowed: ${allowedSubs.join(', ')}`);
        }
    }
    const updated = await experience_model_1.Experience.findByIdAndUpdate(id, req.body, {
        new: true,
        runValidators: true,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Experience updated successfully',
        data: updated,
    });
});
exports.deleteExperience = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        throw new AppError_1.default(400, 'Invalid experience ID');
    }
    const experience = await experience_model_1.Experience.findOneAndDelete({ _id: id, userId: req.user?._id });
    if (!experience) {
        throw new AppError_1.default(404, 'Experience not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Experience deleted successfully',
        data: null,
    });
});
