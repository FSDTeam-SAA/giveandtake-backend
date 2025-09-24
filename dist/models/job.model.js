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
exports.Job = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const jobSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    companyId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Company' },
    recruiterId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'RecruiterAccount' },
    title: { type: String, required: true },
    description: { type: String, required: true },
    companyName: { type: String },
    salaryRange: { type: String },
    location: { type: String },
    shift: { type: String },
    responsibilities: [{ type: String }],
    educationExperience: [{ type: String }],
    benefits: [{ type: String }],
    vacancy: { type: Number, default: 1 },
    experience: { type: Number },
    deadline: { type: Date },
    status: {
        type: String,
        enum: ['pending', 'active', 'deactivate'],
        default: 'active',
    },
    jobCategoryId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'JobCategory' },
    name: {
        type: String
    },
    role: {
        type: String
    },
    compensation: { type: String },
    arcrivedJob: { type: Boolean, default: false },
    applicationRequirement: [
        {
            requirement: { type: String },
            status: { type: String }
        },
    ],
    customQuestion: [
        {
            question: { type: String },
        },
    ],
    jobApprove: {
        type: String,
        enm: ['pending', 'approved', 'denied'],
        default: 'approved',
    },
    adminApprove: {
        type: Boolean,
        default: false,
    },
    publishDate: { type: Date },
    employement_Type: {
        type: String,
        enum: [
            'full-time',
            'part-time',
            'internship',
            'contract',
            'temporary',
            'freelance',
            'volunteer',
        ],
    },
    location_Type: {
        type: String,
        enum: ['onsite', 'remote', 'hybrid'],
    },
    career_Stage: {
        type: String,
        enum: ['New Entry', 'Experienced Professional', 'Career Returner'],
    },
    website_Url: { type: String },
}, { timestamps: true });
jobSchema.index({ title: 'text', location: 'text', description: 'text' });
exports.Job = mongoose_1.default.model('Job', jobSchema);
