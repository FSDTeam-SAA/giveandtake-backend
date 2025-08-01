"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRicruiter = exports.isAdmin = exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const user_model_1 = require("../models/user.model");
const protect = async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Token not found");
    try {
        const decoded = await jsonwebtoken_1.default.verify(token, process.env.JWT_ACCESS_SECRET);
        // console.log(decoded)
        const user = await user_model_1.User.findById(decoded._id);
        if (user && await user_model_1.User.isOTPVerified(user._id.toString())) {
            req.user = user;
        }
        next();
    }
    catch (err) {
        throw new AppError_1.default(401, "Invalid token");
    }
};
exports.protect = protect;
const isAdmin = (req, res, next) => {
    if (req.user?.role !== "admin") {
        throw new AppError_1.default(403, "Access denied. You are not an admin.");
    }
    next();
};
exports.isAdmin = isAdmin;
const isRicruiter = (req, res, next) => {
    if (req.user?.role !== 'ricruiter') {
        throw new AppError_1.default(403, 'Access denied. You are not an ricruiter.');
    }
    next();
};
exports.isRicruiter = isRicruiter;
