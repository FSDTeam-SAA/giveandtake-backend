require('ts-node/register/transpile-only')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Types } = require('mongoose')
const { normalizeAppleStatus, normalizeGooglePurchase } = require('../src/services/storeSubscription.service')
const { applyStoreSnapshot } = require('../src/services/candidateIap.service')
const { paymentInfo } = require('../src/models/paymentInfo.model')

const now = new Date('2026-09-15T12:00:00Z')
const future = Date.parse('2026-10-15T12:00:00Z')
const past = Date.parse('2026-09-01T12:00:00Z')
const jws = (payload) => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`

const appleStatus = (status, transaction = {}, renewal = { autoRenewStatus: 1 }) => ({
  data: [{
    lastTransactions: [{
      status,
      signedTransactionInfo: jws({
        bundleId: 'com.pooelcentral.giveandtake',
        productId: 'com.pooelcentral.giveandtake.candidate.premium',
        transactionId: '2000',
        originalTransactionId: '1000',
        expiresDate: future,
        ...transaction,
      }),
      signedRenewalInfo: jws(renewal),
    }],
  }],
})

const googlePurchase = (subscriptionState, expiryTime, extra = {}) => ({
  subscriptionState,
  latestOrderId: 'GPA.1234',
  lineItems: [{ productId: 'candidate_monthly', expiryTime, autoRenewingPlan: { autoRenewEnabled: subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE' } }],
  ...extra,
})

test('active App Store subscription is keyed by its original transaction', () => {
  const snapshot = normalizeAppleStatus(appleStatus(1), 'sandbox', now)
  assert.equal(snapshot.isActive, true)
  assert.equal(snapshot.subscriptionId, '1000')
  assert.equal(snapshot.latestTransactionId, '2000')
  assert.equal(snapshot.expiresAt.getTime(), future)
  assert.equal(snapshot.environment, 'sandbox')
  assert.equal(snapshot.autoRenew, true)
})

test('App Store billing grace period keeps access until the grace period ends', () => {
  const snapshot = normalizeAppleStatus(appleStatus(4, { expiresDate: past }, { gracePeriodExpiresDate: future }), 'production', now)
  assert.equal(snapshot.isActive, true)
  assert.equal(snapshot.expiresAt.getTime(), future)
})

test('expired and revoked App Store subscriptions do not unlock Premium', () => {
  assert.equal(normalizeAppleStatus(appleStatus(2, { expiresDate: past }), 'production', now).isActive, false)
  const revoked = normalizeAppleStatus(appleStatus(5, { revocationDate: past }), 'production', now)
  assert.equal(revoked.isActive, false)
  assert.equal(revoked.isRevoked, true)
})

test('App Store purchases for another app or product are not candidate subscriptions', () => {
  assert.equal(normalizeAppleStatus(appleStatus(1, { bundleId: 'com.other.app' }), 'production', now), null)
  assert.equal(normalizeAppleStatus(appleStatus(1, { productId: 'something.else' }), 'production', now), null)
})

test('cancelled Google Play subscription stays active until its expiry time', () => {
  const snapshot = normalizeGooglePurchase(googlePurchase('SUBSCRIPTION_STATE_CANCELED', '2026-10-15T12:00:00Z'), 'token-abc', now)
  assert.equal(snapshot.isActive, true)
  assert.equal(snapshot.subscriptionId, 'token-abc')
  assert.equal(snapshot.latestTransactionId, 'GPA.1234')
  assert.equal(snapshot.autoRenew, false)
  assert.equal(snapshot.environment, 'production')
})

test('on-hold, expired and license-test Google Play purchases', () => {
  assert.equal(normalizeGooglePurchase(googlePurchase('SUBSCRIPTION_STATE_ON_HOLD', '2026-09-01T12:00:00Z'), 't', now).isActive, false)
  assert.equal(normalizeGooglePurchase(googlePurchase('SUBSCRIPTION_STATE_EXPIRED', '2026-09-01T12:00:00Z'), 't', now).isActive, false)
  assert.equal(normalizeGooglePurchase(googlePurchase('SUBSCRIPTION_STATE_ACTIVE', '2026-10-15T12:00:00Z', { testPurchase: {} }), 't', now).environment, 'sandbox')
  assert.equal(normalizeGooglePurchase({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [{ productId: 'other' }] }, 't', now), null)
})

test('a renewed store subscription reactivates its payment row and restarts the expiry cycle', () => {
  const payment = new paymentInfo({
    userId: new Types.ObjectId(), amount: 3.99, transactionId: 'old', duration: 'monthly',
    paymentStatus: 'complete', planStatus: 'deactivate',
    pitchRemovedAt: new Date(past), expiryReminderSentAt: new Date(past),
  })
  applyStoreSnapshot(payment, normalizeAppleStatus(appleStatus(1), 'production', now))
  assert.equal(payment.planStatus, 'active')
  assert.equal(payment.transactionId, '2000')
  assert.equal(payment.expiresAt.getTime(), future)
  assert.equal(payment.storeExpiresAt.getTime(), future)
  assert.equal(payment.pitchRemovedAt, undefined)
  assert.equal(payment.expiryReminderSentAt, undefined)
})

test('a lapsed store subscription deactivates the row; a revoked one is marked refunded', () => {
  const lapsed = new paymentInfo({ userId: new Types.ObjectId(), amount: 3.99, transactionId: 'x', paymentStatus: 'complete', planStatus: 'active' })
  applyStoreSnapshot(lapsed, normalizeAppleStatus(appleStatus(2, { expiresDate: past }), 'production', now))
  assert.equal(lapsed.planStatus, 'deactivate')
  assert.equal(lapsed.paymentStatus, 'complete')

  const revoked = new paymentInfo({ userId: new Types.ObjectId(), amount: 3.99, transactionId: 'y', paymentStatus: 'complete', planStatus: 'active' })
  applyStoreSnapshot(revoked, normalizeAppleStatus(appleStatus(5, { revocationDate: past }), 'production', now))
  assert.equal(revoked.planStatus, 'deactivate')
  assert.equal(revoked.paymentStatus, 'refunded')
})

const axios = require('axios')
const crypto = require('crypto')
const { getAppleSubscription, StoreUnavailableError, StoreVerificationError } = require('../src/services/storeSubscription.service')

const useTestAppleKey = () => {
  process.env.APPLE_IAP_KEY_ID = 'TESTKEY'
  process.env.APPLE_IAP_ISSUER_ID = 'test-issuer'
  process.env.APPLE_IAP_PRIVATE_KEY = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
}

// Answers App Store Server API calls per environment without the network.
const stubAppleHosts = (responses) => {
  const original = axios.get
  axios.get = async (url) => {
    const { status, data } = responses[url.includes('sandbox') ? 'sandbox' : 'production']
    if (status === 200) return { data }
    const error = new Error(`HTTP ${status}`)
    error.isAxiosError = true
    error.response = { status }
    throw error
  }
  return () => { axios.get = original }
}

test('before release, a production 401 falls back to sandbox (TestFlight / App Review)', async () => {
  useTestAppleKey()
  const restore = stubAppleHosts({ production: { status: 401 }, sandbox: { status: 200, data: appleStatus(1) } })
  try {
    const snapshot = await getAppleSubscription('2000')
    assert.equal(snapshot.environment, 'sandbox')
    assert.equal(snapshot.subscriptionId, '1000')
  } finally {
    restore()
  }
})

test('a purchase unknown to sandbox after a production 401 is not found', async () => {
  useTestAppleKey()
  const restore = stubAppleHosts({ production: { status: 401 }, sandbox: { status: 404 } })
  try {
    await assert.rejects(getAppleSubscription('2000'), StoreVerificationError)
  } finally {
    restore()
  }
})

test('credentials rejected by both App Store environments are reported as unavailable', async () => {
  useTestAppleKey()
  const restore = stubAppleHosts({ production: { status: 401 }, sandbox: { status: 401 } })
  try {
    await assert.rejects(getAppleSubscription('2000'), StoreUnavailableError)
  } finally {
    restore()
  }
})
