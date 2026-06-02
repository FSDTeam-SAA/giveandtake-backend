import { Request, Response } from "express";
import httpStatus from "http-status";
import mongoose from "mongoose";
import { AppliedJob } from "../models/appliedJob.model";
import catchAsync from "../utils/catchAsync";
import AppError from "../errors/AppError";
import { buildMetaPagination, getPaginationParams } from "../utils/pagination";
import { CreateResume } from "../models/createResume.model";
import { Education } from "../models/education.model";
import { Experience } from "../models/experience.model";
import { ElevatorPitch } from "../models/elevatorPitch.model";
import { AwardsAndHonor } from "../models/awardsAndHonor.model";
import { createNotification } from "../sockets/notification.service";
import { Job } from "../models/job.model";
import { User } from "../models/user.model";
import { io } from "../server";
import { Notification } from "../models/notification.model";
import { assertOwner, isPrivilegedRole } from "../utils/authz";

export const applyForJob = catchAsync(async (req: Request, res: Response) => {
  const { jobId, resumeId, answer, hasValidVisa } = req.body;

  // Always derive the applicant from the authenticated user — never trust the body.
  const userId = String(req.user?._id);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid job ID");
  }

  const exists = await AppliedJob.findOne({ jobId, userId });
  if (exists) {
    throw new AppError(httpStatus.CONFLICT, "Already applied to this job");
  }

  const job = await Job.findById(jobId).populate("userId", "name email");
  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  }
  const resume = await CreateResume.findOne({ userId });

  if (!resume) {
    throw new AppError(
      404,
      "You need to create your resume before applying to this job"
    );
  }

  // If a resumeId is supplied, it must reference a resume owned by the applicant.
  if (resumeId !== undefined && resumeId !== null && resumeId !== "") {
    if (!mongoose.Types.ObjectId.isValid(resumeId)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid resume ID");
    }
    const ownedResume = await CreateResume.findOne({ _id: resumeId, userId });
    if (!ownedResume) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You can only apply with your own resume"
      );
    }
  }

  const noticePeriodReq = job.applicationRequirement.find(
    (req: any) => req.requirement === "noticePeriod"
  );

  const visaRequirement = job.applicationRequirement.find(
    (req: any) =>
      String(req?.requirement || "").trim().toLowerCase() ===
      "have you got a valid visa for this location?"
  );

  if (
    visaRequirement &&
    String(visaRequirement.status || "").toLowerCase() === "required" &&
    typeof hasValidVisa !== "boolean"
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Please confirm if you have a valid visa for this location."
    );
  }

  if (noticePeriodReq) {
    const resumeAvailable = resume?.immediatelyAvailable;
    const check = noticePeriodReq.status === "Immediate" ? true : false;

    if (check == resumeAvailable) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This job requires immediate availability"
      );
    }
  }

  const application = await AppliedJob.create({
    jobId,
    userId: userObjectId,
    status: "pending", // safe default — applicants cannot self-assign a status
    resumeId,
    answer,
    hasValidVisa:
      typeof hasValidVisa === "boolean" ? Boolean(hasValidVisa) : null,
  });

  await Job.findByIdAndUpdate(jobId, { $inc: { counter: 1 } });

  const candidate = await User.findById(userId).select("name email");
  if (!candidate) {
    throw new AppError(httpStatus.NOT_FOUND, "Candidate not found");
  }

  await createNotification({
    to: job.userId as mongoose.Types.ObjectId,
    message: `A new candidate has applied for your job "${job.title}".`,
    type: "job_application",
    id: application._id,
  });
  const count = await Notification.countDocuments({
    to: job.userId,
    isViewed: false,
  });
  io.to(job.userId.toString()).emit("newNotification", {
    message: `A new candidate has applied for your job "${job.title}".`,
    count: count,
  });

  await createNotification({
    to: userObjectId,
    message: `You have successfully applied for the job "${job.title}".`,
    type: "job_application_confirmation",
    id: application._id,
  });
  const count1 = await Notification.countDocuments({
    to: userId,
    isViewed: false,
  });

  io.to(userId).emit("newNotification", {
    message: `You have successfully applied for the job "${job.title}".`,
    count: count1,
  });

  // Email notifications to applicants are temporarily disabled.

  res.status(httpStatus.CREATED).json({
    success: true,
    message: "Application submitted",
    data: application,
  });
});

/****************************
 * GET Applications by Job ID
 ***************/
export const getApplicationsByJob = catchAsync(
  async (req: Request, res: Response) => {
    const { jobId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid job ID");
    }

    // Only the owner of the job (the recruiter/company that posted it) or an
    // admin may view the applicants for that job.
    const job = await Job.findById(jobId).select("userId");
    if (!job) {
      throw new AppError(httpStatus.NOT_FOUND, "Job not found");
    }
    assertOwner(
      req,
      job.userId,
      "You are not allowed to view applications for this job"
    );

    // ✅ Extract pagination params (default: page=1, limit=10)
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // ✅ Get total count for pagination metadata
    const total = await AppliedJob.countDocuments({ jobId });

    // ✅ Fetch applications with pagination
    const applications = await AppliedJob.find({ jobId })
      .populate("userId", "name email avatar slug")
      .populate("resumeId")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }); // optional: newest first

    const applicationsWithResume = await Promise.all(
      applications.map(async (app) => {
        const resume = await CreateResume.findOne({ userId: app.userId._id });
        return {
          ...app.toObject(),
          resume,
        };
      })
    );

    res.status(httpStatus.OK).json({
      success: true,
      message: "Applications fetched for job",
      data: applicationsWithResume,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  }
);

/***************
 * GET Applications by User ID (with optional query)
 ***************/
export const getApplicationsByUser = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { status } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid user ID");
    }

    // The applicant themself, or an authorised recruiter/company/admin, may read
    // these applications. Candidates may not browse another candidate's data.
    const requesterId = String(req.user?._id);
    const requesterRole = req.user?.role;
    const isAuthorisedReader =
      requesterId === String(userId) ||
      isPrivilegedRole(requesterRole) ||
      requesterRole === "recruiter" ||
      requesterRole === "company";
    if (!isAuthorisedReader) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You are not allowed to view these applications"
      );
    }

    const filter: any = { userId };
    if (status) filter.status = status;

    const totalItems = await AppliedJob.countDocuments(filter);

    const applications = await AppliedJob.find(filter)
      .populate({
        path: "jobId",
        populate: [
          { path: "companyId" },       // populates jobId.company
          { path: "recruiterId" },     // populates jobId.recruiter
        ],
      })
      .populate("userId", "name email")
      .populate("resumeId")
      .skip(skip)
      .limit(limit);

    const createResume = await CreateResume.findOne({ userId }).lean();

    const education = await Education.find({ userId });

    const experience = await Experience.find({ userId });

    const awardsAndHonor = await AwardsAndHonor.find({ userId });

    const elevatorPitch = await ElevatorPitch.findOne({ userId });

    const meta = buildMetaPagination(totalItems, page, limit);

    res.status(httpStatus.OK).json({
      success: true,
      message: "Applications fetched for user",
      meta,
      data: {
        applications,
        createResume,
        education,
        experience,
        elevatorPitch,
        awardsAndHonor,
      },
    });
  }
);

/***************
 * UPDATE Application Status
 ***************/
export const updateApplicationStatus = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params; // application id (AppliedJob doc id)
    const { status } = req.body;
    const normalizedStatus = String(status ?? "").toLowerCase();

    if (!["shortlisted", "rejected", "pending"].includes(normalizedStatus)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid status value");
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid application ID");
    }

    // Only the owner of the job being applied to (or an admin) may change the
    // application status. Load the application and assert job ownership first.
    const application = await AppliedJob.findById(id);
    if (!application) {
      throw new AppError(httpStatus.NOT_FOUND, "Application not found");
    }
    const job = await Job.findById(application.jobId).select("userId");
    if (!job) {
      throw new AppError(httpStatus.NOT_FOUND, "Job not found");
    }
    assertOwner(
      req,
      job.userId,
      "You are not allowed to update this application"
    );

    const updated = await AppliedJob.findByIdAndUpdate(
      id,
      { status: normalizedStatus },
      { new: true }
    )
      .populate("jobId", "title")
      .populate("userId", "name email"); // fetch candidate info

    if (!updated) {
      throw new AppError(httpStatus.NOT_FOUND, "Application not found");
    }

    const jobTitle = (updated.jobId as any)?.title || "the job";
    const roleText = jobTitle; // role = job title here

   // Copy the email contents into notification messages
let notificationMessage = `"${roleText}" application status updated.`;

if (normalizedStatus === "shortlisted") {
  notificationMessage =
    `Your application for the ${roleText} role has been forwarded to the hiring manager. ` +
    `You may be contacted outside of EVP’s platform if the hire manager wants to proceed with a formal interview. ` +
    `Good luck!`;
} else if (normalizedStatus === "rejected") {
  notificationMessage =
    `Unfortunately, your application for the ${roleText} role has been unsuccessful on this occasion. ` +
    `Please continue to apply and we wish you good fortune in your job search!`;
} else if (normalizedStatus === "pending") {
  // No provided email template for pending, so keep it neutral.
  notificationMessage = `Your application for the ${roleText} role is currently pending.`;
}


    // Email notifications for application status changes are temporarily disabled.

    const notification = await createNotification({
      to: updated.userId as mongoose.Types.ObjectId,
      message: notificationMessage,
      type: "job_application_status",
      id: updated._id,
    });

    const count = await Notification.countDocuments({
      to: updated.userId,
      isViewed: false,
    });

    // Emit socket event
    io.to(updated.userId.toString()).emit("newNotification", {
      notification,
      count,
    });

    res.status(httpStatus.OK).json({
      success: true,
      message: "Application status updated",
      data: updated,
    });
  }
);

/***************
 * DELETE Application
 ***************/
export const deleteApplication = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid application ID");
    }

    const application = await AppliedJob.findById(id);
    if (!application) {
      throw new AppError(httpStatus.NOT_FOUND, "Application not found");
    }

    // The applicant, the owner of the job, or an admin may delete the application.
    const requesterId = String(req.user?._id);
    const isApplicant = requesterId === String(application.userId);
    if (!isApplicant && !isPrivilegedRole(req.user?.role)) {
      const job = await Job.findById(application.jobId).select("userId");
      if (!job) {
        throw new AppError(httpStatus.NOT_FOUND, "Job not found");
      }
      assertOwner(
        req,
        job.userId,
        "You are not allowed to delete this application"
      );
    }

    const deleted = await AppliedJob.findByIdAndDelete(id);

    if (!deleted) {
      throw new AppError(httpStatus.NOT_FOUND, "Application not found");
    }

    if (deleted.jobId) {
      await Job.findOneAndUpdate(
        { _id: deleted.jobId, counter: { $gt: 0 } },
        { $inc: { counter: -1 } }
      );
    }

    res.status(httpStatus.OK).json({
      success: true,
      message: "Application deleted",
      data: deleted,
    });
  }
);


