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


export const notifyJobExpiryToRecruiters = async () => {
  const now = new Date();
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const jobsExpiringSoon = await Job.find({
    deadline: {
      $gte: now,
      $lte: next24h,
    },
    status: 'active',
  }).populate('recruiterId');

  for (const job of jobsExpiringSoon) {
    const recruiter = job.recruiterId as any;

    if (!recruiter?.email) continue;

    const subject = 'Your job post is about to expire';
    const body = `
      Dear ${recruiter.name || 'Recruiter'},

      Your job advert titled "${job.title}" is due to expire shortly.

      Kindly remember to update each applicant on the final status of their application using our intuitive one-click feedback tool in your job applicants panel.

      Best regards,
      Admin
    `;

    await sendEmail(recruiter.email, subject, body);
  }

  console.log(`${jobsExpiringSoon.length} recruiters notified of job expiry.`);
};



export const notifyExpiredSubscriptions = async () => {
  const today = new Date();

  const expiredPayments = await paymentInfo.find({
    planStatus: 'deactivate',
    updatedAt: { $lte: today },
  });

  for (const payment of expiredPayments) {

    await createNotification({
      to: payment.userId as mongoose.Types.ObjectId,
      message: 'Your subscription has expired, please renew or upload a 30-second elevator pitch video today.',
      type: 'Subscription Expired',
      id: payment._id!,
    });
  }

  console.log(`${expiredPayments.length} users notified of expired subscriptions.`);
};