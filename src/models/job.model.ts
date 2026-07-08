import mongoose, { Schema } from "mongoose";
import { IJob, JobModel } from "../interface/job.interface";

const jobSchema: Schema<IJob> = new Schema<IJob>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
    recruiterId: { type: mongoose.Schema.Types.ObjectId, ref: "RecruiterAccount" },
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
    counter: { type: Number, default: 0 },
    embedding: {
      type: [Number],
      default: [],
    },
    experience: { type: String },
    deadline: { type: Date },
    status: {
      type: String,
      enum: ["pending", "active", "deactivate"],
      default: "active",
    },
    jobCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "JobCategory" },
    name: { type: String },
    role: { type: String },
    compensation: { type: String },
    arcrivedJob: { type: Boolean, default: false },
    applicationRequirement: [
      {
        requirement: { type: String },
        status: { type: String },
      },
    ],
    customQuestion: [
      {
        question: { type: String },
      },
    ],
    jobApprove: {
      type: String,
      enum: ["pending", "approved", "denied"],
      default: "approved",
    },
    adminApprove: {
      type: Boolean,
      default: false,
    },
    publishDate: { type: Date },
    employement_Type: {
      type: String,
      enum: [
        "full-time",
        "part-time",
        "internship",
        "contract",
        "temporary",
        "freelance",
        "volunteer",
      ],
    },
    location_Type: {
      type: String,
      enum: ["onsite", "remote", "hybrid"],
    },
    career_Stage: {
      type: String,
      enum: ["New Entry", "Experienced Professional", "Career Returner"],
    },
    website_Url: { type: String },
    expiryDate: { type: Date },
    billingPlanType: {
      type: String,
      enum: ['payg', 'subscription', 'free'],
      default: 'free',
    },
    billingPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentInfo",
    },
    paygStartedAt: { type: Date },
    paygExpiresAt: { type: Date },
    deactivatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/**
 * 🔍 Full-Text Search Index
 * - Includes title, description, location, and location_Type
 * - Assigns higher weight to title and description
 * - Enables ranking by relevance when using `$text` search
 */
jobSchema.index(
  {
    title: "text",
    description: "text",
    location: "text",
    location_Type: "text",
    employement_Type: "text", // ← added
  },
  {
    weights: {
      title: 5,
      description: 3,
      location: 2,
      location_Type: 2,
      employement_Type: 3, // ← weight for employment type
    },
    name: "JobTextIndex",
  }
);

export const Job = mongoose.model<IJob, JobModel>("Job", jobSchema);
