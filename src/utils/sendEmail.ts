import nodemailer from "nodemailer";
import AppError from "../errors/AppError";

export const sendEmail = async (
  to: string | string[],
  subject: string,
  html: string
): Promise<void> => {
  try {
    const transporter = nodemailer.createTransport({
      host: "mail.evpitch.com",
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

export const resetOtpTemplate = (name : String, otp: String) => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Password Reset OTP</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f6f8;">
    <tr>
      <td align="center" style="padding:30px 10px;">
        <table cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#0ea5a4;padding:20px;text-align:center;">
              <h1 style="margin:0;font-size:22px;color:#fff;">Elevator Video Pitch©</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:30px 25px;">
              <p style="margin:0 0 12px;font-size:16px;color:#111;">Hello ${name || "User"},</p>
              <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6;">
                We received a request to reset your password for your <strong>Elevator Video Pitch©</strong> account.  
                Please use the OTP below to proceed with resetting your password.
              </p>

              <div style="margin:20px 0;text-align:center;">
                <div style="display:inline-block;padding:14px 28px;background-color:#0ea5a4;color:#fff;border-radius:8px;font-size:22px;letter-spacing:3px;font-weight:bold;">
                  ${otp}
                </div>
              </div>

              <p style="margin:18px 0 8px;font-size:14px;color:#374151;line-height:1.6;">
                This OTP is valid for the next <strong>10 minutes</strong>.  
                If you didn’t request a password reset, you can safely ignore this email — your account is secure.
              </p>

              <p style="margin:18px 0 0;font-size:14px;color:#374151;">
                Best regards,<br>
                <strong>Admin</strong><br>
                Elevator Video Pitch© Ltd
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #eef0f2;text-align:center;font-size:12px;color:#9ca3af;">
              <p style="margin:0;">&copy; ${new Date().getFullYear()} Elevator Video Pitch© Ltd. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
