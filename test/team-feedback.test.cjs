require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateFieldLimits, fieldLimits, emailFieldLimits } = require('../src/middlewares/fieldLimits');
const { normalizeAwardInput } = require('../src/utils/awardInput');

for (const [kind, key, max] of [
  ['resume', 'aboutUs', 1400], ['company', 'aboutUs', 1400], ['recruiter', 'bio', 1400],
  ['experience', 'jobDescription', 1400], ['experience', 'position', 100],
  ['job', 'title', 100], ['award', 'description', 500], ['contact', 'subject', 50],
  ['contact', 'message', 500], ['contact', 'address', 254], ['register', 'email', 254],
  ['resume', 'email', 254], ['company', 'cemail', 254], ['recruiter', 'emailAddress', 254],
]) test(`${kind}.${key}: exact ${max}-character boundary and bypass protection`, () => {
  validateFieldLimits(kind, { [key]: 'A'.repeat(max) });
  for (const value of ['A'.repeat(max + 1), 'word '.repeat(max), ['text'], { $gt: '' }]) {
    let writes = 0;
    fieldLimits(kind)({ body: { [key]: value } }, {}, error => {
      if (!error) writes++;
      assert.equal(error.statusCode, 400);
    });
    assert.equal(writes, 0);
  }
});

test('multipart create/edit validates nested experience, awards and credential names', () => {
  for (const [key, value, overflow] of [
    ['experiences', { jobDescription: 'A'.repeat(1400) }, { jobDescription: 'A'.repeat(1401) }],
    ['awardsAndHonors', { description: 'A'.repeat(500) }, { description: 'A'.repeat(501) }],
  ]) {
    validateFieldLimits('resume', { [key]: JSON.stringify([value]) });
    assert.throws(() => validateFieldLimits('resume', { [key]: JSON.stringify([overflow]) }), /characters/);
    validateFieldLimits('resume', { [key]: JSON.stringify([{ ...overflow, type: 'delete' }]) });
  }
  validateFieldLimits('resume', { resume: JSON.stringify({ certifications: ['A'.repeat(100)], languages: ['A'.repeat(50)] }) });
  for (const resume of [{ certifications: ['A'.repeat(101)] }, { languages: ['A'.repeat(51)] }]) {
    assert.throws(() => validateFieldLimits('resume', { resume: JSON.stringify(resume) }), /characters/);
  }
});

test('rich About counts visible text while keeping the stored HTML intact', () => {
  const body = { aboutUs: `<p><strong>${'A'.repeat(1400)}</strong></p>` };
  const original = JSON.stringify(body);
  validateFieldLimits('company', body);
  assert.equal(JSON.stringify(body), original);
  assert.throws(() => validateFieldLimits('company', { aboutUs: `<p>${'A'.repeat(1401)}</p>` }), /1400 characters/);
  // Partial updates do not read, truncate or rewrite unrelated legacy fields.
  validateFieldLimits('resume', { resume: JSON.stringify({ city: 'London' }) });
});

test('global email guard covers login, recovery, account and newsletter request shapes', () => {
  for (const key of ['email', 'emailAddress', 'cemail', 'newEmail']) {
    emailFieldLimits({ body: { [key]: 'a'.repeat(254) } }, {}, error => assert.equal(error, undefined));
    for (const value of ['a'.repeat(255), ['x'], { $ne: null }]) {
      emailFieldLimits({ body: { [key]: value } }, {}, error => assert.equal(error.statusCode, 400));
    }
  }
});

test('award programme names survive legacy web/mobile spellings and unrelated edits', () => {
  const { AwardsAndHonor } = require('../src/models/awardsAndHonor.model');
  for (const key of ['programName', 'programeName', 'issuer']) {
    const input = { title: 'Merit', [key]: 'Design Council', description: 'Saved description' };
    const before = JSON.stringify(input);
    const stored = new AwardsAndHonor(normalizeAwardInput(input)).toObject();
    assert.equal(stored.programeName, 'Design Council');
    assert.equal(stored.description, input.description);
    assert.equal(JSON.stringify(input), before);
  }
  assert.equal(normalizeAwardInput({ programeName: '', programName: 'Old name' }).programeName, '');
  assert.equal(Object.hasOwn(normalizeAwardInput({ description: 'Updated' }), 'programeName'), false);
});
