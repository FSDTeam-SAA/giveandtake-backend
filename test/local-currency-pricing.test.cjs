require('ts-node/register/transpile-only')
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy'
const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const {
  resolvePlanPrice,
  sanitizeLocalPrices,
  normalizeCurrency,
  formatMoney,
} = require('../src/utils/currency')

const monthly = {
  _id: 'plan-monthly',
  title: 'Premium One-Month Plan',
  price: 6.99,
  valid: 'PayAsYouGo',
  for: 'candidate',
  localPrices: { GBP: 6.99, EUR: 7.99, CAD: 9.99, AUD: 9.99 },
}

/* ------------------------------ helpers ------------------------------ */

test('a supported local currency uses the plan price for that currency', () => {
  assert.deepEqual(resolvePlanPrice(monthly, 'GBP'), { currency: 'GBP', amount: 6.99 })
  assert.deepEqual(resolvePlanPrice(monthly, 'eur'), { currency: 'EUR', amount: 7.99 })
})

test('USD, unknown or unset currencies charge the USD base price', () => {
  for (const requested of ['USD', undefined, '', 'JPY', 'gbpx']) {
    assert.deepEqual(resolvePlanPrice(monthly, requested), { currency: 'USD', amount: 6.99 })
  }
})

test('a plan without a price for the currency falls back to USD, never a guessed amount', () => {
  const jobPackage = { price: 195.99 }
  assert.deepEqual(resolvePlanPrice(jobPackage, 'GBP'), { currency: 'USD', amount: 195.99 })
  assert.deepEqual(resolvePlanPrice({ price: 6.99, localPrices: { GBP: 0 } }, 'GBP'), {
    currency: 'USD',
    amount: 6.99,
  })
})

test('admin local prices are validated', () => {
  assert.deepEqual(sanitizeLocalPrices({ gbp: '6.99', EUR: 7.99, CAD: '' }), { GBP: 6.99, EUR: 7.99 })
  assert.equal(sanitizeLocalPrices(undefined), undefined)
  assert.deepEqual(sanitizeLocalPrices(null), {})
  assert.throws(() => sanitizeLocalPrices({ JPY: 1000 }), /Unsupported currency/)
  assert.throws(() => sanitizeLocalPrices({ GBP: -1 }), /positive/)
  assert.throws(() => sanitizeLocalPrices({ USD: 6.99 }), /Unsupported currency/)
  assert.throws(() => sanitizeLocalPrices([1]), /object/)
})

test('money is formatted with the right symbol', () => {
  assert.equal(normalizeCurrency(' gbp '), 'GBP')
  assert.equal(formatMoney(6.99, 'GBP'), '£6.99')
  assert.equal(formatMoney(79.99, 'USD'), '$79.99')
  assert.equal(formatMoney(89.99, 'EUR'), '€89.99')
})

/* --------------------------- payment flows --------------------------- */

const { SubscriptionPlan } = require('../src/models/subscriptionPlan.model')
const { User } = require('../src/models/user.model')
const { paymentInfo } = require('../src/models/paymentInfo.model')
const stripeService = require('../src/services/stripe.service')
const paypalService = require('../src/services/paypal.service')
const receipt = require('../src/utils/paymentReceipt')
const controller = require('../src/controllers/payment.controller')

const user = { _id: 'user-1', name: 'Test', email: 'test@example.com', role: 'candidate' }
let calls

beforeEach(() => {
  calls = {}
  SubscriptionPlan.findById = async () => monthly
  User.findById = async () => user
  paymentInfo.findOne = async () => null
  stripeService.createPaymentIntent = async (args) => {
    calls.intent = args
    return { id: 'pi_1', client_secret: 'secret', currency: args.currency.toLowerCase() }
  }
  paypalService.createOrder = async (amount, currency) => {
    calls.order = { amount, currency }
    return { id: 'order-1', links: [] }
  }
  paypalService.captureOrder = async () => calls.capture
  receipt.recordAndNotifyPayment = async (args) => {
    calls.recorded = args
    return { _id: 'payment-1' }
  }
})

const run = (handler, body) =>
  new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code
        return this
      },
      json(payload) {
        resolve({ status: this.statusCode, body: payload })
      },
    }
    const out = handler({ body }, res, reject)
    if (out && typeof out.catch === 'function') out.catch(reject)
  })

test('Stripe charges a UK buyer £6.99 taken from the plan, not from the client', async () => {
  const { body } = await run(controller.createStripePaymentIntent, {
    planId: 'plan-monthly',
    userId: 'user-1',
    currency: 'GBP',
    amount: 0.01,
  })
  assert.equal(calls.intent.amount, 6.99)
  assert.equal(calls.intent.currency, 'GBP')
  assert.equal(body.data.amount, 6.99)
  assert.equal(body.data.currency, 'GBP')
})

test('Stripe without a currency still charges $6.99 (existing behaviour)', async () => {
  await run(controller.createStripePaymentIntent, { planId: 'plan-monthly', userId: 'user-1' })
  assert.deepEqual([calls.intent.amount, calls.intent.currency], [6.99, 'USD'])
})

test('PayPal order is priced on the server in the requested currency', async () => {
  const { body } = await run(controller.createPaypalOrder, {
    planId: 'plan-monthly',
    currency: 'EUR',
    amount: '0.01',
  })
  assert.deepEqual(calls.order, { amount: '7.99', currency: 'EUR' })
  assert.equal(body.data.currency, 'EUR')
})

const capture = (value, currency_code) => ({
  purchase_units: [
    { payments: { captures: [{ id: 'cap-1', status: 'COMPLETED', amount: { value, currency_code } }] } },
  ],
})

test('PayPal capture records a GBP payment with its USD equivalent', async () => {
  calls.capture = capture('6.99', 'GBP')
  const { status } = await run(controller.capturePaypalPayment, {
    orderId: 'order-1',
    userId: 'user-1',
    planId: 'plan-monthly',
  })
  assert.equal(status, 200)
  assert.equal(calls.recorded.amount, 6.99)
  assert.equal(calls.recorded.currency, 'GBP')
  assert.equal(calls.recorded.amountUsd, 6.99)
})

test('PayPal capture rejects a wrong amount or a currency the plan has no price for', async () => {
  for (const bad of [capture('5.00', 'GBP'), capture('6.99', 'JPY'), capture('7.99', 'USD')]) {
    calls.capture = bad
    calls.recorded = undefined
    const { status } = await run(controller.capturePaypalPayment, {
      orderId: 'order-1',
      userId: 'user-1',
      planId: 'plan-monthly',
    })
    assert.equal(status, 500)
    assert.equal(calls.recorded, undefined)
  }
})
