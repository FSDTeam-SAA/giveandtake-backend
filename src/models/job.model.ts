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
    expiryReminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/**
 * 🔍 Full-Text Search Index
 * - Covers title, company name, responsibilities (skills), description, location
 * - location_Type / employement_Type are enums handled by structured filters,
 *   so they stay out of the text index
 * - NOTE: changing these fields requires dropping the old index first
 *   (MongoDB allows one text index per collection) — run `npm run sync-indexes`
 */
jobSchema.index(
  {
    title: "text",
    companyName: "text",
    responsibilities: "text",
    description: "text",
    location: "text",
  },
  {
    weights: {
      title: 10,
      companyName: 6,
      responsibilities: 5,
      description: 3,
      location: 2,
    },
    name: "JobTextIndex",
  }
);

// Structured filter indexes for faceted search
jobSchema.index({ jobCategoryId: 1 }, { name: "job_category_idx" });
jobSchema.index({ employement_Type: 1 }, { name: "job_employment_type_idx" });
jobSchema.index({ location_Type: 1 }, { name: "job_location_type_idx" });
jobSchema.index(
  { arcrivedJob: 1, adminApprove: 1, jobApprove: 1, createdAt: -1 },
  { name: "job_browse_idx" }
);

export const Job = mongoose.model<IJob, JobModel>("Job", jobSchema);
