/**
 * Sets the website's local-currency prices on the candidate Premium plans so
 * they match the App Store / Google Play prices in those countries (Nov 2026).
 * Only plans whose USD price matches the expected base are touched.
 *
 * Default is a read-only preview; pass --apply to write.
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { SubscriptionPlan } from '../models/subscriptionPlan.model'
import type { LocalPrices } from '../utils/currency'

const TARGETS: { label: string; valid: string[]; usd: number; localPrices: LocalPrices }[] = [
  {
    label: 'Premium one month',
    valid: ['payasyougo', 'monthly'],
    usd: 6.99,
    localPrices: { GBP: 6.99, EUR: 7.99, CAD: 9.99, AUD: 9.99 },
  },
  {
    label: 'Premium twelve months',
    valid: ['yearly'],
    usd: 79.99,
    localPrices: { GBP: 79.99, EUR: 89.99, CAD: 99.99, AUD: 129.99 },
  },
]

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required')
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false })
  const apply = process.argv.includes('--apply')

  const plans = await SubscriptionPlan.find({ for: 'candidate', archived: { $ne: true } })
  for (const target of TARGETS) {
    const matches = plans.filter(
      (plan) =>
        target.valid.includes(String(plan.valid || '').toLowerCase()) &&
        Math.round(Number(plan.price) * 100) === Math.round(target.usd * 100)
    )
    if (matches.length !== 1) {
      console.log(`SKIP ${target.label}: expected 1 active candidate plan at $${target.usd}, found ${matches.length}`)
      continue
    }
    const plan = matches[0]
    console.log(
      `${apply ? 'APPLY' : 'PREVIEW'}: ${plan.title} (${plan._id}) $${plan.price} ->`,
      JSON.stringify(target.localPrices),
      '| was',
      JSON.stringify(plan.toObject().localPrices ?? {})
    )
    if (apply) {
      await SubscriptionPlan.updateOne({ _id: plan._id }, { $set: { localPrices: target.localPrices } })
    }
  }
  console.log(apply ? 'Done.' : 'Preview only. Pass --apply to write changes.')
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
