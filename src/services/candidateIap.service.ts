import { Types } from 'mongoose'
import AppError from '../errors/AppError'
import { APPLE_IAP, GOOGLE_PLAY_IAP } from '../config/iap'
import { IPaymentInfo } from '../interface/paymentInfo.interface'
import { paymentInfo } from '../models/paymentInfo.model'
import { SubscriptionPlan } from '../models/subscriptionPlan.model'
import { isPaymentExpired, resolvePaymentExpiry } from '../utils/subscription'
import {
  decodeJwsPayload,
  getApplePurchase,
  getGoogleSubscription,
  StorePlatform,
  StoreSubscriptionSnapshot,
  StoreTerm,
  StoreVerificationError,
} from './storeSubscription.service'

/**
 * Candidate Premium bought through the App Store / Google Play. A store
 * subscription is recorded as one ordinary candidate `paymentInfo` row whose
 * expiresAt follows the store, so every existing entitlement check (60-second
 * pitches, expiry jobs, payment history) works on it unchanged.
 */

export const STORE_PAYMENT_METHODS: Record<StorePlatform, string> = {
  apple: 'App Store',
  google: 'Google Play',
}

const DAY_MS = 24 * 60 * 60 * 1000
/** How long past the store's expiry access is kept while the store cannot be reached. */
const STORE_OUTAGE_GRACE_MS = 3 * DAY_MS

type UserId = Types.ObjectId | string

/** Copies the store's view of a subscription onto its payment row (not saved). */
export const applyStoreSnapshot = (
  payment: IPaymentInfo,
  snapshot: StoreSubscriptionSnapshot
) => {
  const reactivated = snapshot.isActive && payment.planStatus !== 'active'

  payment.set({
    transactionId: snapshot.latestTransactionId,
    storeProductId: snapshot.productId,
    storeEnvironment: snapshot.environment,
    storeAutoRenew: snapshot.autoRenew ?? undefined,
    storeExpiresAt: snapshot.expiresAt ?? undefined,
    storeLastSyncedAt: new Date(),
    expiresAt: snapshot.expiresAt ?? undefined,
    planStatus: snapshot.isActive ? 'active' : 'deactivate',
  })

  if (snapshot.isRevoked && payment.paymentStatus !== 'refunded') {
    payment.set({ paymentStatus: 'refunded', refundDate: new Date() })
  }

  if (reactivated) {
    // A resubscription restarts the expiry-notice and pitch-cleanup cycle.
    payment.set({ pitchRemovedAt: undefined, expiryReminderSentAt: undefined })
  }
}

// The candidate monthly plan is stored as PayAsYouGo, which runs for a month
// (see computeExpiryFromStart), so both count as the monthly plan.
const PLAN_VALIDITY_BY_TERM: Record<StoreTerm, string[]> = {
  monthly: ['monthly', 'PayAsYouGo'],
  yearly: ['yearly'],
}

const resolveCandidateStorePlan = async (term: StoreTerm) => {
  const configuredPlanId =
    term === 'yearly'
      ? process.env.IAP_CANDIDATE_YEARLY_PLAN_ID
      : process.env.IAP_CANDIDATE_PLAN_ID
  const plan = configuredPlanId
    ? await SubscriptionPlan.findById(configuredPlanId)
    : await SubscriptionPlan.findOne({
        for: 'candidate',
        valid: { $in: PLAN_VALIDITY_BY_TERM[term] },
        archived: { $ne: true },
        price: { $gt: 0 },
      }).sort({ price: 1 })

  if (!plan) {
    throw new AppError(500, `No candidate ${term} plan is set up for store subscriptions`)
  }
  return plan
}

/**
 * Records a verified store subscription against the candidate who bought it.
 * Safe to repeat: the app re-sends purchases on restore and redelivery. Returns
 * null for a lapsed purchase that was never recorded (e.g. an old Restore).
 */
export const linkStoreSubscription = async (
  user: { _id: UserId },
  snapshot: StoreSubscriptionSnapshot
): Promise<IPaymentInfo | null> => {
  const existing = await paymentInfo.findOne({
    storePlatform: snapshot.platform,
    storeSubscriptionId: snapshot.subscriptionId,
  })

  if (existing) {
    if (String(existing.userId) !== String(user._id)) {
      throw new AppError(
        409,
        `This ${STORE_PAYMENT_METHODS[snapshot.platform]} subscription is already linked to another EVPitch account`
      )
    }
    applyStoreSnapshot(existing, snapshot)
    await existing.save()
    return existing
  }

  if (!snapshot.isActive) return null

  const plan = await resolveCandidateStorePlan(snapshot.term)
  const payment = new paymentInfo({
    userId: user._id,
    planId: plan._id,
    amount: plan.price,
    duration: snapshot.term,
    paymentStatus: 'complete',
    paymentMethod: STORE_PAYMENT_METHODS[snapshot.platform],
    storePlatform: snapshot.platform,
    storeSubscriptionId: snapshot.subscriptionId,
  })
  applyStoreSnapshot(payment, snapshot)

  try {
    await payment.save()
  } catch (error: any) {
    // Purchase and restore events can race; the unique index keeps one row.
    if (error?.code !== 11000) throw error
    return linkStoreSubscription(user, snapshot)
  }
  return payment
}

/** Re-reads a recorded store subscription from Apple / Google and saves it. */
export const refreshStorePayment = async (payment: IPaymentInfo) => {
  if (!payment.storeSubscriptionId) {
    throw new StoreVerificationError('Payment is not linked to a store subscription')
  }
  const snapshot =
    payment.storePlatform === 'google'
      ? await getGoogleSubscription(payment.storeSubscriptionId)
      : await getApplePurchase(payment.storeProductId, payment.storeSubscriptionId)

  applyStoreSnapshot(payment, snapshot)
  await payment.save()
  return payment
}

/** Keeps a recently lapsed plan active a day at a time while the store is unreachable. */
const keepAccessDuringStoreOutage = async (payment: IPaymentInfo) => {
  const storeExpiry = payment.storeExpiresAt ?? payment.expiresAt
  if (payment.paymentStatus !== 'complete' || !storeExpiry) return false

  const graceEndsAt = storeExpiry.getTime() + STORE_OUTAGE_GRACE_MS
  if (graceEndsAt <= Date.now()) return false

  payment.set({
    planStatus: 'active',
    expiresAt: new Date(Math.min(Date.now() + DAY_MS, graceEndsAt)),
  })
  try {
    await payment.save()
  } catch (error) {
    console.error(`[iap] Could not extend payment ${payment._id} during a store outage:`, error)
  }
  return true
}

/**
 * For a plan that looks expired. Store plans renew on Apple / Google's side, so
 * ask the store before treating one as lapsed. Returns true when it is still
 * current. Web (Stripe / PayPal) plans return false untouched.
 */
export const isStorePlanStillCurrent = async (payment: IPaymentInfo): Promise<boolean> => {
  if (!payment.storePlatform || !payment.storeSubscriptionId) return false

  try {
    await refreshStorePayment(payment)
  } catch (error) {
    console.error(
      `[iap] Could not refresh store subscription for payment ${payment._id}:`,
      error instanceof Error ? error.message : error
    )
    if (error instanceof StoreVerificationError) return false
    return keepAccessDuringStoreOutage(payment)
  }

  return (
    payment.planStatus === 'active' &&
    payment.paymentStatus === 'complete' &&
    !isPaymentExpired(payment)
  )
}

/**
 * Nightly, before expired plans are deactivated: pulls renewals, cancellations
 * and refunds for store plans that are due, and re-checks plans a live check
 * lapsed today in case the renewal landed since.
 */
export const syncStoreSubscriptions = async () => {
  const now = Date.now()
  const due = await paymentInfo.find({
    storeSubscriptionId: { $exists: true },
    paymentStatus: 'complete',
    $or: [
      { planStatus: 'active', expiresAt: { $lte: new Date(now + DAY_MS) } },
      {
        planStatus: 'deactivate',
        pitchRemovedAt: { $exists: false },
        storeExpiresAt: { $gte: new Date(now - STORE_OUTAGE_GRACE_MS) },
      },
    ],
  })

  let current = 0
  for (const payment of due) {
    if (payment.planStatus === 'active') {
      if (await isStorePlanStillCurrent(payment)) current += 1
      continue
    }

    try {
      await refreshStorePayment(payment)
      if (payment.planStatus === 'active') current += 1
    } catch (error) {
      console.error(
        `[iap] Could not re-check lapsed store subscription for payment ${payment._id}:`,
        error instanceof Error ? error.message : error
      )
    }
  }

  console.log(`${due.length} store subscriptions synced, ${current} still current.`)
}

const refreshRecordedSubscription = async (platform: StorePlatform, subscriptionId: string) => {
  const payment = await paymentInfo.findOne({
    storePlatform: platform,
    storeSubscriptionId: subscriptionId,
  })
  // Not recorded yet: the app links it to a candidate when it verifies the purchase.
  if (payment) await refreshStorePayment(payment)
}

/**
 * App Store Server Notifications V2. The payload only tells us which
 * subscription changed; its state is always re-read from Apple.
 */
export const handleAppleNotification = async (signedPayload: string) => {
  const notification = decodeJwsPayload<{
    data?: { bundleId?: string; signedTransactionInfo?: string }
  }>(signedPayload)
  const signedTransactionInfo = notification.data?.signedTransactionInfo
  if (notification.data?.bundleId !== APPLE_IAP.bundleId || !signedTransactionInfo) return

  const { originalTransactionId } = decodeJwsPayload<{ originalTransactionId?: string }>(
    signedTransactionInfo
  )
  if (originalTransactionId) await refreshRecordedSubscription('apple', originalTransactionId)
}

/**
 * Google Play real-time developer notifications (Pub/Sub push). The message
 * only names the purchase token; its state is always re-read from Google.
 */
export const handleGooglePlayNotification = async (messageData: string) => {
  const notification = JSON.parse(Buffer.from(messageData, 'base64').toString('utf8')) as {
    packageName?: string
    subscriptionNotification?: { purchaseToken?: string }
  }
  const purchaseToken = notification.subscriptionNotification?.purchaseToken
  if (notification.packageName !== GOOGLE_PLAY_IAP.packageName || !purchaseToken) return

  await refreshRecordedSubscription('google', purchaseToken)
}

export interface CandidatePremiumStatus {
  isPremium: boolean
  expiresAt: Date | null
  /** Payment method of the plan providing Premium, e.g. "App Store" or "Stripe". */
  source: string | null
  autoRenew: boolean | null
  /** Term of the plan providing Premium, so the app can tell monthly from yearly. */
  term: StoreTerm | null
}

/** Whether the candidate has a current monthly / yearly plan from any provider. */
export const getCandidatePremiumStatus = async (
  userId: UserId
): Promise<CandidatePremiumStatus> => {
  const plans = await paymentInfo
    .find({ userId, paymentStatus: 'complete', planStatus: 'active' })
    .populate('planId', 'valid')

  let status: CandidatePremiumStatus = {
    isPremium: false,
    expiresAt: null,
    source: null,
    autoRenew: null,
    term: null,
  }

  for (const plan of plans) {
    const validity = String(plan.duration || (plan.planId as any)?.valid || '').toLowerCase()
    if (validity !== 'monthly' && validity !== 'yearly') continue
    if (isPaymentExpired(plan) && !(await isStorePlanStillCurrent(plan))) continue

    const expiresAt = resolvePaymentExpiry(plan)
    if (!status.isPremium || (expiresAt && (!status.expiresAt || expiresAt > status.expiresAt))) {
      status = {
        isPremium: true,
        expiresAt,
        source: plan.paymentMethod || null,
        autoRenew: plan.storeAutoRenew ?? null,
        term: validity as StoreTerm,
      }
    }
  }

  return status
}
