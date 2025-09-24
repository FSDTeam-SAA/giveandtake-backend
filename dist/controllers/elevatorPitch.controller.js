"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllElevatorPitches = exports.getEncryptionKey = exports.secureStream = exports.streamElevatorPitch = exports.deleteResume = exports.createResume = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const elevatorPitch_model_1 = require("../models/elevatorPitch.model");
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const ffmpeg_service_1 = require("../services/ffmpeg.service");
const paymentInfo_model_1 = require("../models/paymentInfo.model");
const cloudinary_1 = require("../utils/cloudinary");
const axios_1 = __importDefault(require("axios"));
const validateElevatorPitchAccess_1 = require("../helper/validateElevatorPitchAccess");
const user_model_1 = require("../models/user.model");
/*************************************
 * ADD RESUME VIDEO (ELEVATOR PITCH) *
 *************************************/
exports.createResume = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.query;
    if (!userId || typeof userId !== 'string') {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'User ID is required');
    }
    // @ts-ignore
    if (!req.files?.videoFile || !Array.isArray(req.files.videoFile)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'No video file uploaded');
    }
    // @ts-ignore
    const videoFile = req.files.videoFile[0];
    const tempPath = videoFile.path;
    if (!fs_1.default.existsSync(tempPath)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Uploaded file not found');
    }
    const existingPitch = await elevatorPitch_model_1.ElevatorPitch.findOne({ userId });
    if (existingPitch) {
        fs_1.default.unlinkSync(tempPath);
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'You already have an elevator pitch');
    }
    const metadata = await (0, ffmpeg_service_1.getVideoMetadata)(tempPath);
    // VALIDATE UPLOAD PERMISSION
    await (0, validateElevatorPitchAccess_1.validateElevatorPitchAccess)(userId, metadata.duration);
    if (metadata.duration > 30) {
        const hasActivePlan = await paymentInfo_model_1.paymentInfo.findOne({
            userId,
            paymentStatus: 'complete',
        });
        if (!hasActivePlan) {
            fs_1.default.unlinkSync(tempPath);
            throw new AppError_1.default(http_status_1.default.PAYMENT_REQUIRED, 'Video duration exceeds 30 seconds. Please purchase a plan.');
        }
    }
    // ✅ Process video to HLS
    const hlsDir = path_1.default.join(__dirname, `../../temp/hls/${userId}`);
    fs_1.default.mkdirSync(hlsDir, { recursive: true });
    // @ts-ignore
    const { playlistPath, keyPath } = await (0, ffmpeg_service_1.processVideoHLS)(tempPath, hlsDir, userId);
    fs_1.default.unlinkSync(tempPath);
    // ✅ Upload HLS files to Cloudinary
    const cloudinaryFolder = `elevator_pitches/${userId}/hls`;
    const uploadedFiles = await (0, cloudinary_1.uploadHLS)(hlsDir, cloudinaryFolder);
    console.log('first', uploadedFiles);
    // @ts-ignore
    // ✅ Extract Cloudinary URLs
    const hlsUrl = uploadedFiles.uploadedFiles?.['playlist.m3u8']?.secure_url || '';
    // @ts-ignore
    const encryptionKeyUrl = uploadedFiles.uploadedFiles?.['encryption.key']?.secure_url || '';
    // ✅ Clean up HLS temp directory
    fs_1.default.rmSync(hlsDir, { recursive: true, force: true });
    // ✅ Save to DB with only Cloudinary URLs
    const newPitch = await elevatorPitch_model_1.ElevatorPitch.create({
        userId,
        video: {
            url: null,
            hlsUrl,
            encryptionKeyUrl,
            localPaths: {
                original: null,
                hls: hlsUrl,
                key: encryptionKeyUrl,
            },
        },
    });
    res.status(http_status_1.default.CREATED).json({
        success: true,
        message: 'Elevator pitch created and uploaded to Cloudinary successfully',
        data: {
            id: newPitch._id,
            hlsUrl,
            encryptionKeyUrl,
        },
    });
});
exports.deleteResume = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.query;
    const pitch = await elevatorPitch_model_1.ElevatorPitch.findOne({ userId });
    if (!pitch) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Elevator pitch not found');
    }
    // Clean up local files
    if (pitch.video.localPaths) {
        const { original, hls, key } = pitch.video.localPaths;
        if (fs_1.default.existsSync(original))
            fs_1.default.unlinkSync(original);
        if (fs_1.default.existsSync(hls))
            fs_1.default.unlinkSync(hls);
        if (fs_1.default.existsSync(key))
            fs_1.default.unlinkSync(key);
        const hlsDir = path_1.default.dirname(hls);
        if (fs_1.default.existsSync(hlsDir))
            fs_1.default.rmSync(hlsDir, { recursive: true, force: true });
    }
    await elevatorPitch_model_1.ElevatorPitch.deleteOne({ _id: pitch._id });
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Elevator pitch deleted successfully',
    });
});
/*************************
 * STREAM ELEVATOR PITCH *
 *************************/
exports.streamElevatorPitch = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const pitch = await elevatorPitch_model_1.ElevatorPitch.findById(id);
    if (!pitch || !pitch.video?.hlsUrl) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Elevator pitch not found');
    }
    const hlsUrl = pitch.video.hlsUrl;
    const userId = pitch.userId.toString();
    // Fetch playlist.m3u8 from Cloudinary
    const playlistRes = await axios_1.default.get(hlsUrl);
    let playlistContent = playlistRes.data;
    // Rewrite .ts segment lines to secure proxy endpoint
    playlistContent = playlistContent
        .split('\n')
        .map((line) => {
        if (line.trim().endsWith('.ts')) {
            return `/api/v1/elevator-pitch/stream/${pitch.userId.toString()}/${line.trim()}`;
        }
        return line;
    })
        .join('\n');
    res.set({
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
    });
    res.send(playlistContent);
});
/********************
 * SECURE STREAMING *
 ********************/
exports.secureStream = (0, catchAsync_1.default)(async (req, res) => {
    const { userId, segment } = req.params;
    // Find pitch by userId
    const pitch = await elevatorPitch_model_1.ElevatorPitch.findOne({ userId });
    if (!pitch || !pitch.video?.hlsUrl) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Elevator pitch not found');
    }
    // Derive base URL from playlist.m3u8
    const baseUrl = pitch.video.hlsUrl.replace(/playlist\.m3u8$/, '');
    // Construct full URL to the .ts segment in Cloudinary
    const segmentUrl = `${baseUrl}${segment}`;
    try {
        const response = await axios_1.default.get(segmentUrl, { responseType: 'stream' });
        res.set({
            'Content-Type': 'video/mp2t',
            'Cache-Control': 'no-cache',
        });
        response.data.pipe(res);
    }
    catch (err) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Segment not found in Cloudinary');
    }
});
/*********************
 * GET ENCRYPTED KEY *
 *********************/
exports.getEncryptionKey = (0, catchAsync_1.default)(async (req, res) => {
    const { userId, key } = req.params;
    const pitch = await elevatorPitch_model_1.ElevatorPitch.findOne({ userId });
    if (!pitch || !pitch.video?.encryptionKeyUrl) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Encryption key not found');
    }
    // Check that requested file matches the expected key filename (basic validation)
    if (!pitch.video.encryptionKeyUrl.includes(key)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid key name requested');
    }
    try {
        const keyResponse = await axios_1.default.get(pitch.video.encryptionKeyUrl, {
            responseType: 'arraybuffer',
        });
        res.set({
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        res.send(Buffer.from(keyResponse.data));
    }
    catch (err) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Failed to fetch encryption key from Cloudinary');
    }
});
/**********************
 * ALL ELEVATOR PITCH *
 **********************/
exports.getAllElevatorPitches = (0, catchAsync_1.default)(async (req, res) => {
    const { type } = req.query;
    if (!type || typeof type !== 'string') {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Query param "type" is required');
    }
    const allowedRoles = ['candidate', 'recruiter', 'company'];
    if (!allowedRoles.includes(type)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid user type');
    }
    // Step 1: Get users with the requested role
    const users = await user_model_1.User.find({ role: type }, '_id name email');
    console.log(users);
    const userIds = users.map((u) => u._id);
    console.log(userIds);
    // Step 2: Get Elevator Pitches of those users
    const pitches = await elevatorPitch_model_1.ElevatorPitch.find({
        userId: { $in: userIds },
    }).populate('userId', 'name email role');
    console.log(pitches);
    res.status(http_status_1.default.OK).json({
        success: true,
        total: pitches.length,
        data: pitches,
    });
});
