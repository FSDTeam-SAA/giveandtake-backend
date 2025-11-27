import nodemailer from "nodemailer";
import AppError from "../errors/AppError";

export const sendEmail = async (
  to: string | string[],
  subject: string,
  html: string
): Promise<void> => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.hostinger.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.APP_USER,
        pass: process.env.APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: subject || "No subject",
      html,
    });
  } catch (error) {
    console.error("Error sending email:", error);
    throw new AppError(500, "Failed to send email");
  }
};

// Optional helper (reuse if already defined elsewhere)
function getFirstName(fullName?: string): string {
  if (!fullName) return "User";
  const trimmed = fullName.trim();
  if (!trimmed) return "User";
  return trimmed.split(/\s+/)[0];
}

export const resetOtpTemplate = (name: string, otp: string) => `<!doctype html>
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
                This OTP is valid for the next <strong>60 minutes</strong>.
              </p>

              <p style="margin:8px 0 18px;font-size:14px;color:#374151;line-height:1.6;">
                If you have not signed up for a new account, you can safely ignore this email.
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
                <p style="margin:0;">Need help? Contact <a href="mailto:Admin@evpitch.com" style="color:#2B7FD0;text-decoration:none;">Admin@evpitch.com</a></p>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
