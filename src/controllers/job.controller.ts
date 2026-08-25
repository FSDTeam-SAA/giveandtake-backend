import { Request, Response } from "express";
import catchAsync from "../utils/catchAsync";
import httpStatus from "http-status";
import AppError from "../errors/AppError";
import { Job } from "../models/job.model";
import { getPaginationParams, buildMetaPagination } from "../utils/pagination";
import sendResponse from "../utils/sendResponse";
import { CreateResume } from "../models/createResume.model";
import {
  assertJobPostingAllowance,
  evaluateJobPostingAllowance,
} from "../helper/canPostJob";
import { User } from "../models/user.model";
import { RecruiterAccount } from "../models/recruiterAccount.model";
import { Company } from "../models/company.model";
import { io } from "../server";
import { createNotification } from "../sockets/notification.service";
import mongoose from "mongoose";
import { Notification } from "../models/notification.model";
import { Following } from "../models/following.model";
import { compileFunction } from "vm";
import { paymentInfo } from "../models/paymentInfo.model";
import {
  applyJobEmbeddingToDoc,
  areEmbeddingsEnabled,
  cosineSimilarity as embeddingCosineSimilarity,
  generateJobEmbeddingVector,
  generateProfileEmbeddingVector,
} from "../services/embedding.service";
import { jobFitService } from "../services/jobFit.service";
import { isPaymentExpired, resolvePaymentExpiry } from "../utils/subscription";
import { capQuery, escapeRegex, wordStartRegex } from "../utils/regex";
import { SkillModel } from "../models/skill.model";
import { JobCategory } from "../models/jobCategory.model";
import {
  jobNotificationEmailTemplate,
  sendEmail,
} from "../utils/sendEmail";

const logEmbeddingWarning = (context: string, error: unknown) => {
  console.warn(
    `[job-embedding] ${context}:`,
    (error as Error)?.message ?? error
  );
};

const attachEmbeddingBeforeSave = async (jobDoc: any) => {
  try {
    await applyJobEmbeddingToDoc(jobDoc);
  } catch (error) {
    logEmbeddingWarning("attach-before-save", error);
  }
};

const refreshEmbeddingAfterDirectUpdate = async (jobDoc: any) => {
  if (!jobDoc) return;
  try {
    const changed = await applyJobEmbeddingToDoc(jobDoc);
    if (changed) {
      await Job.updateOne({ _id: jobDoc._id }, { embedding: jobDoc.embedding });
    }
  } catch (error) {
    logEmbeddingWarning("refresh-after-update", error);
  }
};

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
const PAYG_DURATION_DAYS = 30;
const PAYG_EDIT_ERROR =
  "Your PAYG payment has expired, please subscribe or purchase a new PAYG voucher.";
const PAYG_WINDOW_ERROR =
  "Pay As You Go adverts cannot run beyond 30 days from the original publication date.";

const computePaygExpiryDate = (start?: Date | null) =>
  start
    ? new Date(start.getTime() + PAYG_DURATION_DAYS * MILLIS_PER_DAY)
    : null;

const ensurePaygWindowMetadata = (job: any) => {
  if (job.billingPlanType !== "payg") return;
  if (!job.paygStartedAt) {
    const baseline = job.publishDate ?? job.createdAt ?? new Date();
    job.paygStartedAt = baseline;
  }
  if (!job.paygExpiresAt && job.paygStartedAt) {
    job.paygExpiresAt = computePaygExpiryDate(
      job.paygStartedAt instanceof Date
        ? job.paygStartedAt
        : new Date(job.paygStartedAt)
    );
  }
};

const sendPaygExpiryNotification = async (job: any) => {
  const ownerId = (
    job.userId && job.userId._id ? job.userId._id : job.userId
  ) as mongoose.Types.ObjectId | undefined;
  if (!ownerId) return;
  try {
    await createNotification({
      to: ownerId,
      message: PAYG_EDIT_ERROR,
      type: "payg_expired",
      id: job._id as mongoose.Types.ObjectId,
    });
  } catch (error) {
    console.warn("Failed to dispatch PAYG expiry notification:", error);
  }
};

const enforcePaygEditRestriction = async (job: any) => {
  if (job.billingPlanType !== "payg") return;
  ensurePaygWindowMetadata(job);
  const expiry = job.paygExpiresAt
    ? new Date(job.paygExpiresAt)
    : computePaygExpiryDate(
        job.paygStartedAt ?? job.publishDate ?? job.createdAt
      );

  if (expiry && new Date() > expiry) {
    await sendPaygExpiryNotification(job);
    throw new AppError(httpStatus.FORBIDDEN, PAYG_EDIT_ERROR);
  }
};

const enforcePaygDateBounds = (
  job: any,
  nextPublishDate?: Date,
  nextDeadline?: Date
) => {
  if (job.billingPlanType !== "payg") return;
  ensurePaygWindowMetadata(job);
  const expiry =
    job.paygExpiresAt ||
    computePaygExpiryDate(
      job.paygStartedAt ?? job.publishDate ?? job.createdAt
    );
  if (!expiry) return;
  const expiryDate = new Date(expiry);

  if (nextPublishDate && nextPublishDate > expiryDate) {
    throw new AppError(httpStatus.FORBIDDEN, PAYG_WINDOW_ERROR);
  }
  if (nextDeadline && nextDeadline > expiryDate) {
    throw new AppError(httpStatus.FORBIDDEN, PAYG_WINDOW_ERROR);
  }
};

const determineJobBillingContext = async (
  userId: mongoose.Types.ObjectId,
  publishDate?: Date
) => {
  const latestPayment = await paymentInfo
    .findOne({
      userId,
      paymentStatus: "complete",
      planStatus: "active",
    })
    .sort({ updatedAt: -1 })
    .populate("planId", "valid");

  if (!latestPayment) {
    return {
      billingPlanType: "free",
      billingPlanId: undefined,
      paygStartedAt: undefined,
      paygExpiresAt: undefined,
    };
  }

  const plan: any = latestPayment.planId;
  const now = new Date();
  const expiryDate = resolvePaymentExpiry(latestPayment);
  let shouldSave = false;
  const expired = isPaymentExpired(latestPayment, now);

  if (
    expiryDate &&
    (!latestPayment.expiresAt ||
      latestPayment.expiresAt.getTime() !== expiryDate.getTime())
  ) {
    latestPayment.expiresAt = expiryDate;
    shouldSave = true;
  }

  if (expired) {
    latestPayment.planStatus = "deactivate";
    shouldSave = true;
  }

  if (shouldSave) {
    await latestPayment.save();
  }

  if (expired) {
    return {
      billingPlanType: "free",
      billingPlanId: undefined,
      paygStartedAt: undefined,
      paygExpiresAt: undefined,
    };
  }

  if (plan?.valid === "PayAsYouGo") {
    const startDate = publishDate ?? new Date();
    return {
      billingPlanType: "payg",
      billingPlanId: latestPayment._id,
      paygStartedAt: startDate,
      paygExpiresAt: computePaygExpiryDate(startDate),
    };
  }

  return {
    billingPlanType: "subscription",
    billingPlanId: latestPayment._id,
    paygStartedAt: undefined,
    paygExpiresAt: undefined,
  };
};

const coerceDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

type DocumentWithTimestamps = {
  createdAt?: unknown;
  get?: (path: string, type?: unknown) => unknown;
};

const getDocumentCreatedAt = (
  doc: DocumentWithTimestamps | null | undefined
): Date | undefined => {
  if (!doc) return undefined;
  const raw =
    doc.createdAt ??
    (typeof doc.get === "function" ? doc.get("createdAt") : undefined);
  return coerceDate(raw);
};

type ExpiryInputs = {
  expirationDate?: unknown;
  expiryDate?: unknown;
  expiaryDate?: unknown; // tolerate misspelling from clients
  deadline?: unknown;
};

const deriveExpiryDate = (
  publishDate: Date | undefined,
  opts: ExpiryInputs
): Date | undefined => {
  const fromExplicit =
    coerceDate((opts as any)?.expiryDate ?? (opts as any)?.expiaryDate) ??
    coerceDate(opts.deadline); // legacy payload support

  if (fromExplicit) return fromExplicit;

  const daysRaw = opts.expirationDate;
  if (daysRaw !== undefined && daysRaw !== null && daysRaw !== "") {
    const days = Number(daysRaw);
    if (!Number.isNaN(days) && days > 0) {
      const base = publishDate ?? new Date();
      const copy = new Date(base);
      copy.setDate(copy.getDate() + days);
      return copy;
    }
  }
  return undefined;
};

/*******************
 * // CREATE A JOB *
 *******************/
export const createJob = catchAsync(async (req: Request, res: Response) => {
  const {
    userId,
    title,
    description,
    companyName,
    salaryRange,
    location,
    shift,
    responsibilities,
    educationExperience,
    benefits,
    vacancy,
    experience,
    deadline,
    status,
    jobCategoryId,
    compensation,
    arcrivedJob,
    applicationRequirement,
    customQuestion,
    employement_Type,
    website_Url,
    publishDate,
    career_Stage,
    location_Type,
    name,
    role,
    expirationDate,
    expiryDate,
  } = req.body;
  const publishDateValue = coerceDate(publishDate);

  if (!userId || !title || !description) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Please fill in all required fields"
    );
  }

  // CHECK THE USER
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  // ROLE BASE APPROVE LOGIC
  let jobApprove: "pending" | "approved" | "denied" = "pending";
  let companyId;
  let recruiterId;

  if (user.role === "company") {
    jobApprove = "pending";
    const a = await Company.findOne({ userId: userId });
    if (a) {
      companyId = a._id;
    }
  } else if (user.role === "recruiter") {
    jobApprove = "pending";
    const a = await RecruiterAccount.findOne({ userId: userId });
    if (a) {
      if (a.companyId) {
        companyId = a.companyId;
      } else {
        recruiterId = a._id;
      }
    }
  } else {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not authorized to create a job"
    );
  }

  await assertJobPostingAllowance(new mongoose.Types.ObjectId(userId));

  const billingContext = await determineJobBillingContext(
    new mongoose.Types.ObjectId(userId),
    publishDateValue ?? new Date()
  );

  const derivedExpiryDate = deriveExpiryDate(publishDateValue ?? new Date(), {
    expirationDate,
    expiryDate,
    expiaryDate: (req.body as any)?.expiaryDate,
    deadline,
  });

  const job = new Job({
    userId,
    companyId,
    recruiterId,
    title,
    description,
    companyName,
    salaryRange,
    location,
    shift,
    responsibilities,
    educationExperience,
    benefits,
    vacancy,
    experience,
    status: status ?? "active",
    jobCategoryId,
    compensation,
    arcrivedJob,
    applicationRequirement,
    customQuestion,
    jobApprove,
    adminApprove: false,
    employement_Type,
    website_Url,
    publishDate: publishDateValue ?? publishDate ?? undefined,
    location_Type,
    career_Stage,
    name,
    role,
    deadline: derivedExpiryDate ?? coerceDate(deadline) ?? undefined,
    expiryDate: derivedExpiryDate ?? coerceDate(deadline) ?? undefined,
    billingPlanType: billingContext.billingPlanType,
    billingPlanId: billingContext.billingPlanId,
    paygStartedAt: billingContext.paygStartedAt,
    paygExpiresAt: billingContext.paygExpiresAt,
  });

  await attachEmbeddingBeforeSave(job);
  await job.save();
  const refreshedPostingAllowance = await evaluateJobPostingAllowance(
    new mongoose.Types.ObjectId(userId),
    { suppressErrors: true }
  );

  // 🔹 Find followers
  let followers: any[] = [];
  if (companyId) {
    followers = await Following.find({ companyId }).populate(
      "userId",
      "name email"
    );
  } else if (recruiterId) {
    followers = await Following.find({ recruiterId }).populate(
      "userId",
      "name email"
    );
  }

  if (followers.length > 0) {
    const notifications = followers.map((f) => ({
      to: f.userId?._id ?? f.userId,
      message: `New job posted: ${title}`,
      id: job._id,
      type: "job_post",
    }));

    const saved = await Notification.insertMany(notifications);

    // 🔹 Emit via socket
    saved.forEach(async (n) => {
      const count = await Notification.countDocuments({
        to: n.to,
        isViewed: false,
      });
      io.to(n.to.toString()).emit("newNotification", {
        n,
        compileFunction,
      });
    });

    await Promise.all(
      followers.map(async (f) => {
        const follower = f.userId as any;
        if (!follower?.email) return;

        await sendEmail(
          follower.email,
          "New job posted",
          jobNotificationEmailTemplate({
            recipientName: follower.name,
            heading: "New job posted",
            message: `New job posted: ${title}`,
            jobTitle: title,
          })
        );
      })
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Job created successfully",
    data: { job, postingUsage: refreshedPostingAllowance },
  });
});

export const getJobPostingUsage = catchAsync(
  async (req: Request, res: Response) => {
    const requesterId = req.user?._id;
    const providedUserId =
      typeof req.query.userId === "string" && req.query.userId.trim()
        ? req.query.userId.trim()
        : undefined;

    const targetUserId =
      providedUserId ?? (requesterId ? requesterId.toString() : null);

    if (!targetUserId) {
      throw new AppError(httpStatus.BAD_REQUEST, "userId is required");
    }

    const isAdmin =
      req.user?.role === "admin" || req.user?.role === "super-admin";

    if (
      providedUserId &&
      requesterId?.toString() !== providedUserId &&
      !isAdmin
    ) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "Only admins can view job posting usage for other users."
      );
    }

    const usage = await evaluateJobPostingAllowance(
      new mongoose.Types.ObjectId(targetUserId),
      { suppressErrors: true }
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Job posting usage fetched successfully",
      data: usage,
    });
  }
);

export const editJob = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Require userId in body to authorize edit
  const { userId } = req.body || {};
  if (!userId) {
    throw new AppError(httpStatus.BAD_REQUEST, "userId is required");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const job = await Job.findById(id);
  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  }

  // ---- Permission checks (company & recruiter) ----
  let canEdit = false;

  if (user.role === "company") {
    const company = await Company.findOne({ userId });
    if (
      company &&
      job.companyId?.toString() ===
        (company._id as mongoose.Types.ObjectId).toString()
    ) {
      canEdit = true;
    }
  } else if (user.role === "recruiter") {
    const recruiter = await RecruiterAccount.findOne({ userId });
    if (recruiter) {
      // own job
      if (job.userId?.toString() === userId.toString()) canEdit = true;
      // same recruiter
      if (
        job.recruiterId &&
        recruiter._id &&
        job.recruiterId.toString() ===
          (recruiter._id as mongoose.Types.ObjectId).toString()
      )
        canEdit = true;
      // recruiter tied to same company
      if (
        recruiter.companyId &&
        job.companyId &&
        recruiter.companyId.toString() === job.companyId.toString()
      ) {
        canEdit = true;
      }
    }
  } else {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not authorized to edit a job"
    );
  }

  if (!canEdit) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You do not have permission to edit this job"
    );
  }

  ensurePaygWindowMetadata(job);
  const jobCreatedAt = getDocumentCreatedAt(job);
  const incomingPublishDate = coerceDate(req.body?.publishDate);
  const incomingDeadline = coerceDate(req.body?.deadline);
  const derivedEditExpiry = deriveExpiryDate(
    incomingPublishDate ?? job.publishDate ?? jobCreatedAt ?? new Date(),
    {
      expirationDate: req.body?.expirationDate,
      expiryDate: req.body?.expiryDate,
      expiaryDate: req.body?.expiaryDate,
      deadline: req.body?.deadline ?? job.deadline ?? job.expiryDate,
    }
  );

  await enforcePaygEditRestriction(job);
  enforcePaygDateBounds(
    job,
    incomingPublishDate,
    derivedEditExpiry ?? incomingDeadline
  );

  if (
    job.billingPlanType === "payg" &&
    incomingPublishDate &&
    job.publishDate &&
    incomingPublishDate.getTime() !== new Date(job.publishDate).getTime()
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "PAYG adverts cannot change their publish date."
    );
  }

  const safeBody: Record<string, unknown> = { ...req.body };
  if (incomingPublishDate) {
    safeBody.publishDate = incomingPublishDate;
  }
  if (incomingDeadline) {
    safeBody.deadline = incomingDeadline;
  }
  if (derivedEditExpiry) {
    safeBody.deadline = derivedEditExpiry;
    safeBody.expiryDate = derivedEditExpiry;
  } else if (incomingDeadline) {
    safeBody.expiryDate = incomingDeadline;
  }

  // ---- Whitelist of fields allowed to be updated ----
  const updatableFields: (keyof typeof job)[] = [
    "title",
    "description",
    "companyName",
    "salaryRange",
    "location",
    "shift",
    "responsibilities",
    "educationExperience",
    "benefits",
    "vacancy",
    "experience",
    "deadline",
    "status",
    "jobCategoryId",
    "compensation",
    "arcrivedJob",
    "applicationRequirement",
    "customQuestion",
    "employement_Type",
    "website_Url",
    "publishDate",
    "career_Stage",
    "location_Type",
    "name",
    "role",
    "expiryDate",
  ] as any;

  // Track some state to optionally notify followers on activation
  const prevStatus = job.status;
  const prevPublishDate = job.publishDate;
  const prevArchivedState = job.arcrivedJob;
  const prevDeadlineTime = job.deadline
    ? new Date(job.deadline).getTime()
    : undefined;

  // ---- Apply updates safely ----
  for (const field of updatableFields) {
    if (Object.prototype.hasOwnProperty.call(safeBody, field)) {
      // @ts-ignore
      job[field] = safeBody[field];
    }
  }

  if (
    job.deadline &&
    new Date(job.deadline).getTime() !== prevDeadlineTime
  ) {
    job.expiryReminderSentAt = null;
  }

  job.adminApprove = false;
  job.jobApprove = "pending";
  if (prevStatus !== "deactivate" && job.status === "deactivate") {
    job.deactivatedAt = new Date();
  } else if (
    prevStatus === "deactivate" &&
    job.status === "active" &&
    job.arcrivedJob === false
  ) {
    job.deactivatedAt = null;
  }

  if (!prevArchivedState && job.arcrivedJob) {
    job.deactivatedAt = job.deactivatedAt ?? new Date();
  } else if (prevArchivedState && !job.arcrivedJob && job.status === "active") {
    job.deactivatedAt = null;
  }

  ensurePaygWindowMetadata(job);

  // Keep authorship associations intact—do not allow swapping owners from edit
  // If you DO want to allow company/recruiter switching, handle explicitly here.

  await attachEmbeddingBeforeSave(job);
  await job.save();

  // ---- Optional: notify followers if the job just became active or newly published now ----
  const justActivated = prevStatus !== "active" && job.status === "active";

  const justPublishedNow =
    !!job.publishDate &&
    prevPublishDate?.toString() !== job.publishDate?.toString();

  if (justActivated || justPublishedNow) {
    let followers: any[] = [];
    if (job.companyId) {
      followers = await Following.find({ companyId: job.companyId }).populate(
        "userId",
        "name email"
      );
    } else if (job.recruiterId) {
      followers = await Following.find({ recruiterId: job.recruiterId }).populate(
        "userId",
        "name email"
      );
    }

    if (followers.length > 0) {
      const notifications = followers.map((f) => ({
        to: f.userId?._id ?? f.userId,
        message: `Updated job: ${job.title}`,
        id: job._id,
        type: "job_update",
      }));

      const saved = await Notification.insertMany(notifications);

      saved.forEach(async (n) => {
        const count = await Notification.countDocuments({
          to: n.to,
          isViewed: false,
        });
        // emit without leaking server internals
        io.to(n.to.toString()).emit("newNotification", {
          n,
          unseenCount: count,
        });
      });

      await Promise.all(
        followers.map(async (f) => {
          const follower = f.userId as any;
          if (!follower?.email) return;

          await sendEmail(
            follower.email,
            "Job updated",
            jobNotificationEmailTemplate({
              recipientName: follower.name,
              heading: "Job updated",
              message: `Updated job: ${job.title}`,
              jobTitle: job.title,
            })
          );
        })
      );
    }
  }

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Job updated successfully",
    data: job,
  });
});
/********************************************
 * GET ALL JOBS WITH FILTERS AND PAGINATION *
 ********************************************/
const EMPLOYMENT_SYNONYMS: Record<string, string[]> = {
  "full-time": ["full-time", "full time", "fulltime", "ft"],
  "part-time": ["part-time", "part time", "parttime", "partime", "pt"],
  internship: ["internship", "intern role", "intern"],
  contract: ["contract", "contractor", "contract-based"],
  temporary: ["temporary", "temp", "temp job", "temp role"],
  freelance: ["freelance", "freelancer", "free-lance"],
  volunteer: ["volunteer", "voluntary"],
};

// 🧠 Detect employment types from a free-text query
function detectEmploymentTypes(q: unknown): string[] {
  if (!q) return [];
  const text = Array.isArray(q)
    ? q.join(" ").toLowerCase()
    : String(q).toLowerCase();

  const matches = new Set<string>();
  for (const [canonical, variants] of Object.entries(EMPLOYMENT_SYNONYMS)) {
    for (const v of variants) {
      // hyphen/space tolerant (e.g., "full-time" ~ "full time" ~ "fulltime")
      const pattern = v.replace(/\s*-\s*/g, "[-\\s]?").replace(/\s+/g, "\\s*");
      const re = new RegExp(`\\b${pattern}\\b`, "i");
      if (re.test(text)) {
        matches.add(canonical);
        break;
      }
    }
  }
  return Array.from(matches);
}

// 🧩 Make a regex that treats hyphens/underscores/spaces interchangeably
function makeLooseRegexFromQuery(q: string): RegExp {
  // Escape regex specials
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Be forgiving about hyphens/spaces/underscores
  const loose = escaped.replace(/[-_\s]+/g, "[-_\\s]*");
  return new RegExp(loose, "i");
}

const LOCATION_TYPE_SYNONYMS: Record<string, string[]> = {
  remote: ["remote", "wfh", "work from home", "work-from-home"],
  hybrid: ["hybrid"],
  onsite: ["onsite", "on-site", "on site", "in office", "in-office"],
};

// 🧠 Detect location types (onsite/remote/hybrid) from a free-text query
function detectLocationTypes(q: unknown): string[] {
  if (!q) return [];
  const text = Array.isArray(q)
    ? q.join(" ").toLowerCase()
    : String(q).toLowerCase();

  const matches = new Set<string>();
  for (const [canonical, variants] of Object.entries(LOCATION_TYPE_SYNONYMS)) {
    for (const v of variants) {
      const pattern = v.replace(/\s*-\s*/g, "[-\\s]?").replace(/\s+/g, "\\s*");
      const re = new RegExp(`\\b${pattern}\\b`, "i");
      if (re.test(text)) {
        matches.add(canonical);
        break;
      }
    }
  }
  return Array.from(matches);
}

// Remove every synonym token from the text; used to decide whether a query is
// nothing but structured intent (e.g. "remote full time") and $text can be skipped.
function stripSynonymTokens(
  text: string,
  synonymMaps: Record<string, string[]>[]
): string {
  let t = text.toLowerCase();
  for (const map of synonymMaps) {
    for (const variants of Object.values(map)) {
      for (const v of variants) {
        const pattern = v
          .toLowerCase()
          .replace(/\s*-\s*/g, "[-\\s]?")
          .replace(/\s+/g, "\\s*");
        t = t.replace(new RegExp(`\\b${pattern}\\b`, "ig"), " ");
      }
    }
  }
  return t.trim();
}

const JOB_EMPLOYMENT_TYPES = [
  "full-time",
  "part-time",
  "internship",
  "contract",
  "temporary",
  "freelance",
  "volunteer",
];
const JOB_LOCATION_TYPES = ["onsite", "remote", "hybrid"];

// Parse a comma-separated enum param, keeping only allowed values
function parseEnumList(raw: unknown, allowed: string[]): string[] {
  const text = Array.isArray(raw)
    ? raw.join(",")
    : typeof raw === "string"
    ? raw
    : "";
  if (!text) return [];
  const set = new Set(allowed);
  return Array.from(
    new Set(
      text
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((v) => set.has(v))
    )
  );
}

// Shared gating for publicly visible jobs (approval + publish/deadline windows).
// All date gating lives inside `$and` so extra clauses can be pushed safely
// without clobbering the `$or` blocks.
function buildLiveJobFilter() {
  const now = new Date();
  return {
    arcrivedJob: false,
    jobApprove: "approved",
    adminApprove: true,
    $and: [
      {
        $or: [
          { publishDate: { $exists: false } },
          { publishDate: null },
          { publishDate: { $lte: now } },
        ],
      },
      {
        $or: [
          { deadline: { $exists: false } },
          { deadline: null },
          { deadline: { $gte: now } },
        ],
      },
    ] as any[],
  };
}

export const getAllJobs = catchAsync(async (req: Request, res: Response) => {
  // Free-text query: `q` preferred, `title` kept for back-compat (`q` wins)
  const q = capQuery(req.query.q, 200) || capQuery(req.query.title, 200);
  const location = capQuery(req.query.location, 200);

  // Structured filters (invalid values silently ignored — no 500s)
  const categoryRaw =
    typeof req.query.category === "string" ? req.query.category : "";
  const category = mongoose.isValidObjectId(categoryRaw) ? categoryRaw : "";
  const locationTypeParam = parseEnumList(
    req.query.locationType ?? req.query.location_Type,
    JOB_LOCATION_TYPES
  );
  const employmentTypeParam = parseEnumList(
    req.query.employmentType ?? req.query.employement_Type,
    JOB_EMPLOYMENT_TYPES
  );

  // Explicit params override free-text intent sniffing
  const employmentTypes = employmentTypeParam.length
    ? employmentTypeParam
    : detectEmploymentTypes(q);
  const locationTypes = locationTypeParam.length
    ? locationTypeParam
    : detectLocationTypes(q);

  const { page, limit: rawLimit } = getPaginationParams(req.query);
  // Generous cap: existing mobile clients may request large pages
  const limit = Math.min(rawLimit, 100);
  const skip = (page - 1) * limit;

  const filter: any = buildLiveJobFilter();

  if (employmentTypes.length > 0) {
    filter.employement_Type = { $in: employmentTypes };
  }
  if (locationTypes.length > 0) {
    filter.location_Type = { $in: locationTypes };
  }
  if (category) {
    filter.jobCategoryId = new mongoose.Types.ObjectId(category);
  }
  if (location) {
    filter.$and.push({
      location: { $regex: escapeRegex(location), $options: "i" },
    });
  }

  // If the query is nothing but structured intent (e.g. "remote full time"),
  // the enum filters above already cover it — skip $text entirely.
  const onlyStructuredIntent =
    !!q &&
    (employmentTypes.length > 0 || locationTypes.length > 0) &&
    stripSynonymTokens(q, [EMPLOYMENT_SYNONYMS, LOCATION_TYPE_SYNONYMS])
      .length === 0;
  const hasTextQuery = !!q && !onlyStructuredIntent;

  const runQuery = (f: any, sort: Record<string, any>) =>
    Promise.all([
      Job.countDocuments(f),
      Job.find(f)
        .select("-embedding")
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .populate("companyId recruiterId userId")
        .lean(),
    ]);

  let totalJobs = 0;
  let jobs: any[] = [];

  if (hasTextQuery) {
    // Decide text-vs-fallback mode by COUNT, not by page contents — otherwise
    // paginating past the last text-search page would silently switch modes.
    const textFilter = { ...filter, $text: { $search: q } };
    const textCount = await Job.countDocuments(textFilter);

    if (textCount > 0) {
      totalJobs = textCount;
      jobs = await Job.find(textFilter)
        .select("-embedding")
        .skip(skip)
        .limit(limit)
        .sort({ score: { $meta: "textScore" }, createdAt: -1 })
        .populate("companyId recruiterId userId")
        .lean();
    } else {
      // Loose regex fallback (typos in word boundaries, partial words)
      const looseRe = makeLooseRegexFromQuery(q);
      filter.$and.push({
        $or: [
          { title: { $regex: looseRe } },
          { description: { $regex: looseRe } },
          { location: { $regex: looseRe } },
          { companyName: { $regex: looseRe } },
          { responsibilities: { $regex: looseRe } },
        ],
      });
      [totalJobs, jobs] = await runQuery(filter, { createdAt: -1 });
    }
  } else {
    [totalJobs, jobs] = await runQuery(filter, { createdAt: -1 });
  }

  const meta = buildMetaPagination(totalJobs, page, limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Jobs fetched successfully",
    data: { meta, jobs },
  });
});

/*************************************
 * SEARCH SUGGESTIONS (TYPEAHEAD)    *
 * GET /jobs/suggestions?q=&limit=   *
 *************************************/
const emptySuggestionGroups = (query: string) => ({
  query,
  groups: { titles: [], skills: [], categories: [], locations: [] },
});

export const getJobSuggestions = catchAsync(
  async (req: Request, res: Response) => {
    const q = capQuery(req.query.q, 100);
    const rawLimit = parseInt(String(req.query.limit)) || 5;
    const limit = Math.min(Math.max(rawLimit, 1), 10);

    // Too-short queries return empty groups (cheap 200; keeps the client dumb)
    if (q.length < 2) {
      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Suggestions fetched successfully",
        data: emptySuggestionGroups(q),
      });
    }

    const rx = wordStartRegex(q);
    const qLower = q.toLowerCase();
    const liveFilter = buildLiveJobFilter();

    // Titles are what users primarily search for: give them the largest share
    // of the dropdown and keep the secondary groups small so the total stays
    // reasonably sized. With the default limit (5) this yields up to 10 titles
    // and 3 each of skills / categories / locations.
    const titleLimit = Math.min(limit + 5, 10);
    const secondaryLimit = Math.min(limit, 3);

    // Dedupe case-insensitively ("Java Developer" / "java developer" collapse
    // into one entry, keeping the first casing seen) and rank prefix matches
    // ("java" -> "Java Developer") above mid-word matches ("Senior Java
    // Engineer"), then by how many live jobs share the value.
    const groupedFieldSuggestions = (
      field: "title" | "location",
      groupLimit: number
    ) =>
      Job.aggregate([
        {
          $match: {
            ...liveFilter,
            $and: [
              ...liveFilter.$and,
              { [field]: { $type: "string", $ne: "" } },
              { [field]: rx },
            ],
          },
        },
        {
          $group: {
            // Trim + lowercase so "Java ", "java" and "Java" collapse into
            // one suggestion (dirty data has stray whitespace/casing).
            _id: { $toLower: { $trim: { input: `$${field}` } } },
            value: { $first: { $trim: { input: `$${field}` } } },
            count: { $sum: 1 },
          },
        },
        {
          $addFields: {
            // _id is the lowercased value, so this is a cheap prefix test.
            prefixMatch: {
              $cond: [{ $eq: [{ $indexOfCP: ["$_id", qLower] }, 0] }, 1, 0],
            },
          },
        },
        { $sort: { prefixMatch: -1, count: -1, _id: 1 } },
        { $limit: groupLimit },
        { $project: { _id: 0, value: 1, count: 1 } },
      ]).option({ maxTimeMS: 2000 });

    const [titles, locations, skills, categories] = await Promise.all([
      groupedFieldSuggestions("title", titleLimit),
      groupedFieldSuggestions("location", secondaryLimit),
      // The skills collection has no unique index on `name`, so the same
      // skill appears once per job/seed row ("Java" x5). Group
      // case-insensitively before limiting so each skill shows up once.
      SkillModel.aggregate([
        { $match: { name: rx } },
        {
          $group: {
            _id: { $toLower: { $trim: { input: "$name" } } },
            value: { $first: { $trim: { input: "$name" } } },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: secondaryLimit },
        { $project: { _id: 0, value: 1 } },
      ]).option({ maxTimeMS: 2000 }),
      JobCategory.find({ name: rx })
        .select("name")
        .sort({ name: 1 })
        .limit(secondaryLimit)
        .lean()
        .maxTimeMS(2000),
    ]);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Suggestions fetched successfully",
      data: {
        query: q,
        groups: {
          titles,
          skills, // already { value } from the dedupe aggregation
          categories: categories.map((c: any) => ({
            value: c.name,
            id: String(c._id),
          })),
          locations,
        },
      },
    });
  }
);

/*******************
 * // UPDATE A JOB *
 *******************/

export const updateJob = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  const job = await Job.findById(id).populate("userId");
  if (!job) {
    throw new AppError(400, "job not found");
  }
  const jobOwner = job.userId as any;

  if (req.body.adminApprove) {
    const notification = await createNotification({
      to: job.userId._id as mongoose.Types.ObjectId,
      message: "Job Post Updated By Admin",
      type: "job_application_status",
      id: job._id as mongoose.Types.ObjectId,
    });

    const count = await Notification.countDocuments({
      to: job.userId._id,
      isViewed: false,
    });

    io.to(job.userId._id.toString()).emit("newNotification", {
      notification,
      count,
    });

    if (jobOwner?.email) {
      await sendEmail(
        jobOwner.email,
        "Job post approved",
        jobNotificationEmailTemplate({
          recipientName: jobOwner.name,
          heading: "Job post approved",
          message: "Job Post Updated By Admin",
          jobTitle: job.title,
        })
      );
    }
  } else {
    const notification = await createNotification({
      to: job.userId._id as mongoose.Types.ObjectId,
      message: "Job Post Denied By Admin",
      type: "job_application_status",
      id: job._id as mongoose.Types.ObjectId,
    });

    const count = await Notification.countDocuments({
      to: job.userId._id,
      isViewed: false,
    });

    io.to(job.userId._id.toString()).emit("newNotification", {
      notification,
      count,
    });

    if (jobOwner?.email) {
      await sendEmail(
        jobOwner.email,
        "Job post denied",
        jobNotificationEmailTemplate({
          recipientName: jobOwner.name,
          heading: "Job post denied",
          message: "Job Post Denied By Admin",
          jobTitle: job.title,
        })
      );
    }
  }

  const incomingPublishDate = coerceDate(req.body?.publishDate);
  const jobCreatedAt = getDocumentCreatedAt(job);
  const derivedAdminExpiry = deriveExpiryDate(
    incomingPublishDate ?? job.publishDate ?? jobCreatedAt ?? new Date(),
    {
      expirationDate: req.body?.expirationDate,
      expiryDate: req.body?.expiryDate,
      expiaryDate: req.body?.expiaryDate,
      deadline: req.body?.deadline ?? job.deadline ?? job.expiryDate,
    }
  );

  const nextBody: Record<string, unknown> = { ...req.body };
  if (incomingPublishDate) {
    nextBody.publishDate = incomingPublishDate;
  }
  if (derivedAdminExpiry) {
    nextBody.deadline = derivedAdminExpiry;
    nextBody.expiryDate = derivedAdminExpiry;
  } else if (req.body?.deadline) {
    const fallbackDeadline = coerceDate(req.body.deadline);
    if (fallbackDeadline) {
      nextBody.deadline = fallbackDeadline;
      nextBody.expiryDate = fallbackDeadline;
    }
  }

  const nextDeadline = nextBody.deadline as Date | undefined;
  if (
    nextDeadline &&
    (!job.deadline ||
      new Date(nextDeadline).getTime() !== new Date(job.deadline).getTime())
  ) {
    nextBody.expiryReminderSentAt = null;
  }

  const updated = await Job.findByIdAndUpdate(id, nextBody, { new: true });

  if (!updated) throw new AppError(httpStatus.NOT_FOUND, "Job not found");

  await refreshEmbeddingAfterDirectUpdate(updated);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Job updated successfully",
    data: updated,
  });
});
/*******************
 * // DELETE A JOB *
 *******************/

export const deleteJob = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = await Job.findByIdAndDelete(id);

  if (!deleted) throw new AppError(httpStatus.NOT_FOUND, "Job not found");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Job deleted successfully",
    data: deleted,
  });
});

/***************************
 *    // GET SINGLE JOB    *
 * // GET SINGLE JOB BY ID *
 ***************************/
export const getSingleJob = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const job = await Job.findById(id).populate("companyId recruiterId userId");

  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Job retrieved successfully",
    data: job,
  });
});

/************************
 * JOB RECOMMEND SYSTEM *
 ************************/
const MIN_SUGGESTED_MATCH_PERCENT = 50;

export const recommendJobs = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id;

  if (!userId) {
    throw new AppError(httpStatus.BAD_REQUEST, "User ID is required");
  }

  const resume = await CreateResume.findOne({ userId }).lean();

  if (!resume) {
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "No resume found for the User",
      data: { exactMatches: [], partialMatches: [] },
    });
  }

  const { title, country, skills = [], jobCategoryId } = resume;

  const matchConditions = [];

  if (title)
    matchConditions.push({ title: { $regex: new RegExp(escapeRegex(title), "i") } });
  if (country)
    matchConditions.push({ location: { $regex: new RegExp(escapeRegex(country), "i") } });
  if (skills.length > 0) {
    matchConditions.push({ responsibilities: { $in: skills } });
    matchConditions.push({
      description: { $regex: new RegExp(skills.map(escapeRegex).join("|"), "i") },
    });
  }
  if (jobCategoryId) matchConditions.push({ jobCategoryId });

  // ✅ Filter for published jobs only (no future publish dates)
  const dateFilter = {
    $or: [
      { publishDate: { $exists: false } },
      { publishDate: null },
      { publishDate: { $lte: new Date() } },
    ],
  };

  // ✅ Filter to exclude jobs past their deadline
  const deadlineFilter = {
    $or: [
      { deadline: { $exists: false } },
      { deadline: null },
      { deadline: { $gte: new Date() } },
    ],
  };

  const baseFilters = {
    arcrivedJob: false,
    adminApprove: true,
    jobApprove: "approved",
  };

  const jobs = await Job.find({
    $and: [
      { $or: matchConditions },
      baseFilters,
      dateFilter,
      deadlineFilter, // 🆕 ensure no expired jobs
    ],
  })
    .populate("companyId recruiterId userId")
    .limit(50)
    .lean();

  const exactMatches: any[] = [];
  const partialMatches: any[] = [];

  const embeddingsEnabled = areEmbeddingsEnabled();
  const profileEmbedding = embeddingsEnabled
    ? await generateProfileEmbeddingVector(resume, undefined, undefined)
    : null;
  const useEmbeddings = Boolean(profileEmbedding && embeddingsEnabled);
  const seenJobIds = new Set<string>();

  for (const job of jobs) {
    if (job._id) {
      seenJobIds.add(job._id.toString());
    }
    let score = 0;

    const jobTitle = job.title?.toLowerCase() || "";
    const jobLocation = job.location?.toLowerCase() || "";
    const jobResponsibilities = job.responsibilities || [];
    const jobDescription = job.description?.toLowerCase() || "";

    if (title && jobTitle.includes(title.toLowerCase())) score += 3;
    if (country && jobLocation.includes(country.toLowerCase())) score += 2;

    const matchedSkillsInResponsibilities = skills.filter((skill: any) =>
      jobResponsibilities.includes(skill)
    );
    const matchedSkillsInDescription = skills.filter((skill: any) =>
      jobDescription.includes(skill.toLowerCase())
    );

    if (matchedSkillsInResponsibilities.length > 0) score += 1;
    if (matchedSkillsInDescription.length > 0) score += 1;

    const jobEmbedding = useEmbeddings
      ? await generateJobEmbeddingVector(job)
      : null;

    const similarity =
      useEmbeddings && jobEmbedding && profileEmbedding
        ? embeddingCosineSimilarity(jobEmbedding, profileEmbedding)
        : 0;

    if (useEmbeddings) {
      if (similarity >= 0.65) {
        score += 2;
      } else if (similarity >= 0.45) {
        score += 1;
      }
    }

    const fitInsight = await jobFitService.evaluate(
      { job, resume },
      {
        useAi: false,
        useEmbeddings,
        jobEmbedding: jobEmbedding ?? undefined,
        profileEmbedding: profileEmbedding ?? undefined,
      }
    );
    const matchPercentage = fitInsight.score;

    if (matchPercentage < MIN_SUGGESTED_MATCH_PERCENT) continue;

    const adjustedScore = score + matchPercentage / 25;

    if (adjustedScore >= 5)
      exactMatches.push({ job, score: adjustedScore, matchPercentage });
    else partialMatches.push({ job, score: adjustedScore, matchPercentage });
  }

  exactMatches.sort((a, b) => b.score - a.score);
  partialMatches.sort((a, b) => b.score - a.score);

  if (
    useEmbeddings &&
    profileEmbedding &&
    exactMatches.length === 0 &&
    partialMatches.length === 0
  ) {
    const embeddingMatches = await findEmbeddingRecommendedJobs(
      profileEmbedding,
      seenJobIds,
      baseFilters,
      dateFilter,
      deadlineFilter
    );

    for (const { job, similarity } of embeddingMatches) {
      const jobEmbedding = await generateJobEmbeddingVector(job);
      const fitInsight = await jobFitService.evaluate(
        { job, resume },
        {
          useAi: false,
          useEmbeddings: useEmbeddings,
          jobEmbedding,
          profileEmbedding,
        }
      );
      const matchPercentage = fitInsight.score;
      if (matchPercentage < MIN_SUGGESTED_MATCH_PERCENT) continue;

      const adjustedScore =
        Math.min(4.5, Math.max(1, similarity * 10)) + matchPercentage / 25;

      partialMatches.push({ job, score: adjustedScore, matchPercentage });
    }
  }

  // 🧠 Fallback jobs if no matches found
  if (exactMatches.length === 0 && partialMatches.length === 0) {
    const fallbackJobs = await Job.find({
      status: "active",
      arcrivedJob: false,
      adminApprove: true,
      jobApprove: "approved",
      ...dateFilter,
      ...deadlineFilter, // 🆕 exclude expired
    })
      .populate("companyId recruiterId")
      .limit(5);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "No exact or partial matches found.",
      data: { exactMatches, partialMatches, fallbackJobs },
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Recommended jobs fetched successfully",
    data: { exactMatches, partialMatches },
  });
});

const EMBEDDING_SIMILARITY_THRESHOLD = 0.45;
const EMBEDDING_RECOMMENDATION_LIMIT = 6;

const findEmbeddingRecommendedJobs = async (
  profileEmbedding: number[],
  excludeIds: Set<string>,
  baseFilters: Record<string, unknown>,
  dateFilter: Record<string, unknown>,
  deadlineFilter: Record<string, unknown>,
  limit = EMBEDDING_RECOMMENDATION_LIMIT
) => {
  if (!areEmbeddingsEnabled()) {
    return [];
  }

  const exclude = Array.from(excludeIds).map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  const queryFilters = {
    ...baseFilters,
    ...dateFilter,
    ...deadlineFilter,
    ...(exclude.length ? { _id: { $nin: exclude } } : {}),
  };

  const candidates = await Job.find(queryFilters)
    .sort({ createdAt: -1 })
    .limit(limit * 4)
    .populate("companyId recruiterId userId")
    .lean();

  const scored: Array<{ job: any; similarity: number }> = [];

  for (const job of candidates) {
    const jobEmbedding = await generateJobEmbeddingVector(job);
    const similarity = embeddingCosineSimilarity(
      jobEmbedding,
      profileEmbedding
    );
    if (similarity >= EMBEDDING_SIMILARITY_THRESHOLD) {
      scored.push({ job, similarity });
    }
  }

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
};

/*******************************
 * GET ARCRIVED JOBS BY USERID *
 *******************************/
export const getArchivedJobs = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new AppError(httpStatus.BAD_REQUEST, "User not found");
  const archivedJobs = await Job.find({ userId, arcrivedJob: true }).sort({
    createAt: -1,
  });

  if (!archivedJobs)
    throw new AppError(httpStatus.NOT_FOUND, "No archived jobs found");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Archived jobs fetched successfully",
    data: archivedJobs,
  });
});

export const toggleArchiveJob = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  const { jobId } = req.params;

  if (!userId) throw new AppError(httpStatus.BAD_REQUEST, "User not found");
  if (!jobId) throw new AppError(httpStatus.BAD_REQUEST, "Job ID is required");

  const job = await Job.findOne({ _id: jobId, userId });
  if (!job)
    throw new AppError(httpStatus.NOT_FOUND, "Job not found or unauthorized");

  ensurePaygWindowMetadata(job);
  const wasArchived = job.arcrivedJob;
  if (wasArchived) {
    await enforcePaygEditRestriction(job);
  }

  job.arcrivedJob = !job.arcrivedJob;
  if (job.arcrivedJob) {
    job.deactivatedAt = job.deactivatedAt ?? new Date();
  } else if (job.status === "active") {
    job.deactivatedAt = null;
  }
  await job.save();

  const message = job.arcrivedJob
    ? "Job archived successfully"
    : "Job unarchived successfully";

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message,
    data: job,
  });
});

export const getRecruiterCompanyJobs = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new AppError(httpStatus.BAD_REQUEST, "User not found");
  const includeUsage =
    typeof req.query.includeUsage === "string" &&
    req.query.includeUsage.toLowerCase() === "true";

  // Get the company document for this user, if any
  const company = await Company.findOne({ userId });

  // Match jobs where:
  const Jobs = await Job.find({
    $or: [
      { userId },
      { companyId: userId },
      ...(company ? [{ companyId: company._id }] : []),
    ],
  }).sort({ createdAt: -1 });

  if (!Jobs.length) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "No jobs found",
      data: includeUsage ? { jobs: [], postingUsage: null } : [],
    });
  }

  const today = new Date();

  const jobsWithApplicants = await Promise.all(
    Jobs.map(async (job) => {
      let derivedStatus = "Pending";

      if (job.deadline && job.deadline < today) {
        derivedStatus = "Expired";
      } else if (job.publishDate && job.adminApprove) {
        if (job.publishDate <= today) {
          derivedStatus = "Live";
        } else {
          derivedStatus = "Scheduled (Admin Approved)";
        }
      } else if (job.publishDate && !job.adminApprove) {
        if (job.publishDate > today) {
          derivedStatus = "Scheduled";
        }
      }

      return {
        ...job.toObject(),
        applicantCount: job.counter ?? 0,
        derivedStatus,
      };
    })
  );

  const postingUsage = includeUsage
    ? await evaluateJobPostingAllowance(new mongoose.Types.ObjectId(userId), {
        suppressErrors: true,
      })
    : undefined;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Jobs fetched successfully",
    data: includeUsage
      ? { jobs: jobsWithApplicants, postingUsage }
      : jobsWithApplicants,
  });
});

export const getRicruitercompanyJobs1 = catchAsync(async (req, res) => {
  const userId = req.params.id;
  const now = new Date();
  const publishDateFilter = {
    $or: [
      { publishDate: { $exists: false } },
      { publishDate: null },
      { publishDate: { $lte: now } },
    ],
  };
  const deadlineFilter = {
    $or: [
      { deadline: { $exists: false } },
      { deadline: null },
      { deadline: { $gte: now } },
    ],
  };
  const Jobs = await Job.find({
    companyId: userId,
    jobApprove: "approved",
    adminApprove: true,
    arcrivedJob: false,
    ...publishDateFilter,
    $and: [deadlineFilter],
  })
    .select("-embedding")
    .sort({
      createdAt: -1,
    })
    .populate("companyId");

  // if (!Jobs) throw new AppError(httpStatus.NOT_FOUND, 'No jobs found')

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "jobs fetched successfully",
    data: Jobs,
  });
});
export const getRicruitercompanyJobs3 = catchAsync(async (req, res) => {
  const userId = req.params.id;
  const Jobs = await Job.find({
    recruiterId: userId,
  })
    .sort({
      createdAt: -1,
    })
    .populate("companyId");

  // if (!Jobs) throw new AppError(httpStatus.NOT_FOUND, 'No jobs found')

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "jobs fetched successfully",
    data: Jobs,
  });
});

export const getRicruitercompanyJobs2 = catchAsync(async (req, res) => {
  const userId = req.params.id;
  const Jobs = await Job.find({
    companyId: userId,
  })
    .sort({
      createdAt: -1,
    })
    .populate("companyId recruiterId");

  // if (!Jobs) throw new AppError(httpStatus.NOT_FOUND, 'No jobs found')
  if (!Jobs.length) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "No jobs found",
      data: [],
    });
  }

  const today = new Date();

  const jobsWithApplicants = await Promise.all(
    Jobs.map(async (job) => {
      let derivedStatus = "Pending";

      // ✅ Mark as Expired if the job's deadline has passed
      if (job.deadline && job.deadline < today) {
        derivedStatus = "Expired";
      } else if (job.publishDate && job.adminApprove) {
        if (job.publishDate <= today) {
          derivedStatus = "Live";
        } else {
          derivedStatus = "Scheduled (Admin Approved)";
        }
      } else if (job.publishDate && !job.adminApprove) {
        if (job.publishDate > today) {
          derivedStatus = "Scheduled";
        }
      }

      return {
        ...job.toObject(),
        applicantCount: job.counter ?? 0,
        derivedStatus, // 👈 includes "Expired" logic
      };
    })
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "jobs fetched successfully",
    data: jobsWithApplicants,
  });
});

/*************************************
 * GET ALL PENDING JOB ---> COMPANY *
 *************************************/
export const getPendingJobsForCompany = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    // ✅ Extract pagination params (default: page=1, limit=10)
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const company = await Company.findOne({ userId: userId });
    const companyId = company?._id;
    console.log(1, companyId);

    if (!companyId) {
      throw new AppError(httpStatus.BAD_REQUEST, "Company ID is required");
    }

    // FIND ALL RECRUITER CONNECTED TO THE COMPANY
    const recruiters = await RecruiterAccount.find({ companyId }).select(
      "userId"
    );

    console.log("recruiter", recruiters);

    if (!recruiters || recruiters.length === 0) {
      sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "No recruiters found for this company",
        data: [],
      });
      return;
    }

    // EXTRACT RECRUITER USER IDs
    const recruiterUserIds = recruiters.map((recruiter) => recruiter.userId);
    console.log("recruiterUserIds", recruiterUserIds);

    // FIND ALL pending JOBS POSTED BY THESE RECRUITERS
    const pendingJobs = await Job.find({
      userId: { $in: recruiterUserIds },
    })
      .sort({ createdAt: -1 })
      .populate("userId", "name role avatar")
      .populate("jobCategoryId")
      .skip(skip)
      .limit(limit);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Pending jobs fetched successfully",
      data: pendingJobs,
    });
  }
);

// Api for fetch jobs that need to be admin approvals
export const adminApproveJobs = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query);

  const jobs = await Job.find({ jobApprove: "pending" })
    .populate("companyId recruiterId")
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Job.countDocuments({ jobApprove: "pending" });

  const meta = buildMetaPagination(total, page, limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pending jobs fetched successfully",
    data: { jobs, meta },
  });
});



