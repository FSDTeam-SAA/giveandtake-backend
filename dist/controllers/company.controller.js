"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCompanyEmployeesWithSkills = exports.deleteCompany = exports.getCompanyByEmployeeId = exports.getCompanyByUserId = exports.updateCompany = exports.createCompany = void 0;
const company_model_1 = require("../models/company.model");
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const http_status_1 = __importDefault(require("http-status"));
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const cloudinary_1 = require("../utils/cloudinary");
const awardsAndHonor_model_1 = require("../models/awardsAndHonor.model");
const mongoose_1 = __importDefault(require("mongoose"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const pagination_1 = require("../utils/pagination");
const createResume_model_1 = require("../models/createResume.model");
const user_model_1 = require("../models/user.model");
const elevatorPitch_model_1 = require("../models/elevatorPitch.model");
const recruiterAccount_model_1 = require("../models/recruiterAccount.model");
const assignCompanyReq_model_1 = require("../models/assignCompanyReq.model");
/******************
 * CREATE COMPANY *
 ******************/
// export const createCompany = catchAsync(async (req: Request, res: Response) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();
//   try {
//     const { AwardsAndHonors, ...companyData } = req.body;
//     // Handle file upload (e.g. logo)
//     // if (req.file?.path) {
//     //   const cloudinaryRes = await uploadToCloudinary(req.file.path);
//     //   if (cloudinaryRes?.secure_url) {
//     //     companyData.clogo = cloudinaryRes.secure_url;
//     //   }
//     // }
//     const files = req.files as Record<string, Express.Multer.File[]>;
//     if (files?.clogo?.[0]?.path) {
//       const logoRes = await uploadToCloudinary(files.clogo[0].path);
//       if (logoRes?.secure_url) {
//         companyData.clogo = logoRes.secure_url;
//       }
//     }
//     if (files?.banner?.[0]?.path) {
//       const certRes = await uploadToCloudinary(files.banner[0].path);
//       if (certRes?.secure_url) {
//         companyData.banner = certRes.secure_url;
//       }
//     }
//     companyData.employeesId = JSON.parse(companyData.employeesId || "[]");
//     companyData.links = JSON.parse(companyData.links || "[]");
//     companyData.service = JSON.parse(companyData.service || "[]");
//     // Optional: attach userId from req.user if available
//     if (req.user?._id) {
//       companyData.userId = req.user._id;
//     }
//     // Create company document
//     const newCompany = await Company.create([companyData], { session });
//     // Parse and insert awards and honors if provided
//     let createdHonors = [] as any[];
//     let parsedHonors = [];
//     if (typeof AwardsAndHonors === "string") {
//       try {
//         parsedHonors = JSON.parse(AwardsAndHonors);
//       } catch (err) {
//         throw new AppError(
//           httpStatus.BAD_REQUEST,
//           "Invalid JSON format in AwardsAndHonors"
//         );
//       }
//     } else if (Array.isArray(AwardsAndHonors)) {
//       parsedHonors = AwardsAndHonors;
//     }
//     if (parsedHonors.length > 0) {
//       const honorData = parsedHonors.map((item: any) => ({
//         ...item,
//         userId: companyData.userId,
//       }));
//       createdHonors = await AwardsAndHonor.insertMany(honorData, { session });
//     }
//     await session.commitTransaction();
//     session.endSession();
//     sendResponse(res, {
//       statusCode: httpStatus.CREATED,
//       success: true,
//       message: "Company and associated honors created successfully",
//       data: {
//         company: newCompany[0],
//         honors: createdHonors,
//       },
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
//     console.error("Error creating company:", error);
//     throw error;
//   }
// });
exports.createCompany = (0, catchAsync_1.default)(async (req, res) => {
    const session = await mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const { AwardsAndHonors, ...companyData } = req.body;
        const files = req.files;
        if (files?.clogo?.[0]?.path) {
            const logoRes = await (0, cloudinary_1.uploadToCloudinary)(files.clogo[0].path);
            if (logoRes?.secure_url) {
                companyData.clogo = logoRes.secure_url;
            }
        }
        if (files?.banner?.[0]?.path) {
            const certRes = await (0, cloudinary_1.uploadToCloudinary)(files.banner[0].path);
            if (certRes?.secure_url) {
                companyData.banner = certRes.secure_url;
            }
        }
        companyData.employeesId = JSON.parse(companyData.employeesId || '[]');
        companyData.sLink = JSON.parse(companyData.sLink || '[]');
        companyData.service = JSON.parse(companyData.service || '[]');
        // Optional: attach userId from req.user if available
        if (req.user?._id) {
            companyData.userId = req.user._id;
        }
        // ✅ Create company document
        const newCompany = await company_model_1.Company.create([companyData], { session });
        const createdCompany = newCompany[0];
        // ✅ If employeesId provided, update RecruiterAccount with companyId
        if (companyData.employeesId.length > 0) {
            await recruiterAccount_model_1.RecruiterAccount.updateMany({ userId: { $in: companyData.employeesId } }, { $set: { companyId: createdCompany._id } }, { session });
        }
        // ✅ Handle Awards and Honors
        let createdHonors = [];
        let parsedHonors = [];
        if (typeof AwardsAndHonors === 'string') {
            try {
                parsedHonors = JSON.parse(AwardsAndHonors);
            }
            catch (err) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid JSON format in AwardsAndHonors');
            }
        }
        else if (Array.isArray(AwardsAndHonors)) {
            parsedHonors = AwardsAndHonors;
        }
        if (parsedHonors.length > 0) {
            const honorData = parsedHonors.map((item) => ({
                ...item,
                userId: companyData.userId,
            }));
            createdHonors = await awardsAndHonor_model_1.AwardsAndHonor.insertMany(honorData, { session });
        }
        await session.commitTransaction();
        session.endSession();
        (0, sendResponse_1.default)(res, {
            statusCode: http_status_1.default.CREATED,
            success: true,
            message: 'Company and associated honors created successfully',
            data: {
                company: createdCompany,
                honors: createdHonors,
            },
        });
    }
    catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error creating company:', error);
        throw error;
    }
});
/************************
 * UPDATE COMPANY BY ID *
 ************************/
exports.updateCompany = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const companyData = { ...req.body };
    const files = req.files;
    if (files?.clogo) {
        const logoRes = await (0, cloudinary_1.uploadToCloudinary)(files.clogo[0].path);
        if (logoRes?.secure_url) {
            companyData.clogo = logoRes.secure_url;
        }
    }
    if (files?.banner) {
        const certRes = await (0, cloudinary_1.uploadToCloudinary)(files.banner[0].path);
        if (certRes?.secure_url) {
            companyData.banner = certRes.secure_url;
        }
    }
    companyData.employeesId = JSON.parse(req.body.employeesId || '[]');
    companyData.sLink = JSON.parse(req.body.sLink || '[]');
    companyData.service = JSON.parse(req.body.service || '[]');
    const updated = await company_model_1.Company.findByIdAndUpdate(id, companyData, {
        new: true,
        runValidators: true,
    });
    const honors = JSON.parse(req.body.honors || '[]'); // expecting array
    let results;
    if (honors.length > 0) {
        results = await Promise.all(honors.map(async (item) => {
            if (item.type === 'create') {
                const newHonor = new awardsAndHonor_model_1.AwardsAndHonor({
                    userId: req.user?._id, // adjust if needed
                    title: item.title,
                    programeDate: item.programeDate,
                    description: item.description,
                    issuer: item.issuer,
                });
                return await newHonor.save();
            }
            if (item.type === 'update' && item._id) {
                return await awardsAndHonor_model_1.AwardsAndHonor.findByIdAndUpdate(item._id, {
                    title: item.title,
                    programeDate: item.programeDate,
                    description: item.description,
                    issuer: item.issuer,
                }, { new: true });
            }
            if (item.type === 'delete' && item._id) {
                return await awardsAndHonor_model_1.AwardsAndHonor.findByIdAndDelete(item._id);
            }
            return null;
        }));
    }
    if (!updated) {
        res.status(http_status_1.default.NOT_FOUND).json({
            success: false,
            message: 'Company not found',
        });
        return;
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Company updated successfully',
        data: { updated, results },
    });
});
/**************************
 * GET COMPANY BY USER ID *
 **************************/
exports.getCompanyByUserId = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.params;
    const { page, limit, skip } = (0, pagination_1.getPaginationParams)(req.query);
    // Count total companies for this user
    const totalCompanies = await company_model_1.Company.countDocuments({ userId });
    // Fetch companies with pagination
    const companies = await company_model_1.Company.find({ userId })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });
    let companiesWithPitch = await Promise.all(companies.map(async (company) => {
        // Find related pitch by companyId
        const pitch = await elevatorPitch_model_1.ElevatorPitch.findOne({ userId: userId });
        // Merge pitch into company object
        return {
            ...company.toObject(),
            elevatorPitch: pitch || null, // add pitch data or null
        };
    }));
    // Get related AwardsAndHonor (if any), for all companies by user
    const honors = await awardsAndHonor_model_1.AwardsAndHonor.find({ userId }).sort({
        programeDate: -1,
    });
    const meta = (0, pagination_1.buildMetaPagination)(totalCompanies, page, limit);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Companies and related honors fetched successfully',
        data: {
            meta,
            companies: companiesWithPitch,
            honors,
        },
    });
});
exports.getCompanyByEmployeeId = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.params;
    const { page, limit, skip } = (0, pagination_1.getPaginationParams)(req.query);
    // Count total companies for this user
    const totalCompanies = await company_model_1.Company.countDocuments({ userId });
    // Fetch companies with pagination
    const companies = await company_model_1.Company.find({ employeesId: { $in: [userId] } })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });
    const companiesWithHonors = await Promise.all(companies.map(async (company) => {
        const honors = await awardsAndHonor_model_1.AwardsAndHonor.find({
            userId: company.userId,
        }).sort({ programeDate: -1 });
        return { ...company.toObject(), honors };
    }));
    // // Get related AwardsAndHonor (if any), for all companies by user
    // const honors = await AwardsAndHonor.find({ userId }).sort({
    //   programeDate: -1,
    // })
    const meta = (0, pagination_1.buildMetaPagination)(totalCompanies, page, limit);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Companies and related honors fetched successfully',
        data: {
            meta,
            companiesWithHonors,
        },
    });
});
/************************
 * DELETE COMPANY BY ID *
 ************************/
exports.deleteCompany = (0, catchAsync_1.default)(async (req, res) => {
    const { id } = req.params;
    const deleted = await company_model_1.Company.findByIdAndDelete(id);
    if (!deleted) {
        res.status(404).json({
            success: false,
            message: 'Company not found',
        });
        return;
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Company deleted successfully',
        data: deleted,
    });
});
/*************************************
 * GET COMPANY EMPLOYEES WITH SKILLS *
 *************************************/
exports.getCompanyEmployeesWithSkills = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.params;
    const { page, limit, skip } = (0, pagination_1.getPaginationParams)(req.query);
    // 1. Find the company document for the given userId (company)
    const company = await company_model_1.Company.findOne({ userId })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });
    if (!company) {
        return (0, sendResponse_1.default)(res, {
            statusCode: http_status_1.default.NOT_FOUND,
            success: false,
            message: 'Company not found',
            data: null,
        });
    }
    // 2. Convert employee ObjectIds to strings for querying
    const employeeIds = company.employeesId.map((id) => new mongoose_1.default.Types.ObjectId(id));
    // 3. Fetch employee details from User model
    const employees = await user_model_1.User.find({
        _id: { $in: employeeIds },
    }).select('_id name email phoneNum role avatar');
    // 4. Fetch skills from CreateResume model for these employees
    const resumes = await createResume_model_1.CreateResume.find({
        userId: { $in: employeeIds },
    }).select('userId skills');
    // Create a map of userId => skills
    const skillsMap = new Map(resumes.map((resume) => [resume.userId.toString(), resume.skills]));
    // 5. Combine employee data with their skills
    const employeesWithSkills = employees.map((employee) => ({
        _id: employee._id,
        name: employee.name,
        email: employee.email,
        phoneNum: employee.phoneNum,
        role: employee.role,
        photo: employee.avatar,
        skills: skillsMap.get(employee._id.toString()) || [],
    }));
    const request = await assignCompanyReq_model_1.ReqCompany.find({ company: company._id, status: "pending" }).populate('userId', '_id name email phoneNum role avatar');
    // 6. Prepare the response data
    const responseData = {
        company: {
            _id: company._id,
            cname: company.cname,
            clogo: company.clogo,
            industry: company.industry,
            aboutUs: company.aboutUs,
            country: company.country,
            city: company.city,
        },
        employees: employeesWithSkills,
        request,
        meta: (0, pagination_1.buildMetaPagination)(1, page, limit),
    };
    // 7. Send the response
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Company and employees with skills fetched successfully',
        data: responseData,
    });
});
