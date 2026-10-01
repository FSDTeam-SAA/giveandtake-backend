const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relativePath, requireModule = require) {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const context = { exports: {}, require: requireModule, process: { env: {} } };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
const words = count => Array(count).fill('word').join(' ');

for (const [name, file] of [
  ['web', '../../evpitch-frontend/lib/job-description-policy.ts'],
  ['backend', '../src/utils/jobDescriptionPolicy.ts'],
]) {
  const policy = load(file);
  test(`${name}: minimum applies to visible words, including rich text and entities`, () => {
    assert.match(policy.getJobDescriptionError(words(19)), /at least 20 words/);
    assert.equal(policy.getJobDescriptionError(words(20)), null);
    assert.equal(policy.getJobDescriptionError('<p>' + words(20).replaceAll(' ', '&nbsp;') + '</p>'), null);
    assert.equal(policy.getJobDescriptionCounts('<p>one</p><p>two</p>').words, 2);
    assert.equal(policy.getJobDescriptionCounts('<p>wo<strong>rd</strong></p>').words, 1);
    assert.equal(policy.getJobDescriptionCounts('<p>&#160; &#xA0;</p>').words, 0);
    assert.equal(policy.getJobDescriptionCounts('<script>' + words(30) + '</script>').words, 0);
    assert.match(policy.getJobDescriptionError('<p><br></p>'), /required/);
  });
  test(`${name}: accepts 2000 visible characters and rejects 2001`, () => {
    const exact = words(20) + 'x'.repeat(2000 - words(20).length);
    assert.equal(policy.getJobDescriptionError(`<p><strong>${exact}</strong></p>`), null);
    assert.match(policy.getJobDescriptionError(exact + 'x'), /2000 characters/);
  });
}

const policy = load('../src/utils/jobDescriptionPolicy.ts');
test('web creation schema uses the same limits as the edit save guard', () => {
  const webPolicy = load('../../evpitch-frontend/lib/job-description-policy.ts');
  const { jobDescriptionSchema } = load('../../evpitch-frontend/types/job.ts', name =>
    name === '@/lib/job-description-policy' ? webPolicy : require(name));
  for (const description of [words(19), words(20), '<p><br></p>', `<p>${words(20)}</p>`]) {
    assert.equal(jobDescriptionSchema.safeParse(description).success,
      webPolicy.getJobDescriptionError(description) === null);
  }
});

const reachedData = new Error('reached data layer');
class AppError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}
const controller = load('../src/controllers/job.controller.ts', name => {
  if (name === '../utils/jobDescriptionPolicy') return policy;
  if (name === '../utils/catchAsync') return handler => handler;
  if (name === '../errors/AppError') return AppError;
  if (name === 'http-status') return { BAD_REQUEST: 400 };
  if (name === '../models/user.model') return { User: { findById() { throw reachedData; } } };
  if (name === '../models/job.model') return { Job: { findById() { throw reachedData; } } };
  return {};
});
for (const endpoint of ['createJob', 'editJob', 'updateJob']) {
  test(`${endpoint}: rejects invalid descriptions before any data or notification changes`, async () => {
    for (const description of [words(19), '<p><br></p>', null, 123, words(20) + 'x'.repeat(2000)]) {
      await assert.rejects(controller[endpoint]({ params: { id: 'job' }, body: {
        userId: 'user', title: 'Job', description,
      } }, {}), error => error.statusCode === 400);
    }
    await assert.rejects(controller[endpoint]({ params: { id: 'job' }, body: {
      userId: 'user', title: 'Job', description: words(20),
    } }, {}), error => error === reachedData);
  });
}
test('partial edits and admin decisions without a description retain their existing flow', async () => {
  for (const endpoint of ['editJob', 'updateJob']) {
    await assert.rejects(controller[endpoint]({ params: { id: 'job' }, body: {
      userId: 'user', adminApprove: true,
    } }, {}), error => error === reachedData);
  }
});
