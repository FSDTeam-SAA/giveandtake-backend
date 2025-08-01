"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = exports.initNotificationSocket = void 0;
const notification_model_1 = require("../models/notification.model");
let io = null;
const initNotificationSocket = (socketIO) => {
    io = socketIO;
};
exports.initNotificationSocket = initNotificationSocket;
/********************************
 * CREATE AND EMIT NOTIFICATION *
 ********************************/
const createNotification = async ({ to, message, type, id, }) => {
    const notification = await notification_model_1.Notification.create({
        to,
        message,
        type,
        id,
    });
    // Emit live notification
    if (io) {
        io.to(to.toString()).emit('newNotification', notification);
    }
    return notification;
};
exports.createNotification = createNotification;
