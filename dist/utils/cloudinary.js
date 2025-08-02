"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadHLS = exports.deleteFromCloudinary = exports.uploadToCloudinary = void 0;
const cloudinary_1 = require("cloudinary");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// cloudinary.config({
//   cloud_name: config.cloudinary.cloudName,
//   api_key: config.cloudinary.apiKey,
//   api_secret: config.cloudinary.apiSecret,
// })
cloudinary_1.v2.config({
    cloud_name: 'ddtuyxcsl',
    api_key: '155594432527689',
    api_secret: 'fw86uLN2JW_S9tYxb69R48Fym2k',
});
const uploadToCloudinary = async (localFilePath, folderPath) => {
    try {
        if (!localFilePath)
            return null;
        const uploadOptions = {
            resource_type: 'auto',
        };
        // Only add folder if provided
        if (folderPath) {
            uploadOptions.folder = folderPath;
        }
        const response = await cloudinary_1.v2.uploader.upload(localFilePath, uploadOptions);
        return response;
    }
    catch (error) {
        // Remove file from local storage if upload fails
        if (fs_1.default.existsSync(localFilePath)) {
            fs_1.default.unlinkSync(localFilePath);
        }
        throw error;
    }
};
exports.uploadToCloudinary = uploadToCloudinary;
const deleteFromCloudinary = async (publicId) => {
    try {
        if (!publicId)
            return;
        await cloudinary_1.v2.uploader.destroy(publicId, {
            resource_type: 'video',
        });
    }
    catch (error) {
        console.error('Error deleting from Cloudinary:', error);
    }
};
exports.deleteFromCloudinary = deleteFromCloudinary;
// export const uploadHLS = async (localDir: string, cloudinaryFolder: string) => {
//   try {
//     // Upload all files in the directory
//     const files = fs.readdirSync(localDir)
//     const uploadPromises = files.map((file) => {
//       const filePath = path.join(localDir, file)
//       console.log('firstdsfds')
//       return cloudinary.uploader.upload(filePath, {
//         resource_type: file.endsWith('.m3u8') ? 'video' : 'raw',
//         folder: cloudinaryFolder,
//         use_filename: true,
//       })
//     })
//     const results = await Promise.all(uploadPromises)
//     // Find the playlist file
//     const playlist = results.find((r) => r.original_filename === 'playlist')
//     return {
//       playlistUrl: playlist?.secure_url,
//       resources: results,
//     }
//   } catch (error) {
//     console.error('Error uploading HLS:', error)
//     throw error
//   }
// }
const uploadHLS = async (localDir, cloudinaryFolder) => {
    try {
        const files = fs_1.default.readdirSync(localDir);
        if (files.length === 0) {
            throw new Error('No files found in the directory');
        }
        const uploadedFiles = {};
        for (const file of files) {
            const filePath = path_1.default.join(localDir, file);
            const isRaw = file.endsWith('.key') ||
                file.endsWith('.key.info') ||
                file.endsWith('.m3u8');
            const result = await cloudinary_1.v2.uploader.upload(filePath, {
                resource_type: 'raw',
                folder: cloudinaryFolder,
                use_filename: true,
                unique_filename: false,
                overwrite: true,
            });
            uploadedFiles[file] = {
                secure_url: result.secure_url,
                public_id: result.public_id,
            };
            fs_1.default.unlinkSync(filePath);
        }
        // Optional: Find main playlist
        const mainPlaylist = Object.keys(uploadedFiles).find((f) => f.endsWith('.m3u8'));
        return {
            playlistUrl: mainPlaylist ? uploadedFiles[mainPlaylist].secure_url : null,
            uploadedFiles,
        };
    }
    catch (error) {
        console.error('Error uploading HLS directory:', error);
        throw error;
    }
};
exports.uploadHLS = uploadHLS;
