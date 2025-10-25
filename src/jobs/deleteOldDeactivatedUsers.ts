import mongoose from 'mongoose'
import { Job } from '../models/job.model'
import { paymentInfo } from '../models/paymentInfo.model'
import { User } from '../models/user.model'
import { createNotification } from '../sockets/notification.service'
import { sendEmail } from '../utils/sendEmail'

export const deleteOldDeactivatedUsers = async () => {
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
  const now = new Date()

  const result = await User.deleteMany({
    deactivate: true,
    dateOfdeactivate: { $lte: new Date(now.getTime() - THIRTY_DAYS) },
  })

  console.log(`${result.deletedCount} deactivated users deleted`)
}

export const updateExpiredPlans = async () => {
  const now = new Date();

  const activePlans = await paymentInfo.find({
    planStatus: 'active',
    paymentStatus: 'complete',
  });

  let updatedCount = 0;

  for (const plan of activePlans) {
    if (!plan.duration || !plan.updatedAt) continue;

    let expiryDate = new Date(plan.updatedAt);

    if (plan.duration === 'monthly') {
      expiryDate.setMonth(expiryDate.getMonth() + 1);
    } else if (plan.duration === 'yearly') {
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    } else {
      continue;
    }

    if (expiryDate <= now) {
      plan.planStatus = 'deactivate';
      await plan.save();
      updatedCount++;
    }
  }

  console.log(`${updatedCount} expired plans deactivated.`);
};


// Reuse these helpers across your mailers (or import from your mailer utils)
function getFirstName(fullName?: string): string {
  if (!fullName) return "Recruiter";
  const trimmed = fullName.trim();
  if (!trimmed) return "Recruiter";
  return trimmed.split(/\s+/)[0];
}

function buildEvpEmail(opts: {
  heading: string;              // e.g., "Job Expiry Notice"
  subheading?: string;          // e.g., "Expires in 24 hours"
  greetingName: string;         // e.g., recruiter first name
  bodyHtml: string;             // inner paragraphs (HTML)
  signer: string;               // e.g., "EVP Admin"
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
                      <h1 style="margin:0;font-size:20px;color:#111;">Elevator Video Pitch© Ltd</h1>
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
                  <strong>EVP Admin</strong><br>
                  Elevator Video Pitch© Ltd
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #eef0f2;text-align:center;font-size:12px;color:#9ca3af;">
                <div style="max-width:520px;margin:0 auto;">
                  <p style="margin:0 0 8px;">Elevator Video Pitch© Ltd</p>
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

export const notifyJobExpiryToRecruiters = async () => {
  const now = new Date();
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const jobsExpiringSoon = await Job.find({
    deadline: { $gte: now, $lte: next24h },
    status: "active",
  }).populate("recruiterId");

  for (const job of jobsExpiringSoon) {
    const recruiter = job.recruiterId as any;
    if (!recruiter?.email) continue;

    const subject = "Your job post is about to expire";

    const deadline =
      job.deadline ? new Date(job.deadline).toUTCString() : "soon";

    const body = buildEvpEmail({
      heading: "Job Expiry Notice",
      subheading: "Expires in ~24 hours",
      greetingName: getFirstName(recruiter?.name),
      signer: "EVP Admin",
      titleTag: "EVP — Job Expiry Notice",
      bodyHtml: `
        <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
          Your job advert titled <strong>${job.title || "your job post"}</strong> is due to expire
          <strong>${deadline}</strong>.
        </p>
        <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
          Kindly remember to update each applicant on the final status of their application using our
          intuitive one-click feedback tool in your job applicants panel.
        </p>
      `,
    });

    await sendEmail(recruiter.email, subject, body);
  }

  console.log(`${jobsExpiringSoon.length} recruiters notified of job expiry.`);
};




export const notifyExpiredSubscriptions = async () => {
  const today = new Date();

  const expiredPayments = await paymentInfo
    .find({
      planStatus: "deactivate",
      updatedAt: { $lte: today },
    })
    .populate("userId", "name email"); // need name + email for the email

  for (const payment of expiredPayments) {
    const user = payment.userId as any;

    // Send email if we have an address
    if (user?.email) {
      const subject = "Your subscription is about to expire";
      const body = buildEvpEmail({
        heading: "Subscription Notice",
        subheading: "Action Required",
        greetingName: getFirstName(user?.name),
        signer: "EVP Admin",
        titleTag: "EVP — Subscription Notice",
        bodyHtml: `
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
            Your upgraded plan is due to expire shortly.
          </p>
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
            Please renew your subscription or upload a new 30-second Elevator Video Pitch.
          </p>
        `,
      });

      await sendEmail(user.email, subject, body);
    }

    // Existing in-app notification
    await createNotification({
      to: (user?._id || payment.userId) as mongoose.Types.ObjectId,
      message:
        "Your subscription has expired, please renew or upload a 30-second elevator pitch video today.",
      type: "Subscription Expired",
      id: payment._id as mongoose.Types.ObjectId,
    });
  }

  console.log(`${expiredPayments.length} users notified of expired subscriptions.`);
};
