import { ClientSession, Types } from 'mongoose'
import { paymentInfo } from '../models/paymentInfo.model'
import AppError from '../errors/AppError'

export const availableCreditFilter = (userId: Types.ObjectId) => ({
  userId, duration: 'credits', paymentStatus: 'complete', planStatus: 'active',
  refundProcessing: { $ne: true },
  $or: [
    { jobPostCredits: { $type: 10 } },
    { $expr: { $lt: [{ $ifNull: ['$jobPostsUsed', 0] }, '$jobPostCredits'] } },
  ],
})

// This update and the job insertion share a transaction. Concurrent posts cannot
// spend the last credit twice. The counter survives job deletion.
export const consumeJobCredit = async (userId: Types.ObjectId, session: ClientSession) => {
  const payment = await paymentInfo.findOneAndUpdate(
    availableCreditFilter(userId), { $inc: { jobPostsUsed: 1 } },
    { new: true, session, sort: { createdAt: 1, _id: 1 } },
  )
  if (!payment) throw new AppError(403, 'No job post credits remain. Please purchase a job package.')
  return payment
}
