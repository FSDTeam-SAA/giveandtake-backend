"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamKey = exports.streamM3U8 = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const streamM3U8 = (req, res) => {
    const { userId } = req.params;
    const filePath = path_1.default.join(__dirname, `../../uploads/recruiter-videos/${userId}/master.m3u8`);
    if (!fs_1.default.existsSync(filePath))
        return res.status(404).send('File not found');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    fs_1.default.createReadStream(filePath).pipe(res);
};
exports.streamM3U8 = streamM3U8;
const streamKey = (req, res) => {
    const { userId } = req.params;
    // Protect this: validate user or role
    if (!req.user || req.user._id !== userId) {
        return res.status(403).send('Unauthorized');
    }
    const keyPath = path_1.default.join(__dirname, `../../uploads/recruiter-videos/${userId}/key.key`);
    if (!fs_1.default.existsSync(keyPath))
        return res.status(404).send('Key not found');
    res.setHeader('Content-Type', 'application/octet-stream');
    fs_1.default.createReadStream(keyPath).pipe(res);
};
exports.streamKey = streamKey;
