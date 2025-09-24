"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const sendEmail = async (to, subject, html) => {
    try {
        const transporter = nodemailer_1.default.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.APP_USER || 'tahsin.bdcalling@gmail.com',
                pass: process.env.APP_PASS || 'lcnt cxiw pcui vikv',
            },
        });
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || 'nm.bdcalling@gmail.com',
            to,
            subject: subject || 'No subject',
            html,
        });
    }
    catch (error) {
        console.error('Error sending email:', error);
        throw new AppError_1.default(500, 'Failed to send email');
    }
};
exports.sendEmail = sendEmail;
