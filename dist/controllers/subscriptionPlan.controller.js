"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unSubscribePlan = exports.deleteSubscriptionPlan = exports.updateSubscriptionPlan = exports.getSingleSubscriptionPlans = exports.getAllSubscriptionPlans = exports.createSubscriptionPlan = void 0;
const subscriptionPlan_model_1 = require("../models/subscriptionPlan.model");
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const paymentInfo_model_1 = require("../models/paymentInfo.model");
const elevatorPitch_model_1 = require("../models/elevatorPitch.model");
// CREATE
exports.createSubscriptionPlan = (0, catchAsync_1.default)(async (req, res) => {
    const { title, description, price, features, for: planFor, valid } = req.body;
    if (!title || !description || !price || !planFor) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'All required fields must be provided');
    }
    const plan = await subscriptionPlan_model_1.SubscriptionPlan.create({
        title,
        description,
        price,
        features,
        for: planFor,
        valid
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Subscription plan created successfully',
        data: plan,
    });
});
// GET ALL
exports.getAllSubscriptionPlans = (0, catchAsync_1.default)(async (req, res) => {
    const plans = await subscriptionPlan_model_1.SubscriptionPlan.find().sort({ createdAt: -1 });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'All subscription plans fetched successfully',
        data: plans,
    });
});
// GET ALL
exports.getSingleSubscriptionPlans = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const plans = await subscriptionPlan_model_1.SubscriptionPlan.findById(id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'All subscription plans fetched successfully',
        data: plans,
    });
});
// UPDATE
exports.updateSubscriptionPlan = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const updated = await subscriptionPlan_model_1.SubscriptionPlan.findByIdAndUpdate(id, req.body, {
        new: true,
        runValidators: true,
    });
    if (!updated) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Subscription plan not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Subscription plan updated successfully',
        data: updated,
    });
});
// DELETE
exports.deleteSubscriptionPlan = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const deleted = await subscriptionPlan_model_1.SubscriptionPlan.findByIdAndDelete(id);
    if (!deleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Subscription plan not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Subscription plan deleted successfully',
        data: null,
    });
});
exports.unSubscribePlan = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req.user?._id;
    const deletePayment = await paymentInfo_model_1.paymentInfo.deleteMany({ userId });
    const deleteElevatorPitch = await elevatorPitch_model_1.ElevatorPitch.deleteMany({ userId });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "You are Successfully unsubscribe this plan",
        data: ""
    });
});
