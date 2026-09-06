/** Run with --apply during a maintenance window. Default is a read-only preview. */
import 'dotenv/config'
import mongoose from 'mongoose'
import { SubscriptionPlan } from '../models/subscriptionPlan.model'
import { paymentInfo } from '../models/paymentInfo.model'
import { Job } from '../models/job.model'
import { JOB_PACKAGES } from '../utils/jobPackagePolicy'

const key = (title: string, valid: string) => {
  const tier = ['basic', 'bronze', 'silver', 'gold', 'platinum'].find(t => title.toLowerCase().includes(t))
  return tier ? `${/premium/i.test(title) || valid === 'yearly' ? 'premium ' : ''}${tier} plan` : ''
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required')
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false })
  const apply = process.argv.includes('--apply')
  const plans = await SubscriptionPlan.find({ for: { $in: ['company', 'recruiter'] } }).sort({ createdAt: 1, _id: 1 })
  const duplicates = await paymentInfo.aggregate([
    { $match: { planId: { $in: plans.map(p => p._id) } } },
    { $group: { _id: '$transactionId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ])
  if (duplicates.length) throw new Error('Duplicate payment transaction IDs require reconciliation before migration.')
  if (apply) await paymentInfo.createIndexes()
  const unmatched = plans.filter(p => !key(p.title, p.valid) && p.valid !== 'PayAsYouGo')
  if (unmatched.length) {
    console.log('Plans outside the requested catalogue (left unchanged):', unmatched.map(p => ({ id: p._id, title: p.title, for: p.for })))
  }
  const changes = []
  // Freeze purchased allocations BEFORE changing catalogue rows. Existing
  // payment amount and purchase timestamp are never rewritten.
  for (const plan of plans) {
    const target = JOB_PACKAGES.find(p => p.title.toLowerCase() === key(plan.title, plan.valid)) ??
      (plan.valid === 'PayAsYouGo' ? { title: plan.title, jobPostCredits: 1 } : undefined)
    if (!target) continue
    const payments = await paymentInfo.find({ planId: plan._id, duration: { $ne: 'credits' } })
    for (const payment of payments) {
      const used = await Job.countDocuments({ billingPlanId: payment._id })
      // Preserve the allocation originally sold. Monthly rows stored their
      // monthly allowance separately; annual purchases use their annual quota.
      const allocation = /unlimited/i.test(plan.title) ? null : plan.valid === 'credits' ? plan.jobPostCredits :
        payment.duration === 'monthly' ? (plan.maxJobPostsPerMonth ?? target.jobPostCredits) :
        (plan.maxJobPostsPerYear ?? target.jobPostCredits)
      if (apply) await paymentInfo.updateOne({ _id: payment._id, duration: { $ne: 'credits' } }, {
        $set: { duration: 'credits', jobPostCredits: allocation, jobPostsUsed: used },
        $unset: { expiresAt: 1 },
      }, { timestamps: false })
    }
    changes.push({ title: target.title, audience: plan.for, paymentsToConvert: payments.length })
  }
  for (const audience of ['company', 'recruiter'] as const) {
    for (const target of JOB_PACKAGES) {
      const matching = plans.filter(p => p.for === audience && key(p.title, p.valid) === target.title.toLowerCase())
      const data = { ...target, for: audience, valid: 'credits', archived: false,
        description: 'One-time job post package. Credits never expire.',
        features: [target.jobPostCredits === null ? 'Unlimited job posts' : `${target.jobPostCredits} job posts`, 'Credits never expire', 'No monthly or yearly posting limits'] }
      if (matching.length > 1) console.log(`${matching.length - 1} duplicate ${audience} ${target.title} rows will be archived; purchase references retained.`)
      console.log(`${apply ? 'APPLY' : 'PREVIEW'}: ${audience} | ${target.title} | $${target.price} | ${target.jobPostCredits ?? 'Unlimited'} posts`)
      if (!apply) continue
      if (matching[0]) await SubscriptionPlan.updateOne({ _id: matching[0]._id }, { $set: data, $unset: { maxJobPostsPerMonth: 1, maxJobPostsPerYear: 1 } })
      else await SubscriptionPlan.create(data)
      for (const duplicate of matching.slice(1)) await SubscriptionPlan.updateOne({ _id: duplicate._id }, { $set: { archived: true } })
    }
  }
  if (apply) await SubscriptionPlan.updateMany({ for: { $in: ['company', 'recruiter'] }, valid: 'PayAsYouGo' }, { $set: { archived: true } })
  console.log(JSON.stringify(changes, null, 2))
  console.log(apply ? 'Migration complete.' : 'Preview only. Pass --apply to write changes.')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => mongoose.disconnect())
