const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { validateFieldLimits, fieldLimits } = require('../src/middlewares/fieldLimits');

test('API accepts exact boundaries and rejects overflow or non-text before writes', () => {
  for (const [kind, key, max] of [['contact', 'firstName', 20], ['contact', 'lastName', 40], ['recruiter', 'firstName', 20], ['recruiter', 'sureName', 40], ['job', 'title', 100], ['company', 'cname', 160], ['skill', 'name', 100], ['register', 'firstName', 20], ['register', 'lastName', 40]]) {
    validateFieldLimits(kind, { [key]: 'A'.repeat(max) });
    for (const value of ['A'.repeat(max + 1), ['invalid'], 123]) {
      let writes = 0;
      fieldLimits(kind)({ body: { [key]: value } }, {}, error => {
        if (!error) writes++;
        assert.equal(error.statusCode, 400);
      });
      assert.equal(writes, 0);
    }
  }
});

test('multipart create and edit payloads validate nested values and malformed JSON', () => {
  validateFieldLimits('resume', { resume: JSON.stringify({ firstName: 'A'.repeat(20), lastName: 'B'.repeat(40), title: 'T'.repeat(100), skills: ['React', 'A'.repeat(78)] }), experiences: JSON.stringify([{ company: 'C'.repeat(160), position: 'P'.repeat(100) }]) });
  for (const body of [{ resume: '{' }, { resume: '[]' }, { resume: JSON.stringify({ firstName: 'A'.repeat(21) }) }, { resume: JSON.stringify({ skills: [undefined] }) }, { experiences: JSON.stringify([{ position: 'P'.repeat(101) }]) }, { experiences: JSON.stringify([{ company: 'C'.repeat(161) }]) }, { resume: JSON.stringify({ skills: ['A'.repeat(101)] }) }]) {
    assert.throws(() => validateFieldLimits('resume', body), error => error.statusCode === 400);
  }
});

test('legacy full-name clients remain supported, and untouched old fields are not revalidated', () => {
  validateFieldLimits('register', { name: 'A'.repeat(61), role: 'candidate' });
  validateFieldLimits('register', { name: 'A'.repeat(160), role: 'company' });
  assert.throws(() => validateFieldLimits('register', { name: 'A'.repeat(62), role: 'candidate' }));
  validateFieldLimits('resume', { resume: JSON.stringify({ aboutUs: 'Updated bio' }) });
  validateFieldLimits('resume', { experiences: JSON.stringify([{ type: 'delete', position: 'P'.repeat(101) }]) });
  validateFieldLimits('job', { adminApprove: true });
  validateFieldLimits('company', { honors: JSON.stringify([{ description: 'Legacy'.repeat(1000) }]) });
});
