const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const scope = { exports: {}, require: name => imports[name] ?? {}, console, process: { env: {} } };
  vm.runInNewContext(code, scope); return scope.exports;
}
class AppError extends Error { constructor(statusCode, message) { super(message); this.statusCode = statusCode; } }
function fixture() {
  const job = { _id: 'job', title: 'Engineer', userId: 'manager', counter: 0, applicationRequirement: [] };
  const applications = [], notices = [], emails = [];
  const candidate = { _id: 'candidate', name: 'Mr. Alex Candidate', email: 'fixture@example.test' };
  const populated = value => ({ populate() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
  const controller = load('src/controllers/appliedJob.controller.ts', {
    '../utils/catchAsync': fn => fn, '../errors/AppError': AppError,
    'http-status': { CREATED: 201, OK: 200, CONFLICT: 409, NOT_FOUND: 404, UNAUTHORIZED: 401 },
    '../models/appliedJob.model': { AppliedJob: {
      findOne: async ({ jobId, userId }) => applications.find(row => row.jobId === jobId && row.userId === userId),
      create: async row => { const saved = { ...row, _id: 'application', __v: 0 }; applications.push(saved); return saved; },
      findById: async id => applications.find(row => row._id === id),
      findOneAndUpdate: (_filter, update) => {
        Object.assign(applications[0], update.$set);
        return populated({ ...applications[0], jobId: job, userId: candidate });
      },
      findByIdAndDelete: async id => { const i = applications.findIndex(row => row._id === id); return i < 0 ? null : applications.splice(i, 1)[0]; },
    } },
    '../models/job.model': { Job: {
      findById: () => populated(job),
      findByIdAndUpdate: async (_id, update) => { job.counter += update.$inc.counter; },
      findOneAndUpdate: async (filter, update) => { if (job.counter > filter.counter.$gt) job.counter += update.$inc.counter; },
    } },
    '../models/createResume.model': { CreateResume: { findOne: async () => ({ firstName: 'Mr. Alex', lastName: 'Candidate', email: candidate.email, country: 'UK', city: 'London' }) } },
    '../models/user.model': { User: { findById: () => ({ select: async () => candidate }) } },
    '../models/notification.model': { Notification: { countDocuments: async () => notices.length } },
    '../sockets/notification.service': { createNotification: async notice => notices.push(notice) },
    '../server': { io: { to: () => ({ emit() {} }) } },
    '../helper/elevatorPitchApplicationAccess': { assertUserCanApplyWithElevatorPitch: async () => {} },
    '../utils/jobLifecycle': { assertJobAcceptsApplications: () => {} },
    '../services/candidateAccess.service': { assertVisibleAccount: async () => {}, assertCanManageJob: async (_id, user) => { if (user._id !== 'manager') throw new AppError(403, 'Forbidden'); } },
    '../utils/sendEmail': { jobNotificationEmailTemplate: () => 'Fixture email', sendEmail: async (...args) => emails.push(args) },
  });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  return { job, applications, notices, emails, controller, res };
}
test('isolated apply, repeat, shortlist, reject and delete retain authoritative applicant counts', async () => {
  const f = fixture();
  const candidate = { _id: 'candidate', role: 'candidate' };
  await f.controller.applyForJob({ user: candidate, body: { jobId: 'job', answer: [] } }, f.res);
  assert.equal(f.res.code, 201); assert.equal(f.job.counter, 1); assert.equal(f.applications.length, 1);
  assert.equal(f.notices.length, 2);
  await assert.rejects(f.controller.applyForJob({ user: candidate, body: { jobId: 'job' } }, f.res), error => error.statusCode === 409);
  assert.equal(f.job.counter, 1); assert.equal(f.notices.length, 2);
  for (const status of ['shortlisted', 'rejected']) {
    await f.controller.updateApplicationStatus({ user: { _id: 'manager' }, params: { id: 'application' }, body: { status, expectedVersion: 0 } }, f.res);
    assert.equal(f.job.counter, 1); assert.equal(f.applications.length, 1);
  }
  assert.equal(f.emails.length, 2, 'Outcome emails are intercepted inside the fixture');
  await f.controller.deleteApplication({ user: candidate, params: { id: 'application' } }, f.res);
  assert.equal(f.job.counter, 0); assert.equal(f.applications.length, 0);
  await assert.rejects(f.controller.deleteApplication({ user: candidate, params: { id: 'application' } }, f.res), error => error.statusCode === 404);
  assert.equal(f.job.counter, 0);
});
test('unauthorized applicant requests create no applications, counts, notifications or emails', async () => {
  for (const user of [undefined, { _id: 'manager', role: 'company' }, { _id: 'manager', role: 'recruiter' }]) {
    const f = fixture();
    await assert.rejects(f.controller.applyForJob({ user, body: { jobId: 'job' } }, f.res));
    assert.equal(f.job.counter, 0); assert.equal(f.applications.length + f.notices.length + f.emails.length, 0);
  }
});
