import axios from 'axios'
import jwt from 'jsonwebtoken'
import {
  APPLE_IAP,
  GOOGLE_PLAY_IAP,
  getApplePrivateKey,
  getGoogleServiceAccount,
} from '../config/iap'

export type StorePlatform = 'apple' | 'google'
export type StoreEnvironment = 'production' | 'sandbox'

/** A store subscription's current state, in the same shape for Apple and Google. */
export interface StoreSubscriptionSnapshot {
  platform: StorePlatform
  /** Stays the same across renewals: Apple originalTransactionId, Google purchaseToken. */
  subscriptionId: string
  /** The latest charge: Apple transactionId, Google latestOrderId. */
  latestTransactionId: string
  productId: string
  environment: StoreEnvironment
  expiresAt: Date | null
  isActive: boolean
  /** Refunded or revoked by the store. */
  isRevoked: boolean
  autoRenew: boolean | null
}

/** The store answered: this is not a valid candidate subscription. */
export class StoreVerificationError extends Error {}

/** The store could not be asked (not configured, network, outage). Retry later. */
export class StoreUnavailableError extends Error {}

const REQUEST_TIMEOUT_MS = 15_000

const responseStatus = (error: unknown) =>
  axios.isAxiosError(error) ? error.response?.status : undefined

/**
 * Reads a JWS payload without checking its signature. Only used on data fetched
 * from Apple over TLS with our own credentials, or to decide which subscription
 * to re-fetch from Apple — never to grant access on its own.
 */
export const decodeJwsPayload = <T>(jws: string): T => {
  const payload = typeof jws === 'string' ? jws.split('.')[1] : undefined
  if (!payload) throw new StoreVerificationError('Malformed signed data from the App Store')
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T
  } catch {
    throw new StoreVerificationError('Malformed signed data from the App Store')
  }
}

/* ------------------------------ App Store ------------------------------ */

const APPLE_API_HOSTS: Record<StoreEnvironment, string> = {
  production: 'https://api.storekit.itunes.apple.com',
  sandbox: 'https://api.storekit-sandbox.itunes.apple.com',
}

// https://developer.apple.com/documentation/appstoreserverapi/status
const APPLE_STATUS_ACTIVE = 1
const APPLE_STATUS_GRACE_PERIOD = 4
const APPLE_STATUS_REVOKED = 5

interface AppleTransactionPayload {
  transactionId: string
  originalTransactionId: string
  bundleId: string
  productId: string
  expiresDate?: number
  revocationDate?: number
}

interface AppleRenewalPayload {
  autoRenewStatus?: number
  gracePeriodExpiresDate?: number
}

export interface AppleStatusResponse {
  data?: Array<{
    lastTransactions?: Array<{
      status: number
      signedTransactionInfo: string
      signedRenewalInfo?: string
    }>
  }>
}

const appleAuthToken = () => {
  let privateKey = ''
  try {
    privateKey = getApplePrivateKey()
  } catch (error) {
    console.error('[iap] Could not read the App Store key:', error)
  }
  if (!APPLE_IAP.keyId || !APPLE_IAP.issuerId || !privateKey) {
    throw new StoreUnavailableError('App Store purchase verification is not configured')
  }

  const now = Math.floor(Date.now() / 1000)
  try {
    return jwt.sign(
      {
        iss: APPLE_IAP.issuerId,
        iat: now,
        exp: now + 20 * 60,
        aud: 'appstoreconnect-v1',
        bid: APPLE_IAP.bundleId,
      },
      privateKey,
      { algorithm: 'ES256', header: { alg: 'ES256', kid: APPLE_IAP.keyId, typ: 'JWT' } }
    )
  } catch (error) {
    console.error('[iap] Could not sign the App Store token:', error)
    throw new StoreUnavailableError('App Store purchase verification is misconfigured')
  }
}

/**
 * Converts Apple's "Get All Subscription Statuses" response. Returns null when
 * it holds no candidate subscription for this app.
 */
export const normalizeAppleStatus = (
  response: AppleStatusResponse,
  environment: StoreEnvironment,
  now = new Date()
): StoreSubscriptionSnapshot | null => {
  const latest = (response.data ?? [])
    .flatMap((group) => group.lastTransactions ?? [])
    .map((item) => ({
      item,
      transaction: decodeJwsPayload<AppleTransactionPayload>(item.signedTransactionInfo),
    }))
    .filter(
      ({ transaction }) =>
        transaction.bundleId === APPLE_IAP.bundleId &&
        APPLE_IAP.candidateProductIds.includes(transaction.productId)
    )
    .sort((a, b) => (b.transaction.expiresDate ?? 0) - (a.transaction.expiresDate ?? 0))[0]
  if (!latest) return null

  const { item, transaction } = latest
  const renewal: AppleRenewalPayload = item.signedRenewalInfo
    ? decodeJwsPayload<AppleRenewalPayload>(item.signedRenewalInfo)
    : {}
  const inGracePeriod = item.status === APPLE_STATUS_GRACE_PERIOD
  const expiresMs = Math.max(
    transaction.expiresDate ?? 0,
    inGracePeriod ? renewal.gracePeriodExpiresDate ?? 0 : 0
  )
  const expiresAt = expiresMs > 0 ? new Date(expiresMs) : null
  const isRevoked =
    item.status === APPLE_STATUS_REVOKED || Boolean(transaction.revocationDate)

  return {
    platform: 'apple',
    subscriptionId: transaction.originalTransactionId,
    latestTransactionId: transaction.transactionId,
    productId: transaction.productId,
    environment,
    expiresAt,
    isActive:
      !isRevoked &&
      (item.status === APPLE_STATUS_ACTIVE || inGracePeriod) &&
      expiresAt !== null &&
      expiresAt > now,
    isRevoked,
    autoRenew:
      renewal.autoRenewStatus === undefined ? null : renewal.autoRenewStatus === 1,
  }
}

const appleEnvironments = (): StoreEnvironment[] => {
  if (APPLE_IAP.environment === 'production') return ['production']
  if (APPLE_IAP.environment === 'sandbox') return ['sandbox']
  // TestFlight and App Review purchases only exist in the sandbox.
  return ['production', 'sandbox']
}

/** Looks up a subscription by any of its transaction ids, including the original one. */
export const getAppleSubscription = async (
  transactionId: string
): Promise<StoreSubscriptionSnapshot> => {
  const token = appleAuthToken()
  let notFound = false

  for (const environment of appleEnvironments()) {
    let response: AppleStatusResponse
    try {
      const result = await axios.get<AppleStatusResponse>(
        `${APPLE_API_HOSTS[environment]}/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: REQUEST_TIMEOUT_MS }
      )
      response = result.data
    } catch (error) {
      const status = responseStatus(error)
      // Unknown in this environment — a sandbox purchase 404s in production.
      if (status === 400 || status === 404) {
        notFound = true
        continue
      }
      // Production answers 401 until the app is live on the App Store, while
      // sandbox (TestFlight / App Review) already works with the same key.
      if (status === 401) continue
      throw new StoreUnavailableError(`App Store request failed (${status ?? 'network error'})`)
    }

    const snapshot = normalizeAppleStatus(response, environment)
    if (!snapshot) {
      throw new StoreVerificationError('This App Store purchase is not a candidate subscription')
    }
    return snapshot
  }

  if (!notFound) {
    throw new StoreUnavailableError('App Store rejected the purchase verification credentials (401)')
  }
  throw new StoreVerificationError('App Store purchase not found')
}

/* ----------------------------- Google Play ----------------------------- */

const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token'
const GOOGLE_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher'

// CANCELED only stops the next renewal; access continues until expiryTime.
const GOOGLE_ENTITLED_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED',
])

export interface GoogleSubscriptionPurchase {
  subscriptionState?: string
  latestOrderId?: string
  testPurchase?: Record<string, unknown>
  lineItems?: Array<{
    productId: string
    expiryTime?: string
    autoRenewingPlan?: { autoRenewEnabled?: boolean }
  }>
}

let googleAccessToken: { value: string; expiresAt: number } | null = null

const getGoogleAccessToken = async () => {
  if (googleAccessToken && googleAccessToken.expiresAt - 60_000 > Date.now()) {
    return googleAccessToken.value
  }

  let account = null
  try {
    account = getGoogleServiceAccount()
  } catch (error) {
    console.error('[iap] Could not read the Google Play service account:', error)
  }
  if (!account?.client_email || !account.private_key) {
    throw new StoreUnavailableError('Google Play purchase verification is not configured')
  }

  const tokenUri = account.token_uri || GOOGLE_TOKEN_URI
  const now = Math.floor(Date.now() / 1000)
  try {
    const assertion = jwt.sign(
      {
        iss: account.client_email,
        scope: GOOGLE_PUBLISHER_SCOPE,
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
      },
      account.private_key,
      { algorithm: 'RS256' }
    )
    const { data } = await axios.post<{ access_token: string; expires_in?: number }>(
      tokenUri,
      new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: REQUEST_TIMEOUT_MS,
      }
    )
    googleAccessToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    }
    return googleAccessToken.value
  } catch (error) {
    throw new StoreUnavailableError(
      `Google Play authentication failed (${responseStatus(error) ?? 'network error'})`
    )
  }
}

/**
 * Converts a Play Developer API subscriptionsv2 purchase. Returns null when it
 * holds no candidate subscription.
 */
export const normalizeGooglePurchase = (
  purchase: GoogleSubscriptionPurchase,
  purchaseToken: string,
  now = new Date()
): StoreSubscriptionSnapshot | null => {
  const expiryOf = (item: { expiryTime?: string }) => Date.parse(item.expiryTime ?? '') || 0
  const lineItem = (purchase.lineItems ?? [])
    .filter((item) => GOOGLE_PLAY_IAP.candidateProductIds.includes(item.productId))
    .sort((a, b) => expiryOf(b) - expiryOf(a))[0]
  if (!lineItem) return null

  const expiresMs = expiryOf(lineItem)
  const expiresAt = expiresMs > 0 ? new Date(expiresMs) : null

  return {
    platform: 'google',
    subscriptionId: purchaseToken,
    latestTransactionId: purchase.latestOrderId || purchaseToken.slice(0, 64),
    productId: lineItem.productId,
    environment: purchase.testPurchase ? 'sandbox' : 'production',
    expiresAt,
    isActive:
      GOOGLE_ENTITLED_STATES.has(purchase.subscriptionState ?? '') &&
      expiresAt !== null &&
      expiresAt > now,
    // Play reports revoked subscriptions as expired; they lapse the same way.
    isRevoked: false,
    autoRenew: lineItem.autoRenewingPlan?.autoRenewEnabled ?? null,
  }
}

export const getGoogleSubscription = async (
  purchaseToken: string
): Promise<StoreSubscriptionSnapshot> => {
  const accessToken = await getGoogleAccessToken()

  let purchase: GoogleSubscriptionPurchase
  try {
    const result = await axios.get<GoogleSubscriptionPurchase>(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
        GOOGLE_PLAY_IAP.packageName
      )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: REQUEST_TIMEOUT_MS }
    )
    purchase = result.data
  } catch (error) {
    const status = responseStatus(error)
    if (status === 400 || status === 404 || status === 410) {
      throw new StoreVerificationError('Google Play purchase not found')
    }
    throw new StoreUnavailableError(`Google Play request failed (${status ?? 'network error'})`)
  }

  const snapshot = normalizeGooglePurchase(purchase, purchaseToken)
  if (!snapshot) {
    throw new StoreVerificationError('This Google Play purchase is not a candidate subscription')
  }
  return snapshot
}
