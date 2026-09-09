require('ts-node/register/transpile-only')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { SubscriptionPlan } = require('../src/models/subscriptionPlan.model')
const { restoreJobPaygCatalog } = require('../src/services/jobPaygCatalog.service')

function catalog(t, records) {
  t.mock.method(SubscriptionPlan, 'find', query => ({ sort: async () => records.filter(p => p.for === query.for) }))
  const update = t.mock.method(SubscriptionPlan, 'updateOne', async () => ({ modifiedCount: 1 }))
  const create = t.mock.method(SubscriptionPlan, 'create', async plan => plan)
  return { update, create }
}

test('PAYG preview proposes two single-credit options without writing', async t => {
  const calls = catalog(t, [])
  const result = await restoreJobPaygCatalog()
  assert.deepEqual(result.map(p => [p.audience, p.price, p.credits]), [['company', 99.99, 1], ['recruiter', 99.99, 1]])
  assert.equal(calls.update.mock.callCount(), 0)
  assert.equal(calls.create.mock.callCount(), 0)
})

test('restoration reuses archived rows and their existing prices', async t => {
  const calls = catalog(t, ['company', 'recruiter'].map(audience => ({ _id: audience, for: audience, title: 'Pay as You Go', price: 109.99, archived: true, valid: 'PayAsYouGo' })))
  await restoreJobPaygCatalog(true)
  assert.equal(calls.create.mock.callCount(), 0)
  assert.equal(calls.update.mock.callCount(), 2)
  for (const call of calls.update.mock.calls) {
    assert.equal(call.arguments[1].$set.price, 109.99)
    assert.equal(call.arguments[1].$set.jobPostCredits, 1)
    assert.equal(call.arguments[1].$set.valid, 'credits')
    assert.equal(call.arguments[1].$set.archived, false)
  }
})

test('running restoration again preserves prices and allocations edited by admin', async t => {
  const calls = catalog(t, ['company', 'recruiter'].map(audience => ({ _id: audience, for: audience, title: 'Pay as You Go', price: 125, archived: false, valid: 'credits', jobPostCredits: 2 })))
  const result = await restoreJobPaygCatalog(true)
  assert.equal(calls.update.mock.callCount(), 0)
  assert.equal(calls.create.mock.callCount(), 0)
  assert.ok(result.every(p => p.action === 'unchanged' && p.price === 125 && p.credits === 2))
})

test('restoration refuses to guess between duplicate active PAYG rows', async t => {
  const calls = catalog(t, [1, 2].map(id => ({ _id: id, for: 'company', price: 99.99, valid: 'credits', archived: false })))
  await assert.rejects(restoreJobPaygCatalog(true), /Multiple active company PAYG plans/)
  assert.equal(calls.update.mock.callCount(), 0)
  assert.equal(calls.create.mock.callCount(), 0)
})
