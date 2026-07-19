// config/stripe.ts
import Stripe from 'stripe'
import dotenv from 'dotenv'

dotenv.config()

const secretKey = process.env.STRIPE_SECRET_KEY

if (!secretKey) {
  console.warn(
    '[stripe] STRIPE_SECRET_KEY is not set. Stripe endpoints will fail until it is configured.'
  )
}

/**
 * Single shared Stripe client. The API version is intentionally omitted so the
 * account default (set in the Stripe dashboard) is used, which keeps the SDK
 * and dashboard in sync without needing a code change on every API release.
 */
export const stripe = new Stripe(secretKey || '')

export const isStripeConfigured = () => Boolean(secretKey)

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''
