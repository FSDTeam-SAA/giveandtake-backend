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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecruiterAccount = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const recruiterAccountSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    type: {
        type: String,
        enum: ['candidat', 'reqruter', 'admin'],
        required: true,
    },
    videoFile: { type: String },
    bio: { type: String },
    photo: { type: String },
    title: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    sureName: { type: String },
    country: { type: String },
    city: { type: String },
    zipCode: { type: String },
    emailAddress: { type: String },
    phoneNumber: { type: String },
    location: { type: String },
    upworkUrl: { type: String },
    linkedIn: { type: String },
    xLink: { type: String },
    OtherLink: { type: String },
    companyId: { type: String },
    roleAtCompany: { type: String },
    awardTitle: { type: String },
    programName: { type: String },
    programDate: { type: String },
    awardDescription: { type: String },
    // companyWebsite: { type: String },
    // companyLogo: { type: String },
    // companyCountry: { type: String },
    // companyCity: { type: String },
    // careerField: { type: String },
    // careerSubField: { type: String },
    // summary: { type: String },
}, { timestamps: true });
exports.RecruiterAccount = mongoose_1.default.model('RecruiterAccount', recruiterAccountSchema);
