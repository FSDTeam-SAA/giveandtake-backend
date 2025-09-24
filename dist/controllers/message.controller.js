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
const messageRoom_model_1 = require("../models/messageRoom.model");
/***************
 * CREATE MESSAGE
 ***************/
// export const createMessage = catchAsync(async (req: Request, res: Response) => {
//   const { message, roomId, userId } = req.body
//   const files = req.files as Express.Multer.File[]
//   if (!mongoose.Types.ObjectId.isValid(roomId)) {
//     throw new AppError(httpStatus.BAD_REQUEST, 'Invalid room ID')
//   }
//   // Upload all files to Cloudinary
//   const fileData = await Promise.all(
//     files.map(async (file) => {
//       const result = await uploadToCloudinary(file.path)
//       if (result) {
//         return {
//           filename: file.originalname,
//           url: result.secure_url,
//           public_id: result.public_id, // save this if you want to support deletion
//           uploadedAt: new Date(),
//         }
//       }
//     })
//   )
//   const newMessage = await Message.create({
//     message,
//     roomId,
//     userId,
//     file: fileData.filter(Boolean), // remove nulls
//   })
//   io.to(roomId).emit('newMessage', newMessage)
//   res.status(httpStatus.CREATED).json({
//     success: true,
//     message: 'Message created',
//     data: newMessage,
//   })
// })
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
                public_id: result.public_id,
                uploadedAt: new Date(),
            };
        }
    }));
    // Create message
    const newMessage = await message_model_1.Message.create({
        message,
        roomId,
        userId,
        file: fileData.filter(Boolean), // remove nulls
    });
    // ✅ Update lastMessage in MessageRoom
    await messageRoom_model_1.MessageRoom.findByIdAndUpdate(roomId, {
        lastMessage: message || (fileData.length ? '📎 Attachment' : ''),
        lastMessageSender: userId,
    }, { new: true });
    const message1 = await message_model_1.Message.findById(newMessage._id).populate('userId', 'name email avatar');
    // Emit socket event
    server_1.io.to(roomId).emit('newMessage', message1);
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
        .limit(limit)
        .populate('userId', 'name email avatar');
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
