import { Request, Response } from "express";
import catchAsync from "../utils/catchAsync";
import httpStatus from "http-status";
import AppError from "../errors/AppError";
import { Job } from "../models/job.model";
import { getPaginationParams, buildMetaPagination } from "../utils/pagination";
import sendResponse from "../utils/sendResponse";
import { CreateResume } from "../models/createResume.model";
import { checkIfUserCanPostJob } from "../helper/canPostJob";
import { User } from "../models/user.model";
import { RecruiterAccount } from "../models/recruiterAccount.model";
import { Company } from "../models/company.model";
import { AppliedJob } from "../models/appliedJob.model";
import { sendEmail } from "../utils/sendEmail";
import { io } from "../server";
import { createNotification } from "../sockets/notification.service";
import mongoose from "mongoose";
import { Notification } from "../models/notification.model";
import { Following } from "../models/following.model";
import { compileFunction } from "vm";

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
  } = req.body;

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
  let jobApprove: "pending" | "approved" | "denied" = "approved";
  let companyId;
  let recruiterId;

  if (user.role === "company") {
    jobApprove = "approved";
    const a = await Company.findOne({ userId: userId });
    if (a) {
      companyId = a._id;
    }
  } else if (user.role === "recruiter") {
    jobApprove = "approved";
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

  // await checkIfUserCanPostJob(userId)

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
    deadline,
    status,
    jobCategoryId,
    compensation,
    arcrivedJob,
    applicationRequirement,
    customQuestion,
    jobApprove,
    employement_Type,
    website_Url,
    publishDate,
    location_Type,
    career_Stage,
    name,
    role,
  });

  await job.save();

  // 🔹 Find followers
  let followers: any[] = [];
  if (companyId) {
    followers = await Following.find({ companyId });
  } else if (recruiterId) {
    followers = await Following.find({ recruiterId });
  }

  if (followers.length > 0) {
    const notifications = followers.map((f) => ({
      userId: f.userId,
      message: `New job posted: ${title}`,
      jobId: job._id,
      type: "job_post",
    }));

    const saved = await Notification.insertMany(notifications);

    // 🔹 Emit via socket
    saved.forEach(async (n) => {
      const count = await Notification.countDocuments({
        to: n.userId,
        isViewed: false,
      });
      io.to(n.userId.toString()).emit("newNotification", {
        n,
        compileFunction,
      });
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Job created successfully",
    data: job,
  });
});

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
        job.recruiterId.toString() === (recruiter._id as mongoose.Types.ObjectId).toString()
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
  ] as any;

  // Track some state to optionally notify followers on activation
  const prevStatus = job.status;
  const prevPublishDate = job.publishDate;

  // ---- Apply updates safely ----
  for (const field of updatableFields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      // @ts-ignore
      job[field] = req.body[field];
    }
  }

  // Keep authorship associations intact—do not allow swapping owners from edit
  // If you DO want to allow company/recruiter switching, handle explicitly here.

  await job.save();

  // ---- Optional: notify followers if the job just became active or newly published now ----
  const justActivated = prevStatus !== "active" && job.status === "active";

  const justPublishedNow =
    !!job.publishDate &&
    prevPublishDate?.toString() !== job.publishDate?.toString();

  if (justActivated || justPublishedNow) {
    let followers: any[] = [];
    if (job.companyId) {
      followers = await Following.find({ companyId: job.companyId });
    } else if (job.recruiterId) {
      followers = await Following.find({ recruiterId: job.recruiterId });
    }

    if (followers.length > 0) {
      const notifications = followers.map((f) => ({
        userId: f.userId,
        message: `Updated job: ${job.title}`,
        jobId: job._id,
        type: "job_update",
      }));

      const saved = await Notification.insertMany(notifications);

      saved.forEach(async (n) => {
        const count = await Notification.countDocuments({
          to: n.userId,
          isViewed: false,
        });
        // emit without leaking server internals
        io.to(n.userId.toString()).emit("newNotification", {
          n,
          unseenCount: count,
        });
      });
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
  const text = Array.isArray(q) ? q.join(" ").toLowerCase() : String(q).toLowerCase();

  const matches = new Set<string>();
  for (const [canonical, variants] of Object.entries(EMPLOYMENT_SYNONYMS)) {
    for (const v of variants) {
      // hyphen/space tolerant (e.g., "full-time" ~ "full time" ~ "fulltime")
      const pattern = v
        .replace(/\s*-\s*/g, "[-\\s]?")
        .replace(/\s+/g, "\\s*");
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

export const getAllJobs = catchAsync(async (req: Request, res: Response) => {
  // Normalize title safely
  const rawTitle = req.query.title;
  const title =
    typeof rawTitle === "string"
      ? rawTitle
      : Array.isArray(rawTitle)
      ? rawTitle.join(" ")
      : undefined;

  const detectedEmploymentTypes = detectEmploymentTypes(title);

  // Common approval/date filters
  const publishDateFilter = {
    $or: [
      { publishDate: { $exists: false } },
      { publishDate: null },
      { publishDate: { $lte: new Date() } },
    ],
  };
  const deadlineFilter = {
    $or: [
      { deadline: { $exists: false } },
      { deadline: null },
      { deadline: { $gte: new Date() } },
    ],
  };

  const baseFilter: any = {
    arcrivedJob: false,
    jobApprove: "approved",
    adminApprove: true,
    ...publishDateFilter,
    $and: [deadlineFilter],
  };

  // If employment intent detected, add explicit filter by enum
  if (detectedEmploymentTypes.length > 0) {
    baseFilter.employement_Type = { $in: detectedEmploymentTypes };
  }

  const { page, limit, skip } = getPaginationParams(req.query);

  // Heuristic: if the query looks like it's ONLY employment-type intent,
  // skip $text entirely (since employement_Type isn't in the text index).
  const onlyEmploymentIntent =
    !!title &&
    detectedEmploymentTypes.length > 0 &&
    // strip the matched variants from the query and see if anything meaningful remains
    (() => {
      let t = title!.toLowerCase();
      for (const variants of Object.values(EMPLOYMENT_SYNONYMS)) {
        for (const v of variants) {
          const pattern = v
            .toLowerCase()
            .replace(/\s*-\s*/g, "[-\\s]?")
            .replace(/\s+/g, "\\s*");
          t = t.replace(new RegExp(`\\b${pattern}\\b`, "ig"), " ");
        }
      }
      // if nothing but whitespace remains, it's only employment intent
      return t.trim().length === 0;
    })();

  let filter: any = { ...baseFilter };
  if (title && !onlyEmploymentIntent) {
    // Use $text only when there's more than just employment-type intent
    filter.$text = { $search: title };
  }

  let [totalJobs, jobs] = await Promise.all([
    Job.countDocuments(filter),
    Job.find(filter, filter.$text ? { score: { $meta: "textScore" } } : {})
      .skip(skip)
      .limit(limit)
      .sort(filter.$text ? { score: { $meta: "textScore" } } : { createdAt: -1 })
      .populate("companyId recruiterId")
      .lean(),
  ]);

  // Fallback regex search if we used $text and got nothing
  if (title && !onlyEmploymentIntent && jobs.length === 0) {
    const looseRe = makeLooseRegexFromQuery(title);

    const regexFilter: any = {
      ...baseFilter,
      $or: [
        { title: { $regex: looseRe } },
        { description: { $regex: looseRe } },
        { location: { $regex: looseRe } },
        { location_Type: { $regex: looseRe } },
        // also try to match employement_Type textually for flexibility
        { employement_Type: { $regex: looseRe } },
      ],
    };

    [totalJobs, jobs] = await Promise.all([
      Job.countDocuments(regexFilter),
      Job.find(regexFilter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .populate("companyId recruiterId")
        .lean(),
    ]);
  }

  // Special path: query is ONLY employment-type (e.g., "full time")
  // We already put the enum filter in baseFilter; just run a simple find.
  if (title && onlyEmploymentIntent) {
    [totalJobs, jobs] = await Promise.all([
      Job.countDocuments(baseFilter),
      Job.find(baseFilter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .populate("companyId recruiterId userId")
        .lean(),
    ]);
  }

  const meta = buildMetaPagination(totalJobs, page, limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Jobs fetched successfully",
    data: { meta, jobs },
  });
});

/*******************
 * // UPDATE A JOB *
 *******************/

// Helper: safely get first name
function getFirstName(fullName?: string): string {
  if (!fullName) return "Candidate";
  const trimmed = fullName.trim();
  if (!trimmed) return "Candidate";
  return trimmed.split(/\s+/)[0];
}

// Helper: shared EVP email template
function buildEvpEmail(opts: {
  heading: string; // e.g., "Application Update"
  subheading?: string; // e.g., "Status: Shortlisted"
  greetingName: string; // e.g., "Fahim"
  bodyHtml: string; // inner HTML paragraphs
  signer: string; // e.g., recruiter name
  titleTag?: string; // <title> content
}) {
  const {
    heading,
    subheading,
    greetingName,
    bodyHtml,
    signer,
    titleTag = "Elevator Video Pitch — Notification",
  } = opts;

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${titleTag}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f6f8;">
      <tr>
        <td align="center" style="padding:20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.08);">
            
            <!-- Header -->
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid #eef0f2;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <h1 style="margin:0;font-size:20px;color:#111;">Elevator Video Pitch©</h1>
                      <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${heading}${
    subheading ? ` — ${subheading}` : ""
  }</p>
                    </td>
                    <td style="text-align:right;vertical-align:middle;">
                      <div style="width:120px;height:48px;overflow:hidden;border-radius:6px;display:inline-block;">
                        <img src="https://res.cloudinary.com/dftvlksve/image/upload/v1761363596/evp-logo_iuxk5w.jpg" alt="EVP Logo" style="width:100%;height:100%;object-fit:contain;object-position:center;display:block;" />
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 12px;font-size:15px;color:#111;">Dear <strong>${greetingName}</strong>,</p>
                ${bodyHtml}
                <p style="margin:16px 0 0;font-size:14px;color:#374151;">
                  Best regards,<br>
                  <strong>${signer}</strong><br>
                  Elevator Video Pitch©
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #eef0f2;text-align:center;font-size:12px;color:#9ca3af;">
                <div style="max-width:520px;margin:0 auto;">
                  <p style="margin:0 0 8px;">Elevator Video Pitch©</p>
                  <p style="margin:0;">If you have any questions, contact <a href="mailto:Admin@evpitch.com" style="color:#2B7FD0;text-decoration:none;">Admin@evpitch.com</a></p>
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
}

export const updateJob = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  const job = await Job.findById(id).populate("userId");
  if (!job) {
    throw new AppError(400, "job not found");
  }

  const user = job.userId as any;
  const greetingName = getFirstName(user?.name);

  if (req.body.adminApprove) {
    // ✅ Admin Approved Email
    const emailSubject = "Job Post Updated By Admin";
    const emailBody = buildEvpEmail({
      heading: "Job Post Status",
      subheading: "Approved",
      greetingName,
      signer: "EVP Admin",
      titleTag: "EVP — Job Post Approved",
      bodyHtml: `
        <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
          Your job post has been <strong>approved</strong> by the admin team and will go live at your scheduled time.
        </p>
        <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
          Thank you for using <strong>Elevator Video Pitch©</strong> to find great candidates.
        </p>
      `,
    });

    await sendEmail(user?.email, emailSubject, emailBody);

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
  } else {
    // ❌ Admin Denied Email
    const emailSubject = "Job Post Updated By Admin";
    const emailBody = buildEvpEmail({
      heading: "Job Post Status",
      subheading: "Denied",
      greetingName,
      signer: "EVP Admin",
      titleTag: "EVP — Job Post Denied",
      bodyHtml: `
        <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
          Unfortunately, your job post did not meet our publishing criteria and has been <strong>denied</strong> at this time.
        </p>
        <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
          If you need assistance or clarification, please reach out to us at
          <a href="mailto:info@evpitch.com" style="color:#2B7FD0;text-decoration:none;">info@evpitch.com</a>.
        </p>
      `,
    });

    await sendEmail(user?.email, emailSubject, emailBody);

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
  }

  const updated = await Job.findByIdAndUpdate(id, req.body, { new: true });

  if (!updated) throw new AppError(httpStatus.NOT_FOUND, "Job not found");

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
    matchConditions.push({ title: { $regex: new RegExp(title, "i") } });
  if (country)
    matchConditions.push({ location: { $regex: new RegExp(country, "i") } });
  if (skills.length > 0) {
    matchConditions.push({ responsibilities: { $in: skills } });
    matchConditions.push({
      description: { $regex: new RegExp(skills.join("|"), "i") },
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

  const jobs = await Job.find({
    $and: [
      { $or: matchConditions },
      { arcrivedJob: false },
      { adminApprove: true },
      { jobApprove: "approved" },
      dateFilter,
      deadlineFilter, // 🆕 ensure no expired jobs
    ],
  })
    .populate("companyId recruiterId userId")
    .limit(50)
    .lean();

  const exactMatches: any[] = [];
  const partialMatches: any[] = [];

  jobs.forEach((job) => {
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

    if (score >= 5) exactMatches.push({ job, score });
    else partialMatches.push({ job, score });
  });

  exactMatches.sort((a, b) => b.score - a.score);
  partialMatches.sort((a, b) => b.score - a.score);

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

  job.arcrivedJob = !job.arcrivedJob;
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

  // Get the company document for this user, if any
  const company = await Company.findOne({ userId });

  // Match jobs where:
  const Jobs = await Job.find({
    $or: [
      { userId }, // jobs created by the user
      { companyId: userId }, // user account itself is a company
      ...(company ? [{ companyId: company._id }] : []), // jobs created by user's company
    ],
  }).sort({ createdAt: -1 });

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
      const applicantCount = await AppliedJob.countDocuments({
        jobId: job._id,
      });

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
        applicantCount,
        derivedStatus, // 👈 new status field with "Expired" logic
      };
    })
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Jobs fetched successfully",
    data: jobsWithApplicants,
  });
});


export const getRicruitercompanyJobs1 = catchAsync(async (req, res) => {
  const userId = req.params.id;
  const Jobs = await Job.find({
    companyId: userId,
    jobApprove: "approved",
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
      const applicantCount = await AppliedJob.countDocuments({
        jobId: job._id,
      });

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
        applicantCount,
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

  const jobs = await Job.find({ jobApprove: "approved" })
    .populate("companyId recruiterId")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Job.countDocuments({});

  const meta = buildMetaPagination(total, page, limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pending jobs fetched successfully",
    data: { jobs, meta },
  });
});
