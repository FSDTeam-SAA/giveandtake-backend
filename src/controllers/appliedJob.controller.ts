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
import { sendEmail } from "../utils/sendEmail";
import { User } from "../models/user.model";
import { io } from "../server";
import { Notification } from "../models/notification.model";

/***************
 * CREATE Application
//  ***************/
// export const applyForJob = catchAsync(async (req: Request, res: Response) => {
//   const { jobId, userId, status, resumeId } = req.body

//   // Check if already applied
//   const exists = await AppliedJob.findOne({ jobId, userId, resumeId })
//   if (exists) {
//     throw new AppError(httpStatus.CONFLICT, 'Already applied to this job')
//   }

//   // Create application
//   const application = await AppliedJob.create({
//     jobId,
//     userId,
//     status,
//     resumeId,
//   })

//   // 🔹 Fetch job details (to know who posted it)
//   const job = await Job.findById(jobId).populate('userId', 'username')
//   if (!job) {
//     throw new AppError(httpStatus.NOT_FOUND, 'Job not found')
//   }

//   // ✅ Notify the Job Owner
//   await createNotification({
//     to: job.userId as mongoose.Types.ObjectId,
//     message: `A new candidate has applied for your job "${job.title}".`,
//     type: 'job_application',
//     id: application._id,
//   })

//   // ✅ Notify the Applicant
//   await createNotification({
//     to: userId,
//     message: `You have successfully applied for the job "${job.title}".`,
//     type: 'job_application_confirmation',
//     id: application._id,
//   })

//   res.status(httpStatus.CREATED).json({
//     success: true,
//     message: 'Application submitted',
//     data: application,
//   })
// })

export const applyForJob = catchAsync(async (req: Request, res: Response) => {
  const { jobId, userId, status, resumeId, answer } = req.body;

  // 🔹 Check if already applied
  const exists = await AppliedJob.findOne({ jobId, userId });
  if (exists) {
    throw new AppError(httpStatus.CONFLICT, "Already applied to this job");
  }
  // 🔹 Fetch job details (with recruiter info)
  const job = await Job.findById(jobId).populate("userId", "name email");
  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  }
  const resume = await CreateResume.findOne({ userId });

  if (!resume) {
    throw new AppError(404, "You need to create your resume before applying to this job")
  }

  // 🔹 Find the requirement with key "noticePeriod"
  const noticePeriodReq = job.applicationRequirement.find(
    (req: any) => req.requirement === "noticePeriod"
  );

  if (noticePeriodReq) {
    // convert both to string/boolean properly before comparing
    const resumeAvailable = resume?.immediatelyAvailable;
    const check = noticePeriodReq.status === "Immediate" ? true : false

    if (check == resumeAvailable) {
      throw new AppError(httpStatus.BAD_REQUEST, "This job requires immediate availability");
    }
  }

  // 🔹 Create application
  const application = await AppliedJob.create({
    jobId,
    userId,
    status,
    resumeId,
    answer,
  });

  await Job.findByIdAndUpdate(jobId, { $inc: { counter: 1 } });

  // 🔹 Fetch candidate info
  const candidate = await User.findById(userId).select("name email");
  if (!candidate) {
    throw new AppError(httpStatus.NOT_FOUND, "Candidate not found");
  }

  // ✅ Notify the Job Owner
  await createNotification({
    to: job.userId as mongoose.Types.ObjectId,
    message: `A new candidate has applied for your job "${job.title}".`,
    type: "job_application",
    id: application._id,
  });
  const count = await Notification.countDocuments({ to: job.userId, isViewed: false })
  // Emit socket event
  io.to(job.userId.toString()).emit("newNotification", {
    message: `A new candidate has applied for your job "${job.title}".`,
    count: count
  });

  // ✅ Notify the Applicant
  await createNotification({
    to: userId,
    message: `You have successfully applied for the job "${job.title}".`,
    type: "job_application_confirmation",
    id: application._id,
  });
  const count1 = await Notification.countDocuments({ to: userId, isViewed: false })

  // Emit socket event
  io.to(userId).emit("newNotification", {
    message: `You have successfully applied for the job "${job.title}".`,
    count: count1
  });

  // ✅ Send email to Applicant
function getFirstName(fullName?: string): string {
  if (!fullName) return "Candidate";
  return fullName.trim().split(" ")[0];
}

if (candidate.email) {
  const recruiterName = (job.userId as any)?.name || "Recruiter";
  const firstName = getFirstName(candidate.name);

  const emailSubject = `Application Received: ${job.title}`;
  const emailBody = `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Application Received — Elevator Video Pitch</title>
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
                      <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Application Confirmation</p>
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
                <p style="margin:0 0 12px;font-size:15px;color:#111;">Dear <strong>${firstName}</strong>,</p>
                <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
                  We’re pleased to inform you that your application for <strong>${job.title}</strong> has been received and is now under review.
                </p>
                <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
                  Thank you for your interest in joining Elevator Video Pitch©. Our team will reach out if your qualifications match our requirements.
                </p>
                <p style="margin:0 0 16px;font-size:14px;color:#374151;">We wish you the best of luck!</p>

                <p style="margin:8px 0 0;font-size:14px;color:#374151;">
                  Best regards,<br>
                  <strong>${recruiterName}</strong><br>
                  Elevator Video Pitch©
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #eef0f2;text-align:center;font-size:12px;color:#9ca3af;">
                <div style="max-width:520px;margin:0 auto;">
                  <p style="margin:0 0 8px;">Elevator Video Pitch©</p>
                  <p style="margin:0;">If you have any questions, please contact <a href="mailto:Admin@evpitch.com" style="color:#2B7FD0;text-decoration:none;">Admin@evpitch.com</a></p>
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;

  await sendEmail(candidate.email, emailSubject, emailBody);
}


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
// export const updateApplicationStatus = catchAsync(
//   async (req: Request, res: Response) => {
//     const { id } = req.params
//     const { status } = req.body

//     if (!['shortlisted', 'rejected'].includes(status)) {
//       throw new AppError(httpStatus.BAD_REQUEST, 'Invalid status value')
//     }

//     const updated = await AppliedJob.findByIdAndUpdate(
//       id,
//       { status },
//       { new: true }
//     ).populate('jobId', 'title')

//     if (!updated) {
//       throw new AppError(httpStatus.NOT_FOUND, 'Application not found')
//     }

//     // ✅ Notify the applicant about status change
//     const jobTitle = (updated.jobId as any)?.title || 'the job'
//     let notifyMessage =
//       status === 'shortlisted'
//         ? `You have been shortlisted for the job "${jobTitle}".`
//         : `You have been rejected for the job "${jobTitle}".`

//     await createNotification({
//       to: updated.userId as mongoose.Types.ObjectId,
//       message: notifyMessage,
//       type: 'job_application_status',
//       id: updated._id,
//     })

//     res.status(httpStatus.OK).json({
//       success: true,
//       message: 'Application status updated',
//       data: updated,
//     })
//   }
// )

// Helper: safely get first name
function getFirstName(fullName?: string): string {
  if (!fullName) return "Candidate";
  const trimmed = fullName.trim();
  if (!trimmed) return "Candidate";
  return trimmed.split(/\s+/)[0];
}

// Helper: shared EVP email template
function buildEvpEmail(opts: {
  heading: string;              // e.g., "Application Update"
  subheading?: string;          // e.g., "Status: Shortlisted"
  greetingName: string;         // e.g., "Fahim"
  bodyHtml: string;             // inner HTML paragraphs
  signer: string;               // e.g., recruiter name
  titleTag?: string;            // <title> content
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
                      <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${heading}${subheading ? ` — ${subheading}` : ""}</p>
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

export const updateApplicationStatus = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params; // candidate user id
    const { status } = req.body;

    if (!["shortlisted", "rejected", "pending"].includes(status)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid status value");
    }

    const updated = await AppliedJob.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    )
      .populate("jobId", "title")
      .populate("userId", "name email"); // fetch candidate info

    if (!updated) {
      throw new AppError(httpStatus.NOT_FOUND, "Application not found");
    }

    const candidate = updated.userId as any;
    const recruiter = req.user as any; // assuming you attach recruiter info in middleware
    const jobTitle = (updated.jobId as any)?.title || "the job";

    const firstName = getFirstName(candidate?.name);
    const recruiterName = getFirstName(recruiter?.name) || "Recruiter";

    let emailSubject = "";
    let emailBody = "";

    if (status === "rejected") {
      emailSubject = `Application Update: ${jobTitle}`;
      emailBody = buildEvpEmail({
        heading: "Application Update",
        subheading: "Status: Unsuccessful",
        greetingName: firstName,
        signer: recruiterName,
        titleTag: "EVP — Application Update",
        bodyHtml: `
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
            I’m sorry to let you know your application for <strong>${jobTitle}</strong> has been
            <strong>unsuccessful</strong> on this occasion. Due to the high volume of applications, we
            can’t provide personalised feedback at this stage.
          </p>
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
            Please keep applying and remain hopeful — the best of your career is yet to come!
          </p>
        `,
      });
    } else if (status === "shortlisted") {
      emailSubject = `Application Update: ${jobTitle}`;
      emailBody = buildEvpEmail({
        heading: "Application Update",
        subheading: "Status: Shortlisted",
        greetingName: firstName,
        signer: recruiterName,
        titleTag: "EVP — Application Update",
        bodyHtml: `
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
            Great news! Your application for <strong>${jobTitle}</strong> has been
            <strong>forwarded to the hiring manager</strong>. You may be contacted outside of EVP’s
            platform if they wish to progress your application.
          </p>
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
            Good luck!
          </p>
        `,
      });
    } else if (status === "pending") {
      // Optional: send a "still under review" message. Keep subject/body minimal or skip entirely.
      emailSubject = `Application Update: ${jobTitle}`;
      emailBody = buildEvpEmail({
        heading: "Application Update",
        subheading: "Status: Under Review",
        greetingName: firstName,
        signer: recruiterName,
        titleTag: "EVP — Application Update",
        bodyHtml: `
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
            Your application for <strong>${jobTitle}</strong> is still under review. We’ll reach out as
            soon as there’s an update.
          </p>
        `,
      });
    }

    // send email (only if we actually built one and the candidate has an email)
    if (candidate?.email && emailSubject && emailBody) {
      await sendEmail(candidate.email, emailSubject, emailBody);
    }

    // also send notification in-app
    const notification = await createNotification({
      to: updated.userId as mongoose.Types.ObjectId,
      message: `"${jobTitle}" application status updated. Check your email.`,
      type: "job_application_status",
      id: updated._id,
    });
    const count = await Notification.countDocuments({
      to: updated.userId,
      isViewed: false,
    });

    // Emit socket event
    io.to(updated.userId.toString()).emit("newNotification", { notification, count });

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
