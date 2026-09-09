import { SubscriptionPlan } from '../models/subscriptionPlan.model'

// Keep PAYG in the same non-expiring credit flow as job packages. Restoring
// catalogue availability must never rewrite payment history or reset credits.
export const restoreJobPaygCatalog = async (apply = false) => {
  const changes = []
  for (const audience of ['company', 'recruiter'] as const) {
    const matches = await SubscriptionPlan.find({ for: audience,
      $or: [{ title: /^pay\s*as\s*you\s*go$/i }, { valid: 'PayAsYouGo' }],
    }).sort({ createdAt: 1, _id: 1 })
    const active = matches.filter(plan => !plan.archived)
    if (active.length > 1) throw new Error(`Multiple active ${audience} PAYG plans require review`)
    const existing = active[0] ?? matches[0]
    if (existing && !existing.archived && existing.valid === 'credits') {
      changes.push({ audience, action: 'unchanged', price: existing.price, credits: existing.jobPostCredits })
      continue
    }
    const price = existing?.price ?? 99.99
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid existing ${audience} PAYG price`)
    const data = {
      title: existing?.title ?? 'Pay As You Go', for: audience, price,
      valid: 'credits', jobPostCredits: 1, archived: false,
      description: 'Pay for one job post at a time. Your job post credit never expires.',
      features: ['1 job post', 'One-time payment', 'Credit never expires'],
    }
    if (apply) {
      if (existing) await SubscriptionPlan.updateOne({ _id: existing._id }, {
        $set: data, $unset: { maxJobPostsPerMonth: 1, maxJobPostsPerYear: 1 },
      }, { runValidators: true })
      else await SubscriptionPlan.create(data)
    }
    changes.push({ audience, action: existing ? 'restore' : 'create', price, credits: 1 })
  }
  return changes
}
