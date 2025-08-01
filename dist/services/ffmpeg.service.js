"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVideoHLS = exports.getVideoMetadata = void 0;
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const getVideoMetadata = (filePath) => {
    return new Promise((resolve, reject) => {
        fluent_ffmpeg_1.default.ffprobe(filePath, (err, metadata) => {
            if (err)
                return reject(err);
            const duration = metadata.format.duration || 0;
            const format = metadata.format.format_name || 'unknown';
            resolve({ duration, format });
        });
    });
};
exports.getVideoMetadata = getVideoMetadata;
const processVideoHLS = async (inputPath, outputDir, userId) => {
    const key = crypto_1.default.randomBytes(16);
    const keyFileName = 'encryption.key';
    const keyInfoFileName = 'encryption.key.info';
    const iv = crypto_1.default.randomBytes(16); // Initialization vector for AES-128
    const keyPath = path_1.default.join(outputDir, keyFileName);
    const keyInfoPath = path_1.default.join(outputDir, keyInfoFileName);
    // 1. Write the key file to disk
    fs_1.default.writeFileSync(keyPath, key);
    // 2. Construct the correct URI used by HLS clients (e.g. Hls.js)
    const keyUri = `/api/v1/elevator-pitch/key/${userId}/${keyFileName}`;
    // 3. Write the key info file in this format:
    // <key URI>\n<local key file path>\n<IV in hex>
    const keyInfoContent = `${keyUri}\n${keyPath}\n${iv.toString('hex')}`;
    fs_1.default.writeFileSync(keyInfoPath, keyInfoContent);
    const playlistPath = path_1.default.join(outputDir, 'playlist.m3u8');
    return new Promise((resolve, reject) => {
        (0, fluent_ffmpeg_1.default)(inputPath)
            .outputOptions([
            '-c:v copy',
            '-c:a copy',
            '-hls_time 10',
            '-hls_list_size 0',
            '-hls_segment_type mpegts',
            `-hls_key_info_file ${keyInfoPath}`,
            '-hls_playlist_type vod',
        ])
            .output(playlistPath)
            .on('end', () => {
            resolve({
                playlistPath,
                keyPath,
                keyInfoPath,
                iv: iv.toString('hex'),
            });
        })
            .on('error', (err) => {
            reject(err);
        })
            .run();
    });
};
exports.processVideoHLS = processVideoHLS;
