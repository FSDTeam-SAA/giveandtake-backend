export const JOB_REFUND_DAYS = 30
export const JOB_REFUND_POST_PRICE = 99.99
export const JOB_REFUND_ADMIN_RATE = 0.1

export const JOB_PACKAGES = [
  { title: 'Basic Plan', price: 195.99, jobPostCredits: 2 },
  { title: 'Premium Basic Plan', price: 2155.99, jobPostCredits: 24 },
  { title: 'Bronze Plan', price: 270.99, jobPostCredits: 3 },
  { title: 'Premium Bronze Plan', price: 2980.99, jobPostCredits: 36 },
  { title: 'Silver Plan', price: 350.99, jobPostCredits: 4 },
  { title: 'Premium Silver Plan', price: 3915.99, jobPostCredits: 48 },
  { title: 'Gold Plan', price: 430.99, jobPostCredits: 5 },
  { title: 'Premium Gold Plan', price: 4839.99, jobPostCredits: 60 },
  { title: 'Platinum Plan', price: 1199.99, jobPostCredits: 14 },
  { title: 'Premium Platinum Plan', price: 12319.99, jobPostCredits: null },
] as const

// null means unlimited; zero is an exhausted/empty allocation, never unlimited.
export const calculateJobRefund = (amount: number, used: number, purchasedAt: Date, now = new Date()) => {
  const deadline = new Date(purchasedAt.getTime() + JOB_REFUND_DAYS * 86400000)
  const deductions = Math.round(used * JOB_REFUND_POST_PRICE * 100) / 100
  const grossCents = Math.max(Math.round(amount * 100) - Math.round(deductions * 100), 0)
  const feeCents = Math.round(grossCents * JOB_REFUND_ADMIN_RATE)
  return {
    deadline, deductions, adminFee: feeCents / 100,
    refundAmount: (grossCents - feeCents) / 100,
    eligible: now <= deadline && grossCents > feeCents,
  }
}
