import nodemailer from "nodemailer";
import AppError from "../errors/AppError";

export const sendEmail = async (
  to: string | string[],
  subject: string,
  html: string,
  options?: { from?: string; includeLegalFooter?: boolean }
): Promise<void> => {
  try {
    const defaultFrom =
      process.env.NO_REPLY_EMAIL ||
      process.env.EMAIL_FROM ||
      "no-reply@evpitch.com";
    const from = options?.from || defaultFrom;

    const transporter = nodemailer.createTransport({
      host:
        process.env.SMTP_HOST || "email-smtp.eu-west-2.amazonaws.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: false, // STARTTLS
      requireTLS: true,
      auth: {
        user: process.env.APP_USER,
        pass: process.env.APP_PASSWORD,
      },
    });

    const legalFooter = `
      <hr style="margin:24px 0;border:0;border-top:1px solid #e5e7eb;" />
      <div style="font-size:12px;line-height:1.5;color:#4b5563;">
        <p style="margin:0 0 8px;">
          Elevator Video Pitch© Ltd. is registered in England in the United Kingdom at Companies House. Company Number 15978879.
          EVPitch© and all related marks are copyrights of Elevator Video Pitch© Ltd.
        </p>
        <p style="margin:0 0 8px;">
          If you are not expecting this receipt or have not authorised or made this payment to us, please immediately contact us at
          <a href="mailto:clientsupport@evpitch.com" style="color:#2563eb;text-decoration:none;">clientsupport@evpitch.com</a>.
        </p>
        <p style="margin:0 0 8px;">
          We will reimburse payments authorised by our clients, subject to the terms and conditions in our Refund Policy in our Terms and Conditions.
        </p>
        <p style="margin:0 0 8px;">
          You can request a cancellation of all authorised payments by visiting your Account Payment History Section in your profile
          or by contacting us at <a href="mailto:clientsupport@evpitch.com" style="color:#2563eb;text-decoration:none;">clientsupport@evpitch.com</a>,
          or at Elevator Video Pitch© Ltd. 124 City Road, London EC1V 2NX  +44 0203 954 2530.
        </p>
        <p style="margin:0;">Please add the email address no-reply@evpitch.com to your safe senders list to prevent future emails from going to your junk email folder.</p>
      </div>
    `;

    const finalHtml = options?.includeLegalFooter ? `${html}${legalFooter}` : html;

    await transporter.sendMail({
      from,
      to,
      subject: subject || "No subject",
      html: finalHtml,
    });
  } catch (error) {
    console.error("Error sending email:", error);
    // throw new AppError(500, "Failed to send email");
  }
};

// Optional helper (reuse if already defined elsewhere)
function getFirstName(fullName?: string): string {
  if (!fullName) return "User";
  const trimmed = fullName.trim();
  if (!trimmed) return "User";
  return trimmed.split(/\s+/)[0];
}

// Escape user-supplied values (e.g. job titles) before embedding them in the
// HTML email body so they cannot break the markup or inject content.
function escapeHtml(value?: string): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const accountCreationOtpTemplate = (name: string, otp: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Account Creation OTP — Elevator Video Pitch</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
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
                    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Account Creation OTP</p>
                  </td>
                  <td style="text-align:right;vertical-align:middle;">
                     <div style="width:120px !important; max-width:120px !important; height:48px !important; overflow:hidden !important; border-radius:6px; display:inline-block;">
                      <img src="https://res.cloudinary.com/dftvlksve/image/upload/v1761363596/evp-logo_iuxk5w.jpg" 
                           alt="EVP Logo" 
                           class="logo-img"
                           style="width:120px !important; height:48px !important; display:block; border:0; outline:none; text-decoration:none;" 
                           width="120" 
                           height="48" />
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px;font-size:15px;color:#111;">
                Dear <strong>${getFirstName(name)}</strong>,
              </p>
              <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6;">
                We received a request to create an account for you.
              </p>
              <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6;">
                Please use the OTP below to proceed.
              </p>

              <div style="margin:20px 0;text-align:center;">
                <div style="display:inline-block;padding:14px 28px;background-color:#2B7FD0;color:#fff;border-radius:8px;font-size:22px;letter-spacing:3px;font-weight:bold;">
                  ${otp || ""}
                </div>
              </div>

              <p style="margin:18px 0 8px;font-size:14px;color:#374151;line-height:1.6;">
                This OTP is valid for the next <strong>10 minutes</strong>.
              </p>

              <p style="margin:8px 0 18px;font-size:14px;color:#374151;line-height:1.6;">
                If you have not signed up for a new account, please contact us at clientsupport@evpitch.com.
              </p>
              <p style="margin:8px 0 18px;font-size:14px;color:#374151;line-height:1.6;">
                Please add the email address no-reply@evpitch.com to your safe senders list to prevent future emails from going to your junk email folder.
              </p>

              <p style="margin:18px 0 0;font-size:14px;color:#374151;">
                Best regards,<br>
                <strong>Admin</strong><br>
                Elevator Video Pitch©
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #eef0f2;text-align:center;font-size:12px;color:#9ca3af;">
              <div style="max-width:520px;margin:0 auto;">
                <p style="margin:0 0 8px;">&copy; ${new Date().getFullYear()} Elevator Video Pitch©. All rights reserved.</p>
                <p style="margin:0;">Need help? Contact <a href="mailto:clientsupport@evpitch.com" style="color:#2B7FD0;text-decoration:none;">clientsupport@evpitch.com</a></p>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export const resetOtpTemplate = (name: string, otp: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Password Reset OTP — Elevator Video Pitch</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
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
                    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Password Reset OTP</p>
                  </td>
                  <td style="text-align:right;vertical-align:middle;">
                     <div style="width:120px !important; max-width:120px !important; height:48px !important; overflow:hidden !important; border-radius:6px; display:inline-block;">
                      <img src="https://res.cloudinary.com/dftvlksve/image/upload/v1761363596/evp-logo_iuxk5w.jpg" 
                           alt="EVP Logo" 
                           class="logo-img"
                           style="width:120px !important; height:48px !important; display:block; border:0; outline:none; text-decoration:none;" 
                           width="120" 
                           height="48" />
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px;font-size:15px;color:#111;">
                Dear <strong>${getFirstName(name)}</strong>,
              </p>
              <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6;">
                We received <strong>your password reset request</strong>.
              </p>
              <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6;">
                Please use the OTP below to reset your password.
              </p>

              <div style="margin:20px 0;text-align:center;">
                <div style="display:inline-block;padding:14px 28px;background-color:#2B7FD0;color:#fff;border-radius:8px;font-size:22px;letter-spacing:3px;font-weight:bold;">
                  ${otp || ""}
                </div>
              </div>

              <p style="margin:18px 0 8px;font-size:14px;color:#374151;line-height:1.6;">
                This OTP is valid for the next <strong>10 minutes</strong>.
              </p>

              <p style="margin:8px 0 18px;font-size:14px;color:#374151;line-height:1.6;">
                If you did not request a password reset, please ignore this email.
              </p>
              <p style="margin:8px 0 18px;font-size:14px;color:#374151;line-height:1.6;">
                Please add the email address no-reply@evpitch.com to your safe senders list to prevent future emails from going to your junk email folder.
              </p>

              <p style="margin:18px 0 0;font-size:14px;color:#374151;">
                Best regards,<br>
                <strong>Admin</strong><br>
                Elevator Video Pitch©
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #eef0f2;text-align:center;font-size:12px;color:#9ca3af;">
              <div style="max-width:520px;margin:0 auto;">
                <p style="margin:0 0 8px;">&copy; ${new Date().getFullYear()} Elevator Video Pitch©. All rights reserved.</p>
                <p style="margin:0;">Need help? Contact <a href="mailto:clientsupport@evpitch.com" style="color:#2B7FD0;text-decoration:none;">clientsupport@evpitch.com</a></p>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export const refundProcessedTemplate = (name: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Refund Processed — Elevator Video Pitch</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
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
                    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Refund Processed</p>
                  </td>
                  <td style="text-align:right;vertical-align:middle;">
                     <div style="width:120px !important; max-width:120px !important; height:48px !important; overflow:hidden !important; border-radius:6px; display:inline-block;">
                      <img src="https://res.cloudinary.com/dftvlksve/image/upload/v1761363596/evp-logo_iuxk5w.jpg" 
                           alt="EVP Logo" 
                           class="logo-img"
                           style="width:120px !important; height:48px !important; display:block; border:0; outline:none; text-decoration:none;" 
                           width="120" 
                           height="48" />
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px;font-size:15px;color:#111;">
                Dear <strong>${getFirstName(name)}</strong>,
              </p>
              <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6;">
                Your refund has been processed by PayPal, in accordance with our Refund Policy, and is on its way to you.
              </p>
              <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6;">
                Kindly remember to upload a free 30 second Elevator Video Pitch© if you haven't done so already. If you have any questions please contact <a href="mailto:clientsupport@evpitch.com" style="color:#2B7FD0;text-decoration:none;">clientsupport@evpitch.com</a>.
              </p>

              <p style="margin:18px 0 0;font-size:14px;color:#374151;">
                Best regards,<br>
                <strong>Admin</strong><br>
                Elevator Video Pitch©
              </p>

              <div style="margin-top:20px;padding:16px 18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;line-height:1.6;color:#4b5563;">
                <p style="margin:0 0 10px;">Elevator Video Pitch© Ltd. is registered in England in the United Kingdom at Companies House. Company Number 15978879.</p>
                <p style="margin:0 0 10px;">EVPitch© and all related marks are copyrights of Elevator Video Pitch© Ltd.</p>
                <p style="margin:0 0 10px;">If you are not expecting this receipt or have not authorised or made this refund request to us, please immediately contact us at <a href="mailto:clientsupport@evpitch.com" style="color:#2B7FD0;text-decoration:none;">clientsupport@evpitch.com</a>.</p>
                <p style="margin:0 0 10px;">We will reimburse payments authorised by our clients, subject to the terms and conditions in our Refund Policy in our Terms and Conditions.</p>
                <p style="margin:0 0 10px;">You can request a cancellation of all authorised payments by visiting your Account Payment History Section in your profile or by contacting us at <a href="mailto:clientsupport@evpitch.com" style="color:#2B7FD0;text-decoration:none;">clientsupport@evpitch.com</a>, or at Elevator Video Pitch© Ltd. 124 City Road, London EC1V 2NX  +44 0203 954 2530.</p>
                <p style="margin:0;">Please add the email address no-reply@evpitch.com to your safe senders list to prevent future emails from going to your junk email folder.</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #eef0f2;text-align:center;font-size:12px;color:#9ca3af;">
              <div style="max-width:520px;margin:0 auto;">
                <p style="margin:0 0 8px;">&copy; ${new Date().getFullYear()} Elevator Video Pitch©. All rights reserved.</p>
                <p style="margin:0;">Need help? Contact <a href="mailto:clientsupport@evpitch.com" style="color:#2B7FD0;text-decoration:none;">clientsupport@evpitch.com</a></p>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

/**
 * Shared shell for job-status emails (pending review / approved / declined).
 * Mirrors the house style used by the OTP/refund templates above.
 */
const jobStatusEmailLayout = (
  subtitle: string,
  name: string,
  bodyHtml: string
) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subtitle} — Elevator Video Pitch</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
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
                    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${subtitle}</p>
                  </td>
                  <td style="text-align:right;vertical-align:middle;">
                     <div style="width:120px !important; max-width:120px !important; height:48px !important; overflow:hidden !important; border-radius:6px; display:inline-block;">
                      <img src="https://res.cloudinary.com/dftvlksve/image/upload/v1761363596/evp-logo_iuxk5w.jpg"
                           alt="EVP Logo"
                           class="logo-img"
                           style="width:120px !important; height:48px !important; display:block; border:0; outline:none; text-decoration:none;"
                           width="120"
                           height="48" />
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px;font-size:15px;color:#111;">
                Dear <strong>${getFirstName(name)}</strong>,
              </p>
              ${bodyHtml}
              <p style="margin:18px 0 0;font-size:14px;color:#374151;">
                Best regards,<br>
                <strong>Admin</strong><br>
                Elevator Video Pitch©
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #eef0f2;text-align:center;font-size:12px;color:#9ca3af;">
              <div style="max-width:520px;margin:0 auto;">
                <p style="margin:0 0 8px;">&copy; ${new Date().getFullYear()} Elevator Video Pitch©. All rights reserved.</p>
                <p style="margin:0;">Need help? Contact <a href="mailto:clientsupport@evpitch.com" style="color:#2B7FD0;text-decoration:none;">clientsupport@evpitch.com</a></p>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

/**
 * Sent to a company/recruiter when they post (or edit) a job. The advert is
 * held as `adminApprove: false` until a moderator reviews it.
 */
export const jobPendingReviewTemplate = (
  name: string,
  jobTitle: string,
  action: "posted" | "updated" = "posted"
) => {
  const safeTitle = escapeHtml(jobTitle);
  const intro =
    action === "updated"
      ? `Your job <strong>${safeTitle}</strong> has been updated successfully. Because of these changes, your advert is now <strong>pending admin review</strong> again.`
      : `Thank you for posting your job <strong>${safeTitle}</strong> on Elevator Video Pitch©. Your advert has been submitted successfully and is now <strong>pending admin review</strong>.`;
  return jobStatusEmailLayout(
    "Job Pending Admin Review",
    name,
    `
      <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6;">
        ${intro}
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6;">
        It will become visible to candidates as soon as our team has approved it.
      </p>
      <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6;">
        We will email you again once a decision has been made. No further action is required from you at this time.
      </p>
    `
  );
};

/** Sent to the job owner when an admin approves their job. */
export const jobApprovedTemplate = (name: string, jobTitle: string) =>
  jobStatusEmailLayout(
    "Job Approved",
    name,
    `
      <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6;">
        Good news! Your job <strong>${escapeHtml(
          jobTitle
        )}</strong> has been reviewed and <strong>approved</strong> by our admin team.
      </p>
      <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6;">
        It is now live and visible to candidates on Elevator Video Pitch©.
      </p>
    `
  );

/** Sent to the job owner when an admin declines their job. */
export const jobDeclinedTemplate = (name: string, jobTitle: string) =>
  jobStatusEmailLayout(
    "Job Declined",
    name,
    `
      <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6;">
        We're sorry to let you know that your job <strong>${escapeHtml(
          jobTitle
        )}</strong> was not approved by our admin team and is not currently visible to candidates.
      </p>
      <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6;">
        If you believe this was a mistake or would like more information, please contact us at
        <a href="mailto:clientsupport@evpitch.com" style="color:#2B7FD0;text-decoration:none;">clientsupport@evpitch.com</a>.
      </p>
    `
  );

