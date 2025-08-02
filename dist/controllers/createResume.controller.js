"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteResume = exports.updateResume = exports.resumeOfaUser = exports.createResume = void 0;
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
/********************
 * CREATE RESUME *
 ********************/
exports.createResume = (0, catchAsync_1.default)(async (req, res) => {
    // const { userId, resume, experiences, educationList, awardsAndHonors } =
    //   req.body
    const { userId } = req.body;
    const resume = JSON.parse(req.body.resume || '{}');
    const experiences = JSON.parse(req.body.experiences || '[]');
    const educationList = JSON.parse(req.body.educationList || '[]');
    const awardsAndHonors = JSON.parse(req.body.awardsAndHonors || '[]');
    if (!userId)
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'User ID is required');
    // check if file was uplaod
    let uploadFileUrl = null;
    if (req.file) {
        console.log('first');
        const cloudinaryResult = await (0, cloudinary_1.uploadToCloudinary)(req.file.path);
        if (cloudinaryResult) {
            uploadFileUrl = cloudinaryResult.secure_url;
            console.log('second');
        }
    }
    console.log('theard ');
    const resumeDoc = await createResume_model_1.CreateResume.create({
        ...resume,
        userId,
        photo: uploadFileUrl,
    });
    console.log(4);
    const exparienceDocs = await experience_model_1.Experience.insertMany(experiences.map((exp) => ({ ...exp, userId })));
    const educationDocs = await education_model_1.Education.insertMany(educationList.map((edu) => ({ ...edu, userId })));
    const awarenessDocs = await awardsAndHonor_model_1.AwardsAndHonor.insertMany(awardsAndHonors.map((honor) => ({ ...honor, userId })));
    console.log('4');
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
/*******************
 * UPDATE A RESUME *
 *******************/
// export const updateResume = catchAsync(async (req: Request, res: Response) => {
//   const userId = req.user?._id
//   const { resume, experiences, educationList, awardsAndHonors } = req.body
//   if (!userId) throw new AppError(httpStatus.BAD_REQUEST, 'User ID is required')
//     if (req.file) {
//       const cloudinaryResult = await uploadToCloudinary(req.file.path)
//       if(cloudinaryResult) {
//         resume.photo = cloudinaryResult.secure_url
//       }
//     }
//   const updatedResume = await CreateResume.findOneAndUpdate(
//     { userId },
//     {...resume, userId},
//     { new: true, upsert: true }
//   )
// // delete old documents
//   await Promise.all([
//     Experience.deleteMany({ userId }),
//     Education.deleteMany({ userId }),
//     AwardsAndHonor.deleteMany({ userId }),
//   ])
//   // insert new related documents
//   const [updatedExperiences, updatedEducation, updatedAwards] =
//     await Promise.all([
//       experiences.length
//         ? Experience.insertMany(
//             experiences.map((exp: any) => ({ ...exp, userId }))
//           )
//         : [],
//       educationList.length
//         ? Education.insertMany(
//             educationList.map((edu: any) => ({ ...edu, userId }))
//           )
//         : [],
//       awardsAndHonors.length
//         ? AwardsAndHonor.insertMany(
//             awardsAndHonors.map((honor: any) => ({ ...honor, userId }))
//           )
//         : [],
//     ])
//   // Delete old experiences, education, honors
//   await Experience.deleteMany({ userId })
//   await Education.deleteMany({ userId })
//   await AwardsAndHonor.deleteMany({ userId })
//   // Insert updated ones
//   const updatedExperiences = await Experience.insertMany(
//     experiences.map((exp: any) => ({ ...exp, userId }))
//   )
//   const updatedEducation = await Education.insertMany(
//     educationList.map((edu: any) => ({ ...edu, userId }))
//   )
//   const updatedAwards = await AwardsAndHonor.insertMany(
//     awardsAndHonors.map((honor: any) => ({ ...honor, userId }))
//   )
//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: 'Resume updated successfully',
//     data: {
//       resume: updatedResume,
//       experiences: updatedExperiences,
//       education: updatedEducation,
//       awardsAndHonors: updatedAwards,
//     },
//   })
// })
exports.updateResume = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req.user?._id;
    const { resume, experiences = [], educationList = [], awardsAndHonors = [], } = req.body;
    if (!userId)
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'User ID is required');
    // Upload new photo if provided
    if (req.file) {
        const cloudinaryResult = await (0, cloudinary_1.uploadToCloudinary)(req.file.path);
        if (cloudinaryResult) {
            resume.photo = cloudinaryResult.secure_url;
        }
    }
    // Update or create the main resume document
    const updatedResume = await createResume_model_1.CreateResume.findOneAndUpdate({ userId }, { ...resume, userId }, { new: true, upsert: true });
    // Delete old related documents
    await Promise.all([
        experience_model_1.Experience.deleteMany({ userId }),
        education_model_1.Education.deleteMany({ userId }),
        awardsAndHonor_model_1.AwardsAndHonor.deleteMany({ userId }),
    ]);
    // Insert new related documents
    const [updatedExperiences, updatedEducation, updatedAwards] = await Promise.all([
        experiences.length
            ? experience_model_1.Experience.insertMany(experiences.map((exp) => ({ ...exp, userId })))
            : Promise.resolve([]),
        educationList.length
            ? education_model_1.Education.insertMany(educationList.map((edu) => ({ ...edu, userId })))
            : Promise.resolve([]),
        awardsAndHonors.length
            ? awardsAndHonor_model_1.AwardsAndHonor.insertMany(awardsAndHonors.map((honor) => ({ ...honor, userId })))
            : Promise.resolve([]),
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
