const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const fixtures = require('./fixtures/profile-history.json');

function load(file, imports = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const context = { exports: {}, Date, process: { env: {} }, require: name => imports[name] ?? {} };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
const history = load('src/utils/profileHistory.ts');
for (const [kind, { items, expected }] of Object.entries(fixtures)) {
  test(`${kind}: current entries and real dates sort consistently without writes`, () => {
    const before = JSON.stringify(items);
    assert.deepEqual(Array.from(history.sortHistory(items, kind), row => row.id), expected);
    assert.equal(JSON.stringify(items), before);
  });
}

test('private and public resume reads return ordered histories without changing records', async () => {
  const { resumeOfaUser, resumeOfaUser1 } = load('src/controllers/createResume.controller.ts', {
    '../utils/profileHistory': history,
    '../utils/sendResponse': (res, body) => res.json(body),
    'http-status': { OK: 200 },
    '../models/user.model': { User: { findOne: () => ({ select: async () => ({ _id: 'owner' }) }) } },
    '../models/createResume.model': { CreateResume: { findOne: async () => ({ _id: 'resume' }) } },
    '../models/experience.model': { Experience: { find: async ({ userId }) => { assert.equal(userId, 'owner'); return fixtures.experience.items; } } },
    '../models/education.model': { Education: { find: async () => fixtures.education.items } },
    '../models/awardsAndHonor.model': { AwardsAndHonor: { find: async () => fixtures.award.items } },
    '../services/candidatePitchEntitlement.service': { getAvailableCandidatePitch: async () => null },
  });
  for (const handler of [resumeOfaUser, resumeOfaUser1]) {
    const result = await new Promise((resolve, reject) => handler(
      { user: { _id: 'owner' }, params: { slug: 'candidate' } },
      { json: resolve }, reject,
    ));
    assert.equal(result.data.resume._id, 'resume');
    assert.deepEqual(Array.from(result.data.experiences, row => row.id), fixtures.experience.expected);
    assert.deepEqual(Array.from(result.data.education, row => row.id), fixtures.education.expected);
    assert.deepEqual(Array.from(result.data.awardsAndHonors, row => row.id), fixtures.award.expected);
  }
});
