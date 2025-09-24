"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAllUsers = exports.getCompaniesWithAccounts = exports.getRecruitersWithAccounts = exports.getCandidates = exports.refreshToken = exports.updateUser = exports.getUserById1 = exports.getUserById = exports.getAllCompanies = exports.getAllUserEmails = exports.softDeactivateUser = exports.deactivateUser = exports.securityResetPassword = exports.verifySecurityAnswers = exports.checkSubmitSecurityAnswers = exports.submitSecurityAnswers = exports.getDefaultSecurityQuestions = exports.setSecurityQuestions = exports.changePassword = exports.resetPassword = exports.forgetPassword = exports.verifyEmail = exports.login = exports.register = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const generateOTP_1 = require("../utils/generateOTP");
const authToken_1 = require("../utils/authToken");
const sendEmail_1 = require("../utils/sendEmail");
const user_model_1 = require("../models/user.model");
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const defaultSecurityQuestions_1 = require("../constants/defaultSecurityQuestions");
const cloudinary_1 = require("../utils/cloudinary");
const createResume_model_1 = require("../models/createResume.model");
const recruiterAccount_model_1 = require("../models/recruiterAccount.model");
const company_model_1 = require("../models/company.model");
const paymentInfo_model_1 = require("../models/paymentInfo.model");
const moment_1 = __importDefault(require("moment"));
const experience_model_1 = require("../models/experience.model");
const job_model_1 = require("../models/job.model");
exports.register = (0, catchAsync_1.default)(async (req, res) => {
    const { name, email, password, address, phoneNum, role, dateOfbirth } = req.body;
    if (!name || !email || !password) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Please fill in all fields");
    }
    const otp = (0, generateOTP_1.generateOTP)();
    const jwtPayloadOTP = {
        otp: otp,
    };
    const otptoken = (0, authToken_1.createToken)(jwtPayloadOTP, process.env.OTP_SECRET, process.env.OTP_EXPIRE);
    const user = await user_model_1.User.create({
        name,
        email,
        password,
        phoneNum,
        address,
        role,
        verificationInfo: { token: otptoken },
        dateOfbirth
    });
    await (0, sendEmail_1.sendEmail)(user.email, "Registerd Account", `Your OTP is ${otp}`);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "User Logged in successfully",
        data: user,
    });
});
exports.login = (0, catchAsync_1.default)(async (req, res) => {
    const { email, password } = req.body;
    const user = await user_model_1.User.isUserExistsByEmail(email);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    // console.log(await User.isPasswordMatched(password.toString(), user.password))
    if (user?.password &&
        !(await user_model_1.User.isPasswordMatched(password, user.password))) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Password is not correct");
    }
    if (!(await user_model_1.User.isOTPVerified(user._id.toString()))) {
        const otp = (0, generateOTP_1.generateOTP)();
        const jwtPayloadOTP = {
            otp: otp,
        };
        const otptoken = (0, authToken_1.createToken)(jwtPayloadOTP, process.env.OTP_SECRET, process.env.OTP_EXPIRE);
        user.verificationInfo.token = otptoken;
        await user.save();
        await (0, sendEmail_1.sendEmail)(user.email, "Registerd Account", `Your OTP is ${otp}`);
        return (0, sendResponse_1.default)(res, {
            statusCode: http_status_1.default.FORBIDDEN,
            success: false,
            message: "OTP is not verified, please verify your OTP",
            data: { email: user.email },
        });
    }
    // REACTIVATE ACCOUNT IF ACCOUNT IS DEACTIVATE
    if (user.deactivate) {
        user.deactivate = false;
        user.dateOfdeactivate = undefined;
    }
    const jwtPayload = {
        _id: user._id,
        email: user.email,
        role: user.role,
    };
    const accessToken = (0, authToken_1.createToken)(jwtPayload, process.env.JWT_ACCESS_SECRET, process.env.JWT_ACCESS_EXPIRES_IN);
    const refreshToken = (0, authToken_1.createToken)(jwtPayload, process.env.JWT_REFRESH_SECRET, process.env.JWT_REFRESH_EXPIRES_IN);
    user.refresh_token = refreshToken;
    let _user = await user.save();
    const checkPayment = await paymentInfo_model_1.paymentInfo
        .findOne({ userId: user._id })
        .sort({ updatedAt: -1 })
        .populate("planId");
    let expiryDate = null;
    let payAsYouGo = undefined;
    let isValid = false;
    if (checkPayment?.planId === null || !checkPayment) {
        payAsYouGo = false;
        isValid = false;
    }
    else {
        const plan = checkPayment?.planId;
        if (plan?.valid != "PayAsYouGo") {
            if (plan.valid === "monthly") {
                expiryDate = (0, moment_1.default)(checkPayment.updatedAt).add(1, "month").toDate();
            }
            else if (plan.valid === "yearly") {
                expiryDate = (0, moment_1.default)(checkPayment.updatedAt).add(1, "year").toDate();
            }
            isValid = expiryDate ? new Date() <= expiryDate : false;
        }
        else if (plan?.valid === "PayAsYouGo") {
            const jobExists = await job_model_1.Job.exists({
                userId: user._id,
                createdAt: { $gte: checkPayment.updatedAt },
            });
            if (jobExists) {
                payAsYouGo = false; // already posted a job after payment
            }
            else {
                payAsYouGo = true; // can still post
            }
            isValid = false;
        }
        else {
            payAsYouGo = true;
            isValid = false;
        }
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "User Logged in successfully",
        data: {
            accessToken,
            role: user.role,
            _id: user._id,
            name: user.name, email: email, address: user.address, phoneNum: user.phoneNum, dateOfbirth: user.dateOfbirth,
            refreshToken,
            isValid,
            payAsYouGo,
            plan: checkPayment?.planId
        },
    });
});
exports.verifyEmail = (0, catchAsync_1.default)(async (req, res) => {
    const { email, otp } = req.body;
    const user = await user_model_1.User.isUserExistsByEmail(email);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    if (user.verificationInfo.verified) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "User already verified");
    }
    if (otp) {
        const savedOTP = (0, authToken_1.verifyToken)(user.verificationInfo.token, process.env.OTP_SECRET || "");
        console.log(savedOTP);
        if (otp === savedOTP.otp) {
            user.verificationInfo.verified = true;
            user.verificationInfo.token = "";
            await user.save();
            (0, sendResponse_1.default)(res, {
                statusCode: http_status_1.default.OK,
                success: true,
                message: "User verified",
                data: "",
            });
        }
        else {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid OTP");
        }
    }
    else {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "OTP is required");
    }
});
exports.forgetPassword = (0, catchAsync_1.default)(async (req, res) => {
    const { email } = req.body;
    const user = await user_model_1.User.isUserExistsByEmail(email);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    const otp = (0, generateOTP_1.generateOTP)();
    const jwtPayloadOTP = {
        otp: otp,
    };
    const otptoken = (0, authToken_1.createToken)(jwtPayloadOTP, process.env.OTP_SECRET, process.env.OTP_EXPIRE);
    user.password_reset_token = otptoken;
    await user.save();
    /////// TODO: SENT EMAIL MUST BE DONE
    (0, sendEmail_1.sendEmail)(user.email, "Reset Password", `Your OTP is ${otp}`);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "OTP sent to your email",
        data: "",
    });
});
exports.resetPassword = (0, catchAsync_1.default)(async (req, res) => {
    const { password, otp, email } = req.body;
    const user = await user_model_1.User.isUserExistsByEmail(email);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    if (!user.password_reset_token) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Password reset token is invalid");
    }
    const verify = (await (0, authToken_1.verifyToken)(user.password_reset_token, process.env.OTP_SECRET));
    if (verify.otp !== otp) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid OTP");
    }
    user.password = password;
    await user.save();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Password reset successfully",
        data: {},
    });
});
exports.changePassword = (0, catchAsync_1.default)(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Old password and new password are required");
    }
    if (oldPassword === newPassword) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Old password and new password cannot be same");
    }
    const user = await user_model_1.User.findById({ _id: req.user?._id });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    user.password = newPassword;
    await user.save();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Password changed",
        data: "",
    });
});
/**************************************
 * Set SECURITY QUESTIONS AND ANSWERS *
 **************************************/
exports.setSecurityQuestions = (0, catchAsync_1.default)(async (req, res) => {
    const { email, securityQuestions } = req.body;
    if (!email || typeof email !== "string") {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Email is required and must be a string");
    }
    if (!Array.isArray(securityQuestions) ||
        securityQuestions.some((q) => !q.question ||
            typeof q.question !== "string" ||
            !q.answer ||
            typeof q.answer !== "string")) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid security questions format");
    }
    const user = await user_model_1.User.findOne({ email });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    await user.save();
    res.status(http_status_1.default.OK).json({
        success: true,
        message: "Security questions saved successfully",
    });
});
/**********************************
 * GET DEFAULT SECURITY QUESTIONS *
 **********************************/
exports.getDefaultSecurityQuestions = (0, catchAsync_1.default)(async (_req, res) => {
    res.status(200).json({
        success: true,
        message: "Default security questions fetched successfully",
        date: defaultSecurityQuestions_1.defaultSecurityQuestions,
    });
});
/***************************
 * SUBMIT SECURITY ANSWERS *
 ***************************/
exports.submitSecurityAnswers = (0, catchAsync_1.default)(async (req, res) => {
    const { email, securityQuestions } = req.body;
    // console.log("securityQuestions", securityQuestions)
    if (!email || !Array.isArray(securityQuestions)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid input");
    }
    const user = await user_model_1.User.findOne({ email });
    // console.log("first", user)
    if (!user)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    // Overwrite existing questions
    user.securityQuestions = securityQuestions;
    await user.save();
    res.status(http_status_1.default.OK).json({
        success: true,
        message: "Security questions saved",
    });
});
exports.checkSubmitSecurityAnswers = (0, catchAsync_1.default)(async (req, res) => {
    const { email } = req.body;
    // console.log("securityQuestions", securityQuestions)
    if (!email) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid input");
    }
    const user = await user_model_1.User.findOne({ email });
    // console.log("first", user)
    if (!user)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    if (!user.securityQuestions) {
        res.status(http_status_1.default.OK).json({
            success: true,
            message: "Security questions not Found",
            data: { security: false },
        });
    }
    res.status(http_status_1.default.OK).json({
        success: true,
        message: "Security questions Found",
        data: { security: true },
    });
});
/***************************
 * VERIFY SECURITY ANSWERS *
 ***************************/
exports.verifySecurityAnswers = (0, catchAsync_1.default)(async (req, res) => {
    const { email, answers } = req.body;
    if (!email || !Array.isArray(answers)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid input");
    }
    const user = await user_model_1.User.findOne({ email }).select("securityQuestions");
    if (user?.securityQuestions?.length !== answers.length) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Number of answers does not match the number of security questions");
    }
    if (!user || user.securityQuestions.length <= 0) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Security questions not found");
    }
    const matched = user.securityQuestions?.every((q, i) => {
        return q.answer.trim().toLowerCase() === answers[i]?.trim().toLowerCase();
    });
    if (!matched) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, "Security answers do not match");
    }
    const resetToken = (0, authToken_1.createToken)({ email }, process.env.JWT_ACCESS_SECRET, process.env.JWT_ACCESS_EXPIRES_IN);
    user.verificationInfo.resetToken = resetToken;
    await user.save();
    res.status(http_status_1.default.OK).json({
        success: true,
        message: "Answers verified. You can now reset your password.",
        data: { resetToken },
    });
});
/**********************************************
 * RESET PASSWORD USING THE SECURITY PASSWORD *
 **********************************************/
exports.securityResetPassword = (0, catchAsync_1.default)(async (req, res) => {
    const { token } = req.query;
    const { newPassword } = req.body;
    if (!token || typeof token !== "string") {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Reset token is required");
    }
    if (!newPassword || typeof newPassword !== "string") {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "New password is required");
    }
    const user = await user_model_1.User.findOne({
        "verificationInfo.resetToken": token,
    }).select("+password");
    if (!user) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, "Invalid or expired reset token");
    }
    // Set new password (bcrypt will hash in pre-save hook)
    user.password = newPassword;
    user.verificationInfo.resetToken = ""; // clear token
    await user.save();
    res.status(http_status_1.default.OK).json({
        success: true,
        message: "Password has been reset successfully",
    });
});
/***************************
 * DEACTIVATE USER ACCOUNT *
 ***************************/
exports.deactivateUser = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req.user?._id;
    const user = await user_model_1.User.findById(userId);
    if (!user)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    user.deactivate = true;
    user.dateOfdeactivate = new Date();
    await user.save();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Account deactivated. Your data will be deleted in 30 days.",
        data: null,
    });
});
//actual deactivate user without 30 days
exports.softDeactivateUser = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req.user?._id;
    const user = await user_model_1.User.findById(userId);
    if (!user)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    user.deactivate = true;
    user.dateOfdeactivate = undefined; // no scheduled deletion
    await user.save();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Account soft deactivated indefinitely. You can reactivate anytime.",
        data: null,
    });
});
/**********************************
 * GET ALL THE USER EMAIL AND _ID *
 **********************************/
exports.getAllUserEmails = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.query;
    const company = await company_model_1.Company.findOne({ userId: userId });
    const companyId = company?._id?.toString();
    // Fetch all users with selected fields
    const users = await user_model_1.User.find({}, { _id: 1, email: 1, role: 1, name: 1, avatar: 1 }).lean();
    // Get all employeesId and userId (company owner) from all companies
    const companies = await company_model_1.Company.find({}, { employeesId: 1, userId: 1 }).lean();
    // Gather all employee IDs across all companies
    const allEmployeeIds = new Set();
    companies.forEach((c) => {
        if (c.employeesId) {
            c.employeesId.forEach((id) => allEmployeeIds.add(id.toString()));
        }
        if (c.userId) {
            allEmployeeIds.add(c.userId.toString());
        }
    });
    let currentCompanyEmployeeIds = [];
    if (companyId) {
        const currentCompany = companies.find((c) => c._id?.toString() === companyId);
        if (currentCompany) {
            currentCompanyEmployeeIds = [
                ...(currentCompany.employeesId?.map((id) => id.toString()) || []),
            ];
            if (currentCompany.userId) {
                currentCompanyEmployeeIds.push(currentCompany.userId.toString());
            }
        }
    }
    // Exclude all employees except those in the current company (if provided)
    const excludedIds = [...allEmployeeIds].filter((id) => !currentCompanyEmployeeIds.includes(id));
    const filteredUsers = users.filter((u) => !excludedIds.includes(u._id.toString()));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "All user emails and IDs fetched successfully",
        data: filteredUsers,
    });
});
exports.getAllCompanies = (0, catchAsync_1.default)(async (req, res) => {
    const companies = await company_model_1.Company.find({})
        .populate({
        path: "userId",
        select: "name email phoneNum avatar.url role", // no need to specify `model`
    })
        .select("cname clogo banner country city cemail cPhoneNumber industry service links");
    const filteredCompanies = companies.map((company) => ({
        id: company._id,
        cname: company.cname,
        clogo: company.clogo,
        cemail: company.cemail,
        industry: company.industry,
    }));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "All Companies fetched successfully",
        data: filteredCompanies,
    });
});
/***************************
 * GET A SINGLE USER BY ID *
 ***************************/
// export const getUserById = catchAsync(async (req: Request, res: Response) => {
//   const id = req.user?._id;
//   const user = await User.findById(id).select(
//     "-password -verificationInfo -password_reset_token"
//   );
//   if (!user) {
//     throw new AppError(httpStatus.NOT_FOUND, "User not found");
//   }
//   const resume = await CreateResume.findOne({ userId: id }).select("sLink");
//   const user1: any = user.toObject();
//   user1.sLink = resume?.sLink || null;
//   const checkPayment = await paymentInfo
//     .findOne({ userId: user._id })
//     .sort({ updatedAt: -1 })
//     .populate("planId");
//   let expiryDate: Date | null = null;
//   let payAsYouGo: boolean | undefined = undefined;
//   let isValid = false;
//   console.log("checkPayment", checkPayment);
//   if (checkPayment?.planId === null || !checkPayment) {
//     payAsYouGo = false;
//     isValid = false;
//   } else {
//     if (checkPayment?.planId?.valid != "PayAsYouGo") {
//       if (checkPayment.planId.valid === "monthly") {
//         expiryDate = moment(checkPayment.updatedAt).add(1, "month").toDate();
//       } else if (checkPayment.planId.valid === "yearly") {
//         expiryDate = moment(checkPayment.updatedAt).add(1, "year").toDate();
//       }
//       isValid = expiryDate ? new Date() <= expiryDate : false;
//     } else if (checkPayment?.planId?.valid === "PayAsYouGo") {
//       const jobExists = await Job.exists({
//         userId: user._id,
//         createdAt: { $gte: checkPayment.updatedAt },
//       });
//       if (jobExists) {
//         payAsYouGo = false; // already posted a job after payment
//       } else {
//         payAsYouGo = true; // can still post
//       }
//       isValid = false;
//     } else {
//       payAsYouGo = true;
//       isValid = false;
//     }
//   }
//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: "User fetched successfully",
//     data: { ...user1, isValid, payAsYouGo, plan: checkPayment?.planId },
//   });
// });
const following_model_1 = require("../models/following.model"); // adjust path if needed
exports.getUserById = (0, catchAsync_1.default)(async (req, res) => {
    const id = req.user?._id;
    const user = await user_model_1.User.findById(id).select("-password -verificationInfo -password_reset_token");
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    const resume = await createResume_model_1.CreateResume.findOne({ userId: id }).select("sLink");
    const user1 = user.toObject();
    user1.sLink = resume?.sLink || null;
    // ---- PLAN / PAYMENT LOGIC (unchanged) ----
    const checkPayment = await paymentInfo_model_1.paymentInfo
        .findOne({ userId: user._id })
        .sort({ updatedAt: -1 })
        .populate("planId");
    let expiryDate = null;
    let payAsYouGo = undefined;
    let isValid = false;
    if (checkPayment?.planId === null || !checkPayment) {
        payAsYouGo = false;
        isValid = false;
    }
    else {
        const plan = checkPayment?.planId;
        if (plan?.valid != "PayAsYouGo") {
            if (plan.valid === "monthly") {
                expiryDate = (0, moment_1.default)(checkPayment.updatedAt).add(1, "month").toDate();
            }
            else if (plan.valid === "yearly") {
                expiryDate = (0, moment_1.default)(checkPayment.updatedAt).add(1, "year").toDate();
            }
            isValid = expiryDate ? new Date() <= expiryDate : false;
        }
        else if (plan?.valid === "PayAsYouGo") {
            const jobExists = await job_model_1.Job.exists({
                userId: user._id,
                createdAt: { $gte: checkPayment.updatedAt },
            });
            payAsYouGo = !jobExists;
            isValid = false;
        }
        else {
            payAsYouGo = true;
            isValid = false;
        }
    }
    // ---- FOLLOWING / FOLLOWERS LOGIC ----
    const followingList = await following_model_1.Following.find({ userId: id }).populate("recruiterId companyId", "name email"); // Add other fields you want to expose
    const followersList = await following_model_1.Following.find({
        $or: [{ recruiterId: id }, { companyId: id }],
    }).populate("userId", "name email");
    const following = followingList.map((f) => f.recruiterId || f.companyId);
    const followers = followersList.map((f) => f.userId);
    // ---- SEND RESPONSE ----
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "User fetched successfully",
        data: {
            ...user1,
            isValid,
            payAsYouGo,
            plan: checkPayment?.planId,
            following,
            followers,
        },
    });
});
exports.getUserById1 = (0, catchAsync_1.default)(async (req, res) => {
    const { userId } = req.params;
    const user = await user_model_1.User.findById(userId).select("-password -verificationInfo -password_reset_token");
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    const resume = await createResume_model_1.CreateResume.findOne({ userId: userId }).select("sLink");
    const user1 = user.toObject();
    user1.sLink = resume?.sLink || null;
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "User fetched successfully",
        data: user1,
    });
});
/**************************
 * UPDATE USER INFO BY ID *
 **************************/
exports.updateUser = (0, catchAsync_1.default)(async (req, res) => {
    const id = req.user?._id;
    const updateData = req.body;
    if (!id)
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "User ID is required");
    const allowedFields = ["name", "phoneNum", "address"];
    const filteredData = {};
    for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
            filteredData[field] = updateData[field];
        }
    }
    // Handle avatar upload
    if (req.files && req.files.photo) {
        const photo = req.files.photo[0];
        const uploadResult = await (0, cloudinary_1.uploadToCloudinary)(photo.path, "avatars");
        // Remove old avatar from Cloudinary if needed (optional)
        const existingUser = await user_model_1.User.findById(id).select("avatar");
        if (existingUser?.avatar?.url) {
            const publicId = path_1.default.basename(existingUser.avatar.url).split(".")[0];
            await (0, cloudinary_1.deleteFromCloudinary)(publicId);
        }
        filteredData.avatar = {
            url: uploadResult?.secure_url,
        };
        // Delete local file
        fs_1.default.unlinkSync(photo.path);
    }
    const updatedUser = await user_model_1.User.findByIdAndUpdate(id, filteredData, {
        new: true,
        runValidators: true,
    }).select("-password -verificationInfo -password_reset_token");
    if (!updatedUser) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found or not updated");
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "User updated successfully",
        data: updatedUser,
    });
});
// Refresh Token
exports.refreshToken = (0, catchAsync_1.default)(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        throw new AppError_1.default(400, "Refresh token is required");
    }
    const decoded = (0, authToken_1.verifyToken)(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await user_model_1.User.findById(decoded._id);
    if (!user) {
        throw new AppError_1.default(401, "Invalid refresh token");
    }
    const jwtPayload = {
        _id: user._id,
        email: user.email,
        role: user.role,
    };
    const accessToken = (0, authToken_1.createToken)(jwtPayload, process.env.JWT_ACCESS_SECRET, process.env.JWT_ACCESS_EXPIRES_IN);
    const refreshToken1 = (0, authToken_1.createToken)(jwtPayload, process.env.JWT_REFRESH_SECRET, process.env.JWT_REFRESH_EXPIRES_IN);
    user.refresh_token = refreshToken1;
    await user.save();
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Token refreshed successfully",
        data: { accessToken: accessToken, refreshToken: refreshToken1 },
    });
});
/***************************
 * GET ALL CANDIDATE USERS *
 ***************************/
const getCandidates = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        // Find candidates
        const candidates = await user_model_1.User.find({ role: "candidate" })
            .skip(skip)
            .limit(limit)
            .select("-password -refresh_token"); // exclude sensitive fields
        // Count total candidates
        const total = await user_model_1.User.countDocuments({ role: "candidate" });
        res.status(200).json({
            success: true,
            message: "Candidates retrieved successfully",
            data: candidates,
            meta: {
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
            },
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: "Error retrieving candidates",
            error: error.message,
        });
    }
};
exports.getCandidates = getCandidates;
/****************************
 * GET ALL RECRUITER USERS *
 ****************************/
const getRecruitersWithAccounts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        // Find recruiters
        const recruiters = await user_model_1.User.find({ role: "recruiter" })
            .skip(skip)
            .limit(limit)
            .select("-password -refresh_token") // hide sensitive fields
            .lean(); // return plain JS objects (faster)
        // Get all recruiter IDs
        const recruiterIds = recruiters.map((r) => r._id);
        // Find recruiter accounts linked to those users
        const recruiterAccounts = await recruiterAccount_model_1.RecruiterAccount.find({
            userId: { $in: recruiterIds },
        }).lean();
        // Merge recruiter + recruiterAccount by userId
        const recruitersWithAccounts = recruiters.map((recruiter) => {
            const account = recruiterAccounts.find((acc) => acc.userId.toString() === recruiter._id.toString());
            return {
                ...recruiter,
                recruiterAccount: account || null,
            };
        });
        // Count total recruiters
        const total = await user_model_1.User.countDocuments({ role: "recruiter" });
        res.status(200).json({
            success: true,
            message: "Recruiters with accounts retrieved successfully",
            data: recruitersWithAccounts,
            meta: {
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
            },
        });
    }
    catch (error) {
        res.status(500).json({
            // recruiter.controller.ts
            success: false,
            message: "Error retrieving recruiters",
            error: error.message,
        });
    }
};
exports.getRecruitersWithAccounts = getRecruitersWithAccounts;
/*************************
 * GET ALL COMPANY USERS *
 *************************/
const getCompaniesWithAccounts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        // Find users with role = company
        const companies = await user_model_1.User.find({ role: "company" })
            .skip(skip)
            .limit(limit)
            .select("-password -refresh_token")
            .lean();
        // Collect company user IDs
        const companyUserIds = companies.map((c) => c._id);
        // Fetch company profiles linked to those users
        const companyProfiles = await company_model_1.Company.find({
            userId: { $in: companyUserIds },
        }).lean();
        // Merge user + company profile
        const companiesWithAccounts = companies.map((companyUser) => {
            const profile = companyProfiles.find((p) => p.userId?.toString() === companyUser._id.toString());
            return {
                ...companyUser,
                companyProfile: profile || null,
            };
        });
        // Count total
        const total = await user_model_1.User.countDocuments({ role: "company" });
        res.status(200).json({
            success: true,
            message: "Companies with accounts retrieved successfully",
            data: companiesWithAccounts,
            meta: {
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
            },
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: "Error retrieving companies",
            error: error.message,
        });
    }
};
exports.getCompaniesWithAccounts = getCompaniesWithAccounts;
// fetch all user without admin
exports.fetchAllUsers = (0, catchAsync_1.default)(async (req, res) => {
    const users = await user_model_1.User.find({ role: { $ne: "admin" } }).select("name avatar address phoneNum role");
    // Enrich users with photo depending on role
    const enrichedUsers = await Promise.all(users.map(async (user) => {
        let photoUrl = null;
        let name1 = null;
        let position = null;
        if (user.role === "candidate") {
            const resume = await createResume_model_1.CreateResume.findOne({ userId: user._id }).select("photo");
            if (!resume)
                return null;
            const experience = await experience_model_1.Experience.findOne({ userId: user._id })
                .sort({ createdAt: -1 })
                .select("position");
            position = experience?.position || null;
            photoUrl = resume?.photo || null;
        }
        else if (user.role === "recruiter") {
            const recruiter = await recruiterAccount_model_1.RecruiterAccount.findOne({
                userId: user._id,
            }).select("photo");
            if (!recruiter)
                return null;
            photoUrl = recruiter?.photo || null;
        }
        else if (user.role === "company") {
            const company = await company_model_1.Company.findOne({ userId: user._id }).select("clogo cname");
            if (!company)
                return null;
            photoUrl = company?.clogo || null;
            name1 = company?.cname;
        }
        // safely assign to avatar.url
        return {
            ...user.toObject(),
            name: name1 ? name1 : user.name,
            avatar: {
                ...user.avatar,
                url: photoUrl || user.avatar?.url || null,
            },
            position: position,
        };
    }));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "All users fetched successfully",
        data: enrichedUsers,
    });
});
