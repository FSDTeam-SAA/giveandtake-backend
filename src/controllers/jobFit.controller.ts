import { Request, Response } from "express";
import httpStatus from "http-status";
import AppError from "../errors/AppError";
import catchAsync from "../utils/catchAsync";
import sendResponse from "../utils/sendResponse";
import { Job } from "../models/job.model";
import { CreateResume } from "../models/createResume.model";
import { Experience } from "../models/experience.model";
import { Education } from "../models/education.model";
import { jobFitService } from "../services/jobFit.service";

const canViewOtherProfiles = (role?: string) =>
  role === "admin" || role === "company" || role === "recruiter";

export const getJobFitInsight = catchAsync(
  async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const authUserId = req.user?._id?.toString();
    const queryUserId = Array.isArray(req.query.userId)
      ? req.query.userId[0]
      : (req.query.userId as string | undefined);
    const requestedUserId = queryUserId ?? authUserId ?? undefined;

    if (!jobId) {
      throw new AppError(httpStatus.BAD_REQUEST, "Job ID is required");
    }
    if (!requestedUserId) {
      throw new AppError(httpStatus.BAD_REQUEST, "User ID is required");
    }

    if (
      queryUserId &&
      authUserId &&
      queryUserId !== authUserId &&
      !canViewOtherProfiles(req.user?.role)
    ) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You are not allowed to inspect this profile"
      );
    }

    const [job, resume] = await Promise.all([
      Job.findById(jobId).lean(),
      CreateResume.findOne({ userId: requestedUserId }).lean(),
    ]);

    if (!job) {
      throw new AppError(httpStatus.NOT_FOUND, "Job not found");
    }

    if (!resume) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Please complete your resume before checking your match score"
      );
    }

    const [experiences, education] = await Promise.all([
      Experience.find({ userId: requestedUserId }).lean(),
      Education.find({ userId: requestedUserId }).lean(),
    ]);

    const insight = await jobFitService.evaluate({
      job,
      resume,
      experiences,
      education,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "AI fit insight generated successfully",
      data: insight,
    });
  }
);
