"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMessage = exports.updateMessage = exports.getMessagesByRoom = exports.createMessage = void 0;
const http_status_1 = __importDefault(require("http-status"));
const message_model_1 = require("../models/message.model");
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const mongoose_1 = __importDefault(require("mongoose"));
const server_1 = require("../server");
const cloudinary_1 = require("../utils/cloudinary"); // Adjust path
/***************
 * CREATE MESSAGE
 ***************/
exports.createMessage = (0, catchAsync_1.default)(async (req, res) => {
    const { message, roomId, userId } = req.body;
    const files = req.files;
    if (!mongoose_1.default.Types.ObjectId.isValid(roomId)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid room ID');
    }
    // Upload all files to Cloudinary
    const fileData = await Promise.all(files.map(async (file) => {
        const result = await (0, cloudinary_1.uploadToCloudinary)(file.path);
        if (result) {
            return {
                filename: file.originalname,
                url: result.secure_url,
                public_id: result.public_id, // save this if you want to support deletion
                uploadedAt: new Date(),
            };
        }
    }));
    const newMessage = await message_model_1.Message.create({
        message,
        roomId,
        userId,
        file: fileData.filter(Boolean), // remove nulls
    });
    server_1.io.to(roomId).emit('newMessage', newMessage);
    res.status(http_status_1.default.CREATED).json({
        success: true,
        message: 'Message created',
        data: newMessage,
    });
});
/***************
 * GET MESSAGES BY ROOM (Paginated)
 ***************/
exports.getMessagesByRoom = (0, catchAsync_1.default)(async (req, res) => {
    const { roomId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    if (!mongoose_1.default.Types.ObjectId.isValid(roomId)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid room ID');
    }
    const messages = await message_model_1.Message.find({ roomId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
    const total = await message_model_1.Message.countDocuments({ roomId });
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Messages fetched',
        data: messages,
        meta: {
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            total,
        },
    });
});
/***************
 * UPDATE MESSAGE
 ***************/
exports.updateMessage = (0, catchAsync_1.default)(async (req, res) => {
    const { messageId } = req.params;
    const { message } = req.body;
    const updated = await message_model_1.Message.findByIdAndUpdate(messageId, { message }, { new: true });
    if (!updated) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Message not found');
    }
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Message updated',
        data: updated,
    });
});
/***************
 * DELETE MESSAGE
 ***************/
exports.deleteMessage = (0, catchAsync_1.default)(async (req, res) => {
    const { messageId } = req.params;
    const deleted = await message_model_1.Message.findByIdAndDelete(messageId);
    if (!deleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Message not found');
    }
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Message deleted',
        data: deleted,
    });
});
