"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const sendEmail = async (to, subject, html) => {
    console.log("transporter");
    const transporter = nodemailer_1.default.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: 'tahsin.bdcalling@gmail.com',
            pass: 'lcnt cxiw pcui vikv',
        },
    });
    await transporter.sendMail({
        from: 'nm.bdcalling@gmail.com', // sender address
        to,
        subject: subject ? subject : 'Password change Link : change it by 10 minutes',
        html,
    });
};
exports.sendEmail = sendEmail;
