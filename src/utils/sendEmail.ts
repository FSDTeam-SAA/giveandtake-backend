import nodemailer from 'nodemailer'
import AppError from '../errors/AppError'

export const sendEmail = async (
  to: string | string[],
  subject: string,
  html: string
): Promise<void> => {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.APP_USER || 'tahsin.bdcalling@gmail.com',
        pass: process.env.APP_PASS || 'lcnt cxiw pcui vikv',
      },
    })

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'nm.bdcalling@gmail.com',
      to,
      subject: subject || 'No subject',
      html,
    })
  } catch (error) {
    console.error('Error sending email:', error)
    throw new AppError(500, 'Failed to send email')
  }
}
