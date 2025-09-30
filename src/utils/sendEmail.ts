import nodemailer from 'nodemailer'
import AppError from '../errors/AppError'

export const sendEmail = async (
  to: string | string[],
  subject: string,
  html: string
): Promise<void> => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtps.udag.de",
      port: 465,
      secure: true,
      auth: {
        user: process.env.APP_USER,
        pass: 'iUv5,dpY(Qp##3_#',
      },
    })

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: subject || 'No subject',
      html,
    })
  } catch (error) {
    console.error('Error sending email:', error)
    throw new AppError(500, 'Failed to send email')
  }
}
