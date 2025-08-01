"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivateUser = exports.securityResetPassword = exports.verifySecurityAnswers = exports.submitSecurityAnswers = exports.getDefaultSecurityQuestions = exports.setSecurityQuestions = exports.changePassword = exports.resetPassword = exports.forgetPassword = exports.verifyEmail = exports.login = exports.register = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const generateOTP_1 = require("../utils/generateOTP");
const authToken_1 = require("../utils/authToken");
const sendEmail_1 = require("../utils/sendEmail");
const user_model_1 = require("../models/user.model");
const sendResponse_1 = __importDefault(require("../utils/sendResponse"));
const defaultSecurityQuestions_1 = require("../constants/defaultSecurityQuestions");
exports.register = (0, catchAsync_1.default)(async (req, res) => {
    const { name, email, password, address, phoneNum, role } = req.body;
    if (!name || !email || !password) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Please fill in all fields');
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
    });
    await (0, sendEmail_1.sendEmail)(user.email, 'Registerd Account', `Your OTP is ${otp}`);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'User Logged in successfully',
        data: user,
    });
});
exports.login = (0, catchAsync_1.default)(async (req, res) => {
    const { email, password } = req.body;
    const user = await user_model_1.User.isUserExistsByEmail(email);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    }
    // console.log(await User.isPasswordMatched(password.toString(), user.password))
    if (user?.password &&
        !(await user_model_1.User.isPasswordMatched(password, user.password))) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Password is not correct');
    }
    if (!(await user_model_1.User.isOTPVerified(user._id.toString()))) {
        const otp = (0, generateOTP_1.generateOTP)();
        const jwtPayloadOTP = {
            otp: otp,
        };
        const otptoken = (0, authToken_1.createToken)(jwtPayloadOTP, process.env.OTP_SECRET, process.env.OTP_EXPIRE);
        user.verificationInfo.token = otptoken;
        await user.save();
        await (0, sendEmail_1.sendEmail)(user.email, 'Registerd Account', `Your OTP is ${otp}`);
        return (0, sendResponse_1.default)(res, {
            statusCode: http_status_1.default.FORBIDDEN,
            success: false,
            message: 'OTP is not verified, please verify your OTP',
            data: { email: user.email },
        });
    }
    const jwtPayload = {
        _id: user._id,
        email: user.email,
        role: user.role,
    };
    const accessToken = (0, authToken_1.createToken)(jwtPayload, process.env.JWT_ACCESS_SECRET, process.env.JWT_ACCESS_EXPIRES_IN);
    let _user = await user.save();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'User Logged in successfully',
        data: {
            accessToken,
            role: user.role,
            _id: user._id,
        },
    });
});
exports.verifyEmail = (0, catchAsync_1.default)(async (req, res) => {
    const { email, otp } = req.body;
    const user = await user_model_1.User.isUserExistsByEmail(email);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    }
    if (user.verificationInfo.verified) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'User already verified');
    }
    if (otp) {
        const savedOTP = (0, authToken_1.verifyToken)(user.verificationInfo.token, process.env.OTP_SECRET || '');
        console.log(savedOTP);
        if (otp === savedOTP.otp) {
            user.verificationInfo.verified = true;
            user.verificationInfo.token = '';
            await user.save();
            (0, sendResponse_1.default)(res, {
                statusCode: http_status_1.default.OK,
                success: true,
                message: 'User verified',
                data: '',
            });
        }
        else {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid OTP');
        }
    }
    else {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'OTP is required');
    }
});
exports.forgetPassword = (0, catchAsync_1.default)(async (req, res) => {
    const { email } = req.body;
    const user = await user_model_1.User.isUserExistsByEmail(email);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    }
    const otp = (0, generateOTP_1.generateOTP)();
    const jwtPayloadOTP = {
        otp: otp,
    };
    const otptoken = (0, authToken_1.createToken)(jwtPayloadOTP, process.env.OTP_SECRET, process.env.OTP_EXPIRE);
    user.password_reset_token = otptoken;
    await user.save();
    /////// TODO: SENT EMAIL MUST BE DONE
    (0, sendEmail_1.sendEmail)(user.email, 'Reset Password', `Your OTP is ${otp}`);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'OTP sent to your email',
        data: '',
    });
});
exports.resetPassword = (0, catchAsync_1.default)(async (req, res) => {
    const { password, otp, email } = req.body;
    const user = await user_model_1.User.isUserExistsByEmail(email);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    }
    if (!user.password_reset_token) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Password reset token is invalid');
    }
    const verify = (await (0, authToken_1.verifyToken)(user.password_reset_token, process.env.OTP_SECRET));
    if (verify.otp !== otp) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid OTP');
    }
    user.password = password;
    await user.save();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Password reset successfully',
        data: {},
    });
});
exports.changePassword = (0, catchAsync_1.default)(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Old password and new password are required');
    }
    if (oldPassword === newPassword) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Old password and new password cannot be same');
    }
    const user = await user_model_1.User.findById({ _id: req.user?._id });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    }
    user.password = newPassword;
    await user.save();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Password changed',
        data: '',
    });
});
/**************************************
 * Set SECURITY QUESTIONS AND ANSWERS *
 **************************************/
exports.setSecurityQuestions = (0, catchAsync_1.default)(async (req, res) => {
    const { email, securityQuestions } = req.body;
    if (!email || typeof email !== 'string') {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Email is required and must be a string');
    }
    if (!Array.isArray(securityQuestions) ||
        securityQuestions.some((q) => !q.question ||
            typeof q.question !== 'string' ||
            !q.answer ||
            typeof q.answer !== 'string')) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid security questions format');
    }
    const user = await user_model_1.User.findOne({ email });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    }
    await user.save();
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Security questions saved successfully',
    });
});
/**********************************
 * GET DEFAULT SECURITY QUESTIONS *
 **********************************/
exports.getDefaultSecurityQuestions = (0, catchAsync_1.default)(async (_req, res) => {
    res.status(200).json({
        success: true,
        message: 'Default security questions fetched successfully',
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
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid input');
    }
    const user = await user_model_1.User.findOne({ email });
    // console.log("first", user)
    if (!user)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    // Overwrite existing questions
    user.securityQuestions = securityQuestions;
    await user.save();
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Security questions saved',
    });
});
/***************************
 * VERIFY SECURITY ANSWERS *
 ***************************/
exports.verifySecurityAnswers = (0, catchAsync_1.default)(async (req, res) => {
    const { email, answers } = req.body;
    if (!email || !Array.isArray(answers)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid input');
    }
    const user = await user_model_1.User.findOne({ email }).select('securityQuestions');
    if (user?.securityQuestions?.length !== answers.length) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Number of answers does not match the number of security questions');
    }
    if (!user || user.securityQuestions.length <= 0) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Security questions not found');
    }
    const matched = user.securityQuestions?.every((q, i) => {
        return q.answer.trim().toLowerCase() === answers[i]?.trim().toLowerCase();
    });
    if (!matched) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Security answers do not match');
    }
    const resetToken = (0, authToken_1.createToken)({ email }, process.env.JWT_ACCESS_SECRET, process.env.JWT_ACCESS_EXPIRES_IN);
    user.verificationInfo.resetToken = resetToken;
    await user.save();
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Answers verified. You can now reset your password.',
        data: { resetToken },
    });
});
/**********************************************
 * RESET PASSWORD USING THE SECURITY PASSWORD *
 **********************************************/
exports.securityResetPassword = (0, catchAsync_1.default)(async (req, res) => {
    const { token } = req.query;
    const { newPassword } = req.body;
    if (!token || typeof token !== 'string') {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Reset token is required');
    }
    if (!newPassword || typeof newPassword !== 'string') {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'New password is required');
    }
    const user = await user_model_1.User.findOne({
        'verificationInfo.resetToken': token,
    }).select('+password');
    if (!user) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired reset token');
    }
    // Set new password (bcrypt will hash in pre-save hook)
    user.password = newPassword;
    user.verificationInfo.resetToken = ''; // clear token
    await user.save();
    res.status(http_status_1.default.OK).json({
        success: true,
        message: 'Password has been reset successfully',
    });
});
/***************************
 * DEACTIVATE USER ACCOUNT *
 ***************************/
exports.deactivateUser = (0, catchAsync_1.default)(async (req, res) => {
    const userId = req.user?._id;
    const user = await user_model_1.User.findById(userId);
    if (!user)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    user.deactivate = true;
    user.dateOfdeactivate = new Date();
    await user.save();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Account deactivated. Your data will be deleted in 30 days.',
        data: null,
    });
});
