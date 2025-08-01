"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAwardsAndHonor = exports.updateAwardsAndHonor = exports.getByUserId = exports.createAwardAndHonor = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const awardsAndHonor_model_1 = require("../models/awardsAndHonor.model");
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
/******************************
 * CREATE AWARNESS AND Honor *
 ******************************/
exports.createAwardAndHonor = (0, catchAsync_1.default)(async (req, res) => {
    const data = req.body;
    const result = await awardsAndHonor_model_1.AwardsAndHonor.create(data);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Entry created successfully',
        data: result,
    });
});
/******************
 * GET BY USER ID *
 ******************/
exports.getByUserId = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.params;
    const result = await awardsAndHonor_model_1.AwardsAndHonor.find({ userId });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Entries fetched successfully',
        data: result,
    });
});
/*******************************
 * UPDATE AWARENESS AND Honor *
 *******************************/
exports.updateAwardsAndHonor = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const result = await awardsAndHonor_model_1.AwardsAndHonor.findByIdAndUpdate(id, updates, {
        new: true,
    });
    if (!result) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Entry not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Entry updated successfully',
        data: result,
    });
});
/*******************************
 * DELETE AWARENESS AND Honor *
 *******************************/
exports.deleteAwardsAndHonor = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const result = await awardsAndHonor_model_1.AwardsAndHonor.findByIdAndDelete(id);
    if (!result) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Entry not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Entry deleted successfully',
        data: result,
    });
});
