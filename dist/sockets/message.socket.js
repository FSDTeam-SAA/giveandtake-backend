"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupMessageSocket = void 0;
const setupMessageSocket = (io) => {
    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);
        socket.on('joinRoom', (roomId) => {
            socket.join(roomId);
        });
        socket.on('joinNotification', (userId) => {
            socket.join(userId);
        });
        socket.on('leaveRoom', (roomId) => {
            socket.leave(roomId);
        });
        socket.on('disconnect', () => {
            console.log('User disconnected :', socket.id);
        });
    });
};
exports.setupMessageSocket = setupMessageSocket;
