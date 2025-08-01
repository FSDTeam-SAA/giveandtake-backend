"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
const app_1 = __importDefault(require("./app"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("./config/db");
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const message_socket_1 = require("./sockets/message.socket");
const node_cron_1 = __importDefault(require("node-cron"));
const deleteOldDeactivatedUsers_1 = require("./jobs/deleteOldDeactivatedUsers");
dotenv_1.default.config();
const PORT = process.env.PORT || 5000;
const httpServer = (0, http_1.createServer)(app_1.default);
exports.io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});
// Runs every day at midnight
node_cron_1.default.schedule('0 0 * * *', async () => {
    console.log('Running user deletion job...');
    await (0, deleteOldDeactivatedUsers_1.deleteOldDeactivatedUsers)();
});
(0, message_socket_1.setupMessageSocket)(exports.io);
(0, db_1.connectDB)().then(() => {
    // app.listen(PORT, () => {
    //   console.log(`Server is running on port ${PORT}`)
    // })
    httpServer.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});
