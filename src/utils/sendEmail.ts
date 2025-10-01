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
      secure: false,
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
