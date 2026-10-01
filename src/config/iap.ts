// config/iap.ts
import fs from 'fs'

/**
 * Native in-app purchase settings for the mobile candidate subscription.
 * Values are read on access (not at import) so scripts that never touch the
 * stores do not depend on dotenv load order.
 */

const readList = (value: string | undefined, fallback: string[]) => {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length ? items : fallback
}

/** A secret given inline, or as a path to a file on the server. */
const readSecret = (inline: string | undefined, filePath: string | undefined) => {
  if (inline && inline.trim()) return inline
  if (filePath && filePath.trim()) return fs.readFileSync(filePath.trim(), 'utf8')
  return ''
}

export const APPLE_IAP = {
  get keyId() {
    return process.env.APPLE_IAP_KEY_ID || ''
  },
  get issuerId() {
    return process.env.APPLE_IAP_ISSUER_ID || ''
  },
  get bundleId() {
    return process.env.APPLE_BUNDLE_ID || 'com.pooelcentral.giveandtake'
  },
  /** auto | production | sandbox */
  get environment() {
    return (process.env.APPLE_IAP_ENVIRONMENT || 'auto').toLowerCase()
  },
  /** Auto-renewable monthly subscriptions. */
  get candidateProductIds() {
    return readList(process.env.APPLE_IAP_CANDIDATE_PRODUCT_IDS, [
      'com.pooelcentral.giveandtake.candidate.premium',
    ])
  },
  /** Non-renewing subscriptions: one payment for 12 months of Premium. */
  get candidateYearlyProductIds() {
    return readList(process.env.APPLE_IAP_CANDIDATE_YEARLY_PRODUCT_IDS, [
      'com.pooelcentral.giveandtake.candidate.yearly',
    ])
  },
}

export const GOOGLE_PLAY_IAP = {
  get packageName() {
    return process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.evpitchrecruitment.careers'
  },
  get candidateProductIds() {
    return readList(process.env.GOOGLE_PLAY_CANDIDATE_PRODUCT_IDS, ['candidate_monthly'])
  },
  /** Optional shared secret expected as ?token= on the Pub/Sub push URL. */
  get rtdnToken() {
    return process.env.GOOGLE_PLAY_RTDN_TOKEN || ''
  },
}

let applePrivateKey: string | undefined

/** The In-App Purchase key (.p8). Throws when a key path is set but unreadable. */
export const getApplePrivateKey = () => {
  applePrivateKey ??= readSecret(
    process.env.APPLE_IAP_PRIVATE_KEY,
    process.env.APPLE_IAP_PRIVATE_KEY_PATH
  ).replace(/\\n/g, '\n')
  return applePrivateKey
}

export interface GoogleServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

let googleServiceAccount: GoogleServiceAccount | null | undefined

/** Throws when the service account path is set but unreadable or not JSON. */
export const getGoogleServiceAccount = () => {
  if (googleServiceAccount === undefined) {
    const raw = readSecret(
      process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON,
      process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH
    )
    googleServiceAccount = raw ? (JSON.parse(raw) as GoogleServiceAccount) : null
  }
  return googleServiceAccount
}
