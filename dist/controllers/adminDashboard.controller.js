"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminDashboardStats = void 0;
const user_model_1 = require("../models/user.model");
const paymentInfo_model_1 = require("../models/paymentInfo.model");
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const moment_1 = __importDefault(require("moment"));
/****************************************************
 * API FOR TOTAL USER TOTAL RECRUITER, TOTAL AMOUNT *
 ****************************************************/
exports.getAdminDashboardStats = (0, catchAsync_1.default)(async (req, res) => {
    const totalCandidates = await user_model_1.User.countDocuments({ role: 'candidate' });
    const totalRecruiters = await user_model_1.User.countDocuments({ role: 'ricruiter' });
    const totalAmountData = await paymentInfo_model_1.paymentInfo.aggregate([
        { $match: { paymentStatus: 'complete' } },
        {
            $group: {
                _id: null,
                totalAmount: { $sum: '$amount' },
            },
        },
    ]);
    const totalAmount = totalAmountData[0]?.totalAmount || 0;
    // === Monthly Aggregation ===
    const monthlyBarData = await paymentInfo_model_1.paymentInfo.aggregate([
        { $match: { paymentStatus: 'complete' } },
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' },
                },
                totalAmount: { $sum: '$amount' },
            },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);
    const monthlyDataFormatted = monthlyBarData.map((item) => {
        const monthName = (0, moment_1.default)().month(item._id.month - 1).format('MMMM');
        return {
            year: item._id.year,
            month: monthName,
            totalAmount: item.totalAmount,
        };
    });
    // === Yearly Aggregation ===
    const yearlyBarData = await paymentInfo_model_1.paymentInfo.aggregate([
        { $match: { paymentStatus: 'complete' } },
        {
            $group: {
                _id: { year: { $year: '$createdAt' } },
                totalAmount: { $sum: '$amount' },
            },
        },
        { $sort: { '_id.year': 1 } },
    ]);
    const yearlyDataFormatted = yearlyBarData.map((item) => ({
        year: item._id.year,
        totalAmount: item.totalAmount,
    }));
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Admin dashboard stats with chart data fetched successfully',
        data: {
            totalCandidates,
            totalRecruiters,
            totalAmount,
            charts: {
                monthly: monthlyDataFormatted,
                yearly: yearlyDataFormatted,
            },
        },
    });
});
