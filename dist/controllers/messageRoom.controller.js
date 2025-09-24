"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.acceptMessageRoom = exports.deleteMessageRoom = exports.getMessageRooms = exports.createMessageRoom = void 0;
const messageRoom_model_1 = require("../models/messageRoom.model");
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const mongoose_1 = __importDefault(require("mongoose"));
/***********************
 * CREATE MESSAGE ROOM *
 ***********************/
exports.createMessageRoom = (0, catchAsync_1.default)(async (req, res) => {
    const { userId, recruiterId, companyId } = req.body;
    // if (!userId || !recruiterId) {
    //   throw new AppError(
    //     httpStatus.BAD_REQUEST,
    //     'Both userId and recruiterId are required'
    //   )
    // }
    const exists = await messageRoom_model_1.MessageRoom.findOne({ userId, recruiterId, companyId });
    if (exists) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'Message room already exists');
    }
    const room = await messageRoom_model_1.MessageRoom.create({ userId, recruiterId, companyId });
    res.status(http_status_1.default.CREATED).json({
        success: true,
        message: 'Message room created',
        data: room,
    });
});
/*****************************
 * GET MESSAGE ROOMS BY TYPE *
 *****************************/
exports.getMessageRooms = (0, catchAsync_1.default)(async (req, res) => {
    const { type, userId } = req.query;
    if (!type || !userId) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Query parameters "type" and "userId" are required');
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid userId');
    }
    const objectId = new mongoose_1.default.Types.ObjectId(userId);
    let filter = {};
    switch (type) {
        case 'candidate':
            filter = { userId: objectId };
            break;
        case 'recruiter':
            filter = { recruiterId: objectId };
            break;
        case 'company':
            filter = { companyId: objectId };
            break;
        default:
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid type');
    }
    const rooms = await messageRoom_model_1.MessageRoom.find(filter)
        .sort({ createdAt: -1 })
        .populate('userId', 'name email role avatar')
        .populate('recruiterId', 'name email role avatar')
        .populate('companyId', 'name email role avatar');
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Message rooms fetched',
        data: rooms,
    });
});
/***********************
 * DELETE MESSAGE ROOM *
 ***********************/
exports.deleteMessageRoom = (0, catchAsync_1.default)(async (req, res) => {
    const { roomId } = req.params;
    const room = await messageRoom_model_1.MessageRoom.findByIdAndDelete(roomId);
    if (!room) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Message room not found');
    }
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Message room deleted',
    });
});
/***********************
 * ACCEPT MESSAGE ROOM *
 ***********************/
exports.acceptMessageRoom = (0, catchAsync_1.default)(async (req, res) => {
    const { roomid } = req.params;
    // console.log(roomid)
    const room = await messageRoom_model_1.MessageRoom.findById(roomid);
    if (!room) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Message room not found');
    }
    room.messsageAccepted = true;
    await room.save();
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Message accepted',
        data: room,
    });
});
