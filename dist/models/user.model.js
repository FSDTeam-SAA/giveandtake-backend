"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const userSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phoneNum: { type: String },
    password: { type: String, select: 0, required: true },
    role: {
        type: String,
        enum: ['candidate', 'recruiter', 'company', 'admin'],
        default: 'candidate',
    },
    avatar: {
        url: { type: String, default: '' },
    },
    address: {
        type: String,
    },
    securityQuestions: [
        {
            question: { type: String, default: '' },
            answer: { type: String, default: '' },
        },
    ],
    dateOfbirth: { type: Date },
    verificationInfo: {
        verified: { type: Boolean, default: false },
        token: { type: String, default: '' },
        resetToken: { type: String, default: '' },
    },
    password_reset_token: { type: String, default: '' },
    deactivate: { type: Boolean, default: false },
    dateOfdeactivate: { type: Date },
    refresh_token: { type: String },
}, { timestamps: true });
// Pre save middleware / hook : will work on create() save()
userSchema.pre('save', async function (next) {
    const user = this;
    // Hash password
    if (user.isModified('password')) {
        const saltRounds = Number(process.env.bcrypt_salt_round) || 10;
        let pass = user.password;
        user.password = await bcrypt_1.default.hash(pass, saltRounds);
    }
    next();
});
userSchema.statics.isUserExistsByEmail = async function (email) {
    return await exports.User.findOne({ email }).select('+password +secureFolderPin');
};
userSchema.statics.isOTPVerified = async function (id) {
    const user = await exports.User.findById(id).select('+verificationInfo');
    return user?.verificationInfo.verified;
};
userSchema.statics.isPasswordMatched = async function (plainTextPassword, hashPassword) {
    return await bcrypt_1.default.compare(plainTextPassword, hashPassword);
};
exports.User = mongoose_1.default.model('User', userSchema);
