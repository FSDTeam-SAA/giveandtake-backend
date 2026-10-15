const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const mongoose = require('mongoose');
const sift = require('sift').default;

class AppError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}
function load(file, requireModule) {
  const source = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const context = { exports: {}, require: requireModule, Date, console, process: { env: {} } };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
const lifecycle = load('../src/utils/jobLifecycle.ts', () => AppError);
const now = new Date('2026-10-10T12:00:00Z');
const live = { status: 'active', adminApprove: true, jobApprove: 'approved',
  publishDate: new Date('2026-05-19'), deadline: new Date('2099-06-18'), applicationRequirement: [] };

test('availability blocks expired, pending, denied, archived, scheduled and deactivated jobs', () => {
  assert.equal(lifecycle.getJobAvailability(live, now).canApply, true);
  for (const patch of [
    { deadline: new Date('2026-06-18') }, { deadline: now },
    { adminApprove: false }, { jobApprove: 'pending' }, { jobApprove: 'denied' },
    { arcrivedJob: true }, { publishDate: new Date('2099-01-01') },
    { status: 'deactivate' }, { deadline: 'invalid-date' },
  ]) {
    const job = { ...live, ...patch };
    assert.equal(lifecycle.getJobAvailability(job, now).canApply, false);
    assert.throws(() => lifecycle.assertJobAcceptsApplications(job, now), e => e.statusCode === 403);
  }
});

test('legacy expiry aliases work while jobs without a deadline retain their behavior', () => {
  const legacy = { ...live, deadline: null, expiryDate: new Date('2026-06-18') };
  assert.equal(lifecycle.getJobAvailability(legacy, now).displayStatus, 'expired');
  assert.equal(lifecycle.getJobAvailability(legacy, now).canApply, false);
  assert.equal(lifecycle.getJobAvailability({ ...live, deadline: null }, now).canApply, true);
});

test('public filters agree with availability across legacy dates, approval and publication windows', () => {
  const base = { ...live, arcrivedJob: false };
  const documents = [base, ...[
    { deadline: new Date('2026-06-18') }, { deadline: now },
    { deadline: null, expiryDate: new Date('2026-06-18') },
    { deadline: undefined, expiryDate: new Date('2026-06-18') },
    { deadline: null, expiryDate: null }, { deadline: undefined, expiryDate: undefined },
    { deadline: undefined, expiryDate: new Date('2099-06-18') },
    { deadline: new Date('2099-06-18'), expiryDate: new Date('2026-06-18') },
    { adminApprove: false }, { jobApprove: 'pending' }, { jobApprove: 'denied' },
    { arcrivedJob: true }, { status: 'deactivate' }, { publishDate: new Date('2099-01-01') },
    { publishDate: null },
  ].map(patch => ({ ...base, ...patch }))];
  const matches = sift(lifecycle.buildLiveJobFilter(now));
  for (const job of documents) {
    assert.equal(matches(job), lifecycle.getJobAvailability(job, now).canApply, JSON.stringify(job));
  }
});

test('a single-job response preserves old status while exposing expiry and availability', () => {
  const { Job } = load('../src/models/job.model.ts', name => name === 'mongoose' ? mongoose : lifecycle);
  const job = new Job({ ...live, title: 'OSP Supervisor', deadline: new Date('2026-06-18') });
  const json = job.toJSON();
  assert.equal(json.status, 'active');
  assert.equal(json.displayStatus, 'expired');
  assert.equal(json.canApply, false);
  assert.match(json.applicationClosedReason, /expired/);
});

function applicationController(job, { duringEntitlement } = {}) {
  const effects = { resumes: 0, applications: 0, updates: 0, notifications: 0 };
  const controller = load('../src/controllers/appliedJob.controller.ts', name => {
    if (name === '../utils/catchAsync') return fn => fn;
    if (name === '../utils/jobLifecycle') return lifecycle;
    if (name === '../errors/AppError') return AppError;
    if (name === 'http-status') return { UNAUTHORIZED: 401, CONFLICT: 409, NOT_FOUND: 404, CREATED: 201 };
    if (name === '../models/appliedJob.model') return { AppliedJob: {
      findOne: async () => null,
      create: async () => { effects.applications++; return { _id: 'application' }; },
    } };
    if (name === '../models/job.model') return { Job: {
      findById: () => ({ populate: async () => job }),
      findByIdAndUpdate: async () => { effects.updates++; },
    } };
    if (name === '../models/createResume.model') return { CreateResume: {
      findOne: async () => { effects.resumes++; return { firstName: 'Test', lastName: 'Candidate', email: 'test@mail.com', country: 'UK', city: 'London' }; },
    } };
    if (name === '../helper/elevatorPitchApplicationAccess') return {
      assertUserCanApplyWithElevatorPitch: async () => duringEntitlement?.(),
    };
    if (name === '../models/user.model') return { User: { findById: () => ({ select: async () => ({ name: 'Candidate' }) }) } };
    if (name === '../models/notification.model') return { Notification: { countDocuments: async () => 0 } };
    if (name === '../sockets/notification.service') return { createNotification: async () => { effects.notifications++; } };
    if (name === '../server') return { io: { to: () => ({ emit() {} }) } };
    return {};
  });
  const request = { user: { _id: 'candidate', role: 'candidate' }, body: { jobId: 'job' } };
  const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  return { run: () => controller.applyForJob(request, response), effects, response };
}

test('direct submissions from old clients cannot create applications or notifications for unavailable jobs', async () => {
  for (const patch of [
    { deadline: new Date('2026-06-18') }, { adminApprove: false },
    { jobApprove: 'denied' }, { arcrivedJob: true },
    { publishDate: new Date('2099-01-01') }, { status: 'deactivate' },
  ]) {
    const app = applicationController({ ...live, userId: 'owner', ...patch });
    await assert.rejects(app.run(), e => e.statusCode === 403);
    assert.deepEqual(app.effects, { resumes: 0, applications: 0, updates: 0, notifications: 0 });
  }
});

test('an extended job can accept applications only after admin approves it again', async () => {
  const job = { ...live, userId: 'owner', deadline: new Date('2026-06-18') };
  Object.assign(job, lifecycle.resolveJobDatePatch(job, { deadline: '2099-07-01', extendExpiry: true }, now),
    { adminApprove: false, jobApprove: 'pending' });
  await assert.rejects(applicationController(job).run(), e => e.statusCode === 403);
  Object.assign(job, { adminApprove: true, jobApprove: 'approved' });
  const app = applicationController(job);
  await app.run();
  assert.equal(app.response.statusCode, 201);
  assert.equal(app.effects.applications, 1);
  assert.equal(app.effects.updates, 1);
});

test('expiry reached during application checks is rejected before any write', async () => {
  const job = { ...live, userId: 'owner' };
  const app = applicationController(job, { duringEntitlement: () => { job.deadline = new Date('2020-01-01'); } });
  await assert.rejects(app.run(), e => e.statusCode === 403 && /expired/.test(e.message));
  assert.equal(app.effects.applications, 0);
  assert.equal(app.effects.updates, 0);
  assert.equal(app.effects.notifications, 0);
});
