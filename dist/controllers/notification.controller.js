"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAllAsRead = exports.getUserNotifications = void 0;
const notification_model_1 = require("../models/notification.model");
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const http_status_1 = __importDefault(require("http-status"));
/*********************************
 * GET ALL NOTIFICATIONS BY USER *
 *********************************/
exports.getUserNotifications = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.params;
    const notifications = await notification_model_1.Notification.find({ to: userId }).sort({
        createdAt: -1,
    });
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Notifications fetched successfully',
        data: notifications,
    });
});
/**********************************
 * MARK ALL NOTIFICATIONS AS READ *
 **********************************/
exports.markAllAsRead = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.params;
    const result = await notification_model_1.Notification.updateMany({ to: userId, isViewed: false }, { isViewed: true });
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'All notifications marked as read',
        modifiedCount: result.modifiedCount,
    });
});
/**
 import { createNotification } from '../services/notification.service'

await createNotification({
  to: user._id,
  message: 'You have a new message',
  type: 'message',
  id: message._id,
})

 */ 
