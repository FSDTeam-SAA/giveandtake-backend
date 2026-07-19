import Stripe from 'stripe'
import { stripe, STRIPE_WEBHOOK_SECRET } from '../config/stripe'

/**
 * Stripe works in the smallest currency unit (cents for USD), so every amount
 * that crosses the boundary is converted here rather than at each call site.
 */
export const toMinorUnits = (amount: number) => Math.round(amount * 100)
export const fromMinorUnits = (amount: number) => Number((amount / 100).toFixed(2))

export const createPaymentIntent = async ({
  amount,
  metadata,
  description,
  receiptEmail,
  idempotencyKey,
}: {
  amount: number
  metadata: Record<string, string>
  description?: string
  receiptEmail?: string
  idempotencyKey?: string
}) => {
  return stripe.paymentIntents.create(
    {
      amount: toMinorUnits(amount),
      currency: 'usd',
      // Lets Stripe surface every payment method enabled on the account
      // (card, Link, wallets) without hardcoding a list here.
      automatic_payment_methods: { enabled: true },
      metadata,
      ...(description ? { description } : {}),
      ...(receiptEmail ? { receipt_email: receiptEmail } : {}),
    },
    idempotencyKey ? { idempotencyKey } : undefined
  )
}

export const retrievePaymentIntent = async (paymentIntentId: string) => {
  return stripe.paymentIntents.retrieve(paymentIntentId)
}

/**
 * Refunds against the PaymentIntent id we persist as `transactionId`.
 * Stripe resolves the underlying charge itself.
 */
export const refundPaymentIntent = async (
  paymentIntentId: string,
  amount: number
) => {
  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: toMinorUnits(amount),
  })
}

export const constructWebhookEvent = (
  payload: Buffer | string,
  signature: string
): Stripe.Event => {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
  }
  return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET)
}
