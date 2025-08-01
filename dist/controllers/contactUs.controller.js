"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContactUs = void 0;
const http_status_1 = __importDefault(require("http-status"));
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const contactUs_model_1 = require("../models/contactUs.model");
const user_model_1 = require("../models/user.model");
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const sendEmail_1 = require("../utils/sendEmail");
exports.createContactUs = (0, catchAsync_1.default)(async (req, res) => {
    const { firstName, lastName, address, phoneNumber, subject, message } = req.body;
    if (!firstName || !lastName || !subject || !message) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Missing required fields');
    }
    const contactEntry = await contactUs_model_1.ContactUs.create({
        firstName,
        lastName,
        address,
        phoneNumber,
        subject,
        message,
    });
    // Find all admin users
    const adminUsers = await user_model_1.User.find({ role: 'admin' }).select('email');
    if (!adminUsers.length) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'No admin users found to notify');
    }
    const htmlContent = `
    <h3>New Contact Us Submission</h3>
    <p><strong>Name:</strong> ${firstName} ${lastName}</p>
    <p><strong>Phone:</strong> ${phoneNumber || 'N/A'}</p>
    <p><strong>Address:</strong> ${address || 'N/A'}</p>
    <p><strong>Subject:</strong> ${subject}</p>
    <p><strong>Message:</strong></p>
    <p>${message}</p>
  `;
    // Send email to each admin
    for (const admin of adminUsers) {
        await (0, sendEmail_1.sendEmail)(admin.email, `Contact Us: ${subject}`, htmlContent);
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Message sent successfully to admins',
        data: contactEntry,
    });
});
