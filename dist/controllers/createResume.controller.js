"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteResume = exports.updateResume = exports.resumeOfaUser1 = exports.resumeOfaUser = exports.createResume = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const createResume_model_1 = require("../models/createResume.model");
const experience_model_1 = require("../models/experience.model");
const education_model_1 = require("../models/education.model");
const awardsAndHonor_model_1 = require("../models/awardsAndHonor.model");
const elevatorPitch_model_1 = require("../models/elevatorPitch.model");
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const cloudinary_1 = require("../utils/cloudinary");
const user_model_1 = require("../models/user.model");
/********************
 * CREATE RESUME *
 ********************/
exports.createResume = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.body;
    const user = await user_model_1.User.findById(userId);
    if (!user) {
        throw new AppError_1.default(400, "User Not Found");
    }
    const resume = JSON.parse(req.body.resume || '{}');
    const experiences = JSON.parse(req.body.experiences || '[]');
    const educationList = JSON.parse(req.body.educationList || '[]');
    const awardsAndHonors = JSON.parse(req.body.awardsAndHonors || '[]');
    if (!userId)
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'User ID is required');
    // check if file was uplaod
    let uploadFileUrl = null;
    let banner = null;
    // if (req.file) {
    //   const cloudinaryResult = await uploadToCloudinary(req.file.path)
    //   if (cloudinaryResult) {
    //     uploadFileUrl = cloudinaryResult.secure_url
    //   }
    // }
    const files = req.files;
    if (files?.photo) {
        const logoRes = await (0, cloudinary_1.uploadToCloudinary)(files.photo[0].path);
        if (logoRes?.secure_url) {
            uploadFileUrl = logoRes.secure_url;
            if (!user.avatar) {
                user.avatar = { url: "" }; // initialize if missing
            }
            user.avatar.url = logoRes.secure_url || "";
            await user?.save();
        }
    }
    if (files?.banner) {
        const certRes = await (0, cloudinary_1.uploadToCloudinary)(files.banner[0].path);
        if (certRes?.secure_url) {
            banner = certRes.secure_url;
        }
    }
    const resumeDoc = await createResume_model_1.CreateResume.create({
        ...resume,
        userId,
        photo: uploadFileUrl,
        banner
    });
    const exparienceDocs = await experience_model_1.Experience.insertMany(experiences.map((exp) => ({ ...exp, userId })));
    const educationDocs = await education_model_1.Education.insertMany(educationList.map((edu) => ({ ...edu, userId })));
    const awarenessDocs = await awardsAndHonor_model_1.AwardsAndHonor.insertMany(awardsAndHonors.map((honor) => ({ ...honor, userId })));
    res.status(http_status_1.default.CREATED).json({
        success: true,
        message: 'Resume created successfully',
        date: {
            resume: resumeDoc,
            experiences: exparienceDocs,
            education: educationDocs,
            awardsAndHonors: awarenessDocs,
        },
    });
});
/*********************
 * GET A USER RESUME *
 *********************/
exports.resumeOfaUser = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req.user?._id;
    const resume = await createResume_model_1.CreateResume.findOne({ userId });
    const experiences = await experience_model_1.Experience.find({ userId });
    const education = await education_model_1.Education.find({ userId });
    const awardsAndHonors = await awardsAndHonor_model_1.AwardsAndHonor.find({ userId });
    const elevatorPitch = await elevatorPitch_model_1.ElevatorPitch.find({ userId });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Resume fetched successfully',
        data: {
            resume,
            experiences,
            education,
            awardsAndHonors,
            elevatorPitch,
        },
    });
});
/*********************
 * GET A USER RESUME *
 *********************/
exports.resumeOfaUser1 = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req.params.userId;
    const resume = await createResume_model_1.CreateResume.findOne({ userId });
    const experiences = await experience_model_1.Experience.find({ userId });
    const education = await education_model_1.Education.find({ userId });
    const awardsAndHonors = await awardsAndHonor_model_1.AwardsAndHonor.find({ userId });
    const elevatorPitch = await elevatorPitch_model_1.ElevatorPitch.find({ userId });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Resume fetched successfully',
        data: {
            resume,
            experiences,
            education,
            awardsAndHonors,
            elevatorPitch,
        },
    });
});
/*******************
 * UPDATE A RESUME *
 *******************/
exports.updateResume = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req.user?._id;
    // const {
    //   resume,
    //   experiences = [],
    //   educationList = [],
    //   awardsAndHonors = [],
    // } = req.body
    const user = await user_model_1.User.findById(userId);
    if (!user) {
        throw new AppError_1.default(400, "User Not Found");
    }
    const resume = JSON.parse(req.body.resume || '{}');
    const experiences = JSON.parse(req.body.experiences || '[]');
    const educationList = JSON.parse(req.body.educationList || '[]');
    const awardsAndHonors = JSON.parse(req.body.awardsAndHonors || '[]');
    if (!userId)
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'User ID is required');
    // // Upload new photo if provided
    // if (req.file) {
    //   const cloudinaryResult = await uploadToCloudinary(req.file.path)
    //   if (cloudinaryResult) {
    //     resume.photo = cloudinaryResult.secure_url
    //   }
    // }
    const files = req.files;
    if (files?.photo) {
        const logoRes = await (0, cloudinary_1.uploadToCloudinary)(files.photo[0].path);
        if (logoRes?.secure_url) {
            resume.photo = logoRes.secure_url;
            if (!user.avatar) {
                user.avatar = { url: "" }; // initialize if missing
            }
            user.avatar.url = logoRes.secure_url || "";
            await user?.save();
        }
    }
    if (files?.banner) {
        const certRes = await (0, cloudinary_1.uploadToCloudinary)(files.banner[0].path);
        if (certRes?.secure_url) {
            resume.banner = certRes.secure_url;
        }
    }
    // Update or create the main resume document
    const updatedResume = await createResume_model_1.CreateResume.findOneAndUpdate({ userId }, { ...resume, userId }, { new: true, upsert: true });
    // // Delete old related documents
    // await Promise.all([
    //   Experience.deleteMany({ userId }),
    //   Education.deleteMany({ userId }),
    //   AwardsAndHonor.deleteMany({ userId }),
    // ])
    // Insert new related documents
    // const [updatedExperiences, updatedEducation, updatedAwards] =
    //   await Promise.all([
    //     experiences.length
    //       ? Experience.insertMany(
    //           experiences.map((exp: any) => ({ ...exp, userId }))
    //         )
    //       : Promise.resolve([]),
    //     educationList.length
    //       ? Education.insertMany(
    //           educationList.map((edu: any) => ({ ...edu, userId }))
    //         )
    //       : Promise.resolve([]),
    //     awardsAndHonors.length
    //       ? AwardsAndHonor.insertMany(
    //           awardsAndHonors.map((honor: any) => ({ ...honor, userId }))
    //         )
    //       : Promise.resolve([]),
    //   ])
    const [updatedExperiences, updatedEducation, updatedAwards] = await Promise.all([
        // 🔹 Experiences
        Promise.all(experiences.map(async (exp) => {
            if (exp.type === "create") {
                return await experience_model_1.Experience.create({ ...exp, userId });
            }
            if (exp.type === "update" && exp._id) {
                return await experience_model_1.Experience.findByIdAndUpdate(exp._id, { ...exp, userId }, { new: true });
            }
            if (exp.type === "delete" && exp._id) {
                return await experience_model_1.Experience.findByIdAndDelete(exp._id);
            }
            return null;
        })),
        // 🔹 Education
        Promise.all(educationList.map(async (edu) => {
            if (edu.type === "create") {
                return await education_model_1.Education.create({ ...edu, userId });
            }
            if (edu.type === "update" && edu._id) {
                return await education_model_1.Education.findByIdAndUpdate(edu._id, { ...edu, userId }, { new: true });
            }
            if (edu.type === "delete" && edu._id) {
                return await education_model_1.Education.findByIdAndDelete(edu._id);
            }
            return null;
        })),
        // 🔹 Awards & Honors
        Promise.all(awardsAndHonors.map(async (honor) => {
            if (honor.type === "create") {
                return await awardsAndHonor_model_1.AwardsAndHonor.create({ ...honor, userId });
            }
            if (honor.type === "update" && honor._id) {
                return await awardsAndHonor_model_1.AwardsAndHonor.findByIdAndUpdate(honor._id, { ...honor, userId }, { new: true });
            }
            if (honor.type === "delete" && honor._id) {
                return await awardsAndHonor_model_1.AwardsAndHonor.findByIdAndDelete(honor._id);
            }
            return null;
        })),
    ]);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Resume updated successfully',
        data: {
            resume: updatedResume,
            experiences: updatedExperiences,
            education: updatedEducation,
            awardsAndHonors: updatedAwards,
        },
    });
});
/*******************
 * DELETE A RESUME *
 *******************/
exports.deleteResume = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req.user?._id;
    if (!userId)
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'User ID is required');
    await Promise.all([
        createResume_model_1.CreateResume.deleteOne({ userId }),
        experience_model_1.Experience.deleteMany({ userId }),
        education_model_1.Education.deleteMany({ userId }),
        awardsAndHonor_model_1.AwardsAndHonor.deleteMany({ userId }),
        elevatorPitch_model_1.ElevatorPitch.deleteMany({ userId }),
    ]);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Resume and all related data deleted successfully',
        data: null,
    });
});
