require('ts-node/register/transpile-only')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { JOB_PACKAGES, calculateJobRefund } = require('../src/utils/jobPackagePolicy')
const { isPaymentExpired, resolvePaymentExpiry } = require('../src/utils/subscription')
const bought = new Date('2026-01-01T00:00:00Z')
const day30 = new Date('2026-01-31T00:00:00Z')

test('catalogue matches all ten requested amounts and allocations', () => {
  assert.deepEqual(JOB_PACKAGES.map(p => [p.price, p.jobPostCredits]), [
    [195.99, 2], [2155.99, 24], [270.99, 3], [2980.99, 36], [350.99, 4],
    [3915.99, 48], [430.99, 5], [4839.99, 60], [1199.99, 14], [12319.99, null],
  ])
})
test('credits remain valid six months later, even with a stale legacy expiry', () => {
  const payment = { duration: 'credits', createdAt: bought, expiresAt: day30 }
  assert.equal(resolvePaymentExpiry(payment), null)
  assert.equal(isPaymentExpired(payment, new Date('2026-07-01')), false)
})
test('candidate monthly subscriptions retain their expiry', () => {
  assert.equal(isPaymentExpired({ duration: 'monthly', createdAt: bought }, new Date('2026-07-01')), true)
})
test('Basic unused refund includes existing 10 percent administration fee', () => {
  const refund = calculateJobRefund(195.99, 0, bought, bought)
  assert.equal(refund.adminFee, 19.6)
  assert.equal(refund.refundAmount, 176.39)
  assert.equal(refund.eligible, true)
})
test('one Basic job costs exactly $99.99 before the administration fee', () => {
  const refund = calculateJobRefund(195.99, 1, bought, day30)
  assert.equal(refund.deductions, 99.99)
  assert.equal(refund.adminFee, 9.6)
  assert.equal(refund.refundAmount, 86.4)
  assert.equal(refund.eligible, true)
})
test('no negative refund when two Basic credits have been spent', () => {
  const refund = calculateJobRefund(195.99, 2, bought, bought)
  assert.equal(refund.refundAmount, 0)
  assert.equal(refund.adminFee, 0)
  assert.equal(refund.eligible, false)
})
test('refund is rejected one millisecond past 30 days', () => {
  assert.equal(calculateJobRefund(195.99, 0, bought, new Date(+day30 + 1)).eligible, false)
})
test('the refund window does not last as long as the credits', () => {
  assert.equal(calculateJobRefund(12319.99, 3, bought, new Date('2026-07-01')).eligible, false)
})

const { User } = require('../src/models/user.model')
const { Job } = require('../src/models/job.model')
const { paymentInfo } = require('../src/models/paymentInfo.model')
const { evaluateJobPostingAllowance } = require('../src/helper/canPostJob')
const { Types } = require('mongoose')

function mockPurchases(t, purchases, available) {
  t.mock.method(User, 'findById', async () => ({ role: 'company' }))
  t.mock.method(paymentInfo, 'find', async () => purchases)
  t.mock.method(paymentInfo, 'exists', async () => available ? { _id: new Types.ObjectId() } : null)
  t.mock.method(Job, 'countDocuments', () => { throw Error('Credit usage must survive job deletion; use the durable purchase counter') })
}

test('purchasing another package adds credits without discarding the first balance', async t => {
  mockPurchases(t, [{ jobPostCredits: 2, jobPostsUsed: 1 }, { jobPostCredits: 3, jobPostsUsed: 0 }], true)
  const allowance = await evaluateJobPostingAllowance(new Types.ObjectId())
  assert.equal(allowance.allowed, true)
  assert.equal(allowance.usage.creditsRemaining, 4)
  assert.equal(allowance.usage.creditsUsed, 1)
})
test('deleting all adverts does not restore spent credits', async t => {
  process.env.JOB_POST_PAYWALL_ENABLED = 'true'
  mockPurchases(t, [{ jobPostCredits: 2, jobPostsUsed: 2 }], false)
  const allowance = await evaluateJobPostingAllowance(new Types.ObjectId(), { suppressErrors: true })
  assert.equal(allowance.allowed, false)
  assert.equal(allowance.usage.creditsRemaining, 0)
})
test('unlimited purchases remain unlimited beyond the former 48,000-post cap', async t => {
  mockPurchases(t, [{ jobPostCredits: null, jobPostsUsed: 50000 }], true)
  const allowance = await evaluateJobPostingAllowance(new Types.ObjectId())
  assert.equal(allowance.allowed, true)
  assert.equal(allowance.usage.creditsRemaining, null)
  assert.equal(allowance.billing.expiresAt, null)
})
