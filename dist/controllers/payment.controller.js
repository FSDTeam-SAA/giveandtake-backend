"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentsByUserId = exports.getAllPayments = exports.capturePaypalPayment = exports.createPaypalOrder = void 0;
const paymentInfo_model_1 = require("../models/paymentInfo.model");
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const paypal_service_1 = require("../services/paypal.service");
const pagination_1 = require("../utils/pagination");
// JSON validation middleware
const validateJsonBody = (err, req, res, next) => {
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({
            success: false,
            error: 'Invalid JSON payload',
            details: err.message,
        });
    }
    next();
};
/****************************
 * PAYPAL CREATEPAYPALORDER *
 ****************************/
const createPaypalOrder = async (req, res) => {
    try {
        const { amount } = req.body;
        const order = await (0, paypal_service_1.createOrder)(amount);
        res.status(200).json({
            success: true,
            message: 'PayPal order created',
            orderId: order.id,
            links: order.links,
        });
    }
    catch (error) {
        res
            .status(500)
            .json({ success: false, message: 'Failed to create PayPal order', error });
    }
};
exports.createPaypalOrder = createPaypalOrder;
const mapPaypalStatusToEnum = (paypalStatus) => {
    switch (paypalStatus.toUpperCase()) {
        case 'COMPLETED':
            return 'complete';
        case 'PENDING':
            return 'pending';
        case 'FAILED':
        case 'DECLINED':
        case 'DENIED':
            return 'failed';
        default:
            return 'failed'; // fallback for unexpected values
    }
};
/****************************
 * PAYPAL CAPTUREPAYPALPAYMENT *
 ****************************/
const capturePaypalPayment = async (req, res) => {
    try {
        const { orderId, userId, planId, seasonId } = req.body;
        const capture = await (0, paypal_service_1.captureOrder)(orderId);
        const captureDetails = capture.purchase_units[0].payments.captures[0];
        const newPayment = await paymentInfo_model_1.paymentInfo.create({
            userId,
            planId,
            amount: captureDetails.amount.value,
            paymentStatus: mapPaypalStatusToEnum(captureDetails.status),
            transactionId: captureDetails.id,
            paymentMethod: 'PayPal',
            seasonId,
        });
        res.status(200).json({
            message: 'Payment captured successfully',
            payment: newPayment,
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Payment capture failed', error });
    }
};
exports.capturePaypalPayment = capturePaypalPayment;
/*************************************
 * GET ALL PAYMENT HISTORY FOR ADMIN *
 *************************************/
exports.getAllPayments = (0, catchAsync_1.default)(async (req, res) => {
    const { page, limit, skip } = (0, pagination_1.getPaginationParams)(req.query);
    const [payments, total] = await Promise.all([
        paymentInfo_model_1.paymentInfo
            .find()
            .populate('userId', 'name email')
            .populate('planId', 'title price')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 }),
        paymentInfo_model_1.paymentInfo.countDocuments(),
    ]);
    const meta = (0, pagination_1.buildMetaPagination)(total, page, limit);
    res.status(200).json({
        success: true,
        data: payments,
        meta,
    });
});
/**************************************
 * GET ALL PAYMENT HISTORY FOR A USER *
 **************************************/
exports.getPaymentsByUserId = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req.params.userId;
    const { page, limit, skip } = (0, pagination_1.getPaginationParams)(req.query);
    const [payments, total] = await Promise.all([
        paymentInfo_model_1.paymentInfo
            .find({ userId })
            .populate('planId', 'title price')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 }),
        paymentInfo_model_1.paymentInfo.countDocuments({ userId }),
    ]);
    const meta = (0, pagination_1.buildMetaPagination)(total, page, limit);
    res.status(200).json({
        success: true,
        data: payments,
        meta,
    });
});
