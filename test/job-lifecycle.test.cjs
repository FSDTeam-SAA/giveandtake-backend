const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const mongoose = require('mongoose');

class AppError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}
function load(file, requireModule) {
  const source = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  const context = { exports: {}, require: requireModule, console, Date, process: { env: {} } };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
const lifecycle = load('../src/utils/jobLifecycle.ts', () => AppError);
const now = new Date('2026-10-08T12:00:00Z');
const expired = { publishDate: new Date('2026-09-01T12:00:00Z'), deadline: new Date('2026-10-01T12:00:00Z'), adminApprove: true, jobApprove: 'approved' };
const future = '2026-11-08T12:00:00.000Z';

test('extension synchronizes aliases while preserving publication and requiring approval for visibility', () => {
  const patch = lifecycle.resolveJobDatePatch(expired, { deadline: future, extendExpiry: true }, now);
  assert.equal(patch.deadline.toISOString(), future);
  assert.equal(patch.expiryDate.toISOString(), future);
  assert.equal(patch.publishDate, undefined);
  assert.equal(lifecycle.getJobDisplayStatus(expired, now), 'expired');
  const edited = { ...expired, ...patch, adminApprove: false, jobApprove: 'pending' };
  assert.equal(lifecycle.getJobDisplayStatus(edited, now), 'pending');
  assert.equal(lifecycle.getJobDisplayStatus({ ...edited, adminApprove: true, jobApprove: 'approved' }, now), 'published');
});

test('ordinary edits and approval decisions preserve even an expired deadline', () => {
  for (const body of [{ title: 'Changed title' }, { adminApprove: true }]) {
    assert.equal(Object.keys(lifecycle.resolveJobDatePatch(expired, body, now)).length, 0);
  }
  const patch = lifecycle.resolveJobDatePatch(expired, { deadline: expired.deadline.toISOString(), publishDate: expired.publishDate.toISOString() }, now);
  assert.equal(patch.deadline.getTime(), expired.deadline.getTime());
});

test('legacy explicit aliases and duration-only edits remain supported', () => {
  for (const field of ['deadline', 'expiryDate', 'expiaryDate']) {
    assert.equal(lifecycle.resolveJobDatePatch(expired, { [field]: future }, now).deadline.toISOString(), future);
  }
  assert.equal(lifecycle.resolveJobDatePatch(expired, { deadline: future, expiryDate: future, expirationDate: '7' }, now).deadline.toISOString(), future);
  assert.equal(lifecycle.resolveJobDatePatch(expired, { expirationDate: '90' }, now).deadline.toISOString(), '2026-11-30T12:00:00.000Z');
});

test('rejects invalid dates, conflicting aliases, expired extensions, shortening, and expiry before publication', () => {
  for (const body of [
    { deadline: 'not-a-date' }, { deadline: null },
    { deadline: future, expiryDate: '2026-11-09T12:00:00Z' },
    { deadline: '2026-10-07T12:00:00Z' },
    { deadline: future, publishDate: '2026-12-01T12:00:00Z' },
    { deadline: expired.deadline.toISOString(), extendExpiry: true },
    { deadline: future, extendExpiry: true, publishDate: now.toISOString() },
    { expirationDate: -1 }, { expirationDate: 1.5 }, { expirationDate: Infinity },
  ]) assert.throws(() => lifecycle.resolveJobDatePatch(expired, body, now), error => error.statusCode === 400);
  assert.throws(() => lifecycle.resolveJobDatePatch({ ...expired, deadline: new Date('2026-12-01') }, { deadline: future, extendExpiry: true }, now));
});

test('status precedence matches admin inventory, including denied and archived jobs', () => {
  assert.equal(lifecycle.getJobDisplayStatus({ ...expired, arcrivedJob: true }, now), 'archived');
  const live = { ...expired, deadline: new Date(future) };
  assert.equal(lifecycle.getJobDisplayStatus({ ...live, jobApprove: 'denied' }, now), 'denied');
  assert.equal(lifecycle.getJobDisplayStatus({ ...live, publishDate: new Date('2026-10-09'), adminApprove: false }, now), 'pending');
  assert.equal(lifecycle.getJobDisplayStatus({ ...live, publishDate: new Date('2026-10-09') }, now), 'scheduled');
});

const { Job } = load('../src/models/job.model.ts', name => name === 'mongoose' ? mongoose : lifecycle);
function controllerFor(job) {
  return load('../src/controllers/job.controller.ts', name => {
    if (name === '../utils/jobLifecycle') return lifecycle;
    if (name === '../utils/catchAsync') return handler => handler;
    if (name === '../errors/AppError') return AppError;
    if (name === 'http-status') return { BAD_REQUEST: 400, FORBIDDEN: 403, OK: 200 };
    if (name === '../models/user.model') return { User: { findById: async () => ({ role: 'recruiter' }) } };
    if (name === '../models/recruiterAccount.model') return { RecruiterAccount: { findOne: async () => ({ _id: 'recruiter' }) } };
    if (name === '../models/job.model') return { Job: {
      findById: () => ({ then: (resolve, reject) => Promise.resolve(job).then(resolve, reject), populate: async () => job }),
      findByIdAndUpdate: async (_, body) => { job.set(body); return job; },
    } };
    if (name === '../models/following.model') return { Following: { find: () => ({ populate: async () => [] }) } };
    if (name === '../utils/sendResponse') return (_, response) => response;
    if (name === '../services/embedding.service') return { applyJobEmbeddingToDoc: async () => false };
    if (name === '../sockets/notification.service') return { createNotification: async () => ({}) };
    if (name === '../models/notification.model') return { Notification: { countDocuments: async () => 0 } };
    if (name === '../server') return { io: { to: () => ({ emit() {} }) } };
    return {};
  });
}
test('edit endpoint saves a minimal extension, resets approval/reminders, preserves unrelated fields and legacy blank optionals', async () => {
  const userId = new mongoose.Types.ObjectId();
  const job = new Job({ ...expired, userId, title: 'Original title', description: 'Legacy short description', salaryRange: 'GBP 40000', responsibilities: ['Keep this'], career_Stage: 'Career Returner', billingPlanType: 'free', expiryReminderSentAt: now });
  let saves = 0;
  job.save = async options => { await job.validate(undefined, options); saves++; return job; };
  const controller = controllerFor(job);
  await controller.editJob({ params: { id: 'job' }, body: { userId: userId.toString(), deadline: '2099-11-08T12:00:00Z', extendExpiry: true, career_Stage: '', jobCategoryId: '' } }, {});
  assert.equal(saves, 1);
  assert.equal(job.publishDate.getTime(), expired.publishDate.getTime());
  assert.equal(job.expiryDate.getTime(), job.deadline.getTime());
  assert.equal(job.adminApprove, false);
  assert.equal(job.jobApprove, 'pending');
  assert.equal(job.expiryReminderSentAt, null);
  assert.equal(job.title, 'Original title');
  assert.equal(job.salaryRange, 'GBP 40000');
  assert.equal(job.career_Stage, 'Career Returner');
  assert.deepEqual([...job.responsibilities], ['Keep this']);
  assert.equal(job.toJSON().displayStatus, 'pending');
});

test('admin approval makes an extended job published without moving either date', async () => {
  const job = new Job({ userId: new mongoose.Types.ObjectId(), title: 'Awaiting approval',
    description: 'Legacy', publishDate: expired.publishDate, deadline: new Date('2099-11-08'),
    expiryDate: new Date('2099-11-08'), adminApprove: false, jobApprove: 'pending' });
  const publishTime = job.publishDate.getTime();
  const expiryTime = job.deadline.getTime();
  assert.equal(job.toJSON().displayStatus, 'pending');
  await controllerFor(job).updateJob({ params: { id: 'job' }, body: { adminApprove: true } }, {});
  assert.equal(job.adminApprove, true);
  assert.equal(job.jobApprove, 'approved');
  assert.equal(job.toJSON().displayStatus, 'published');
  assert.equal(job.publishDate.getTime(), publishTime);
  assert.equal(job.deadline.getTime(), expiryTime);
  assert.equal(job.expiryDate.getTime(), expiryTime);
});

test('PAYG limits still reject extensions without saving or resetting approval', async () => {
  for (const paidUntil of ['2020-01-01', '2099-01-01']) {
    const userId = new mongoose.Types.ObjectId();
    const job = new Job({ ...expired, userId, title: 'PAYG', description: 'Legacy', billingPlanType: 'payg', paygStartedAt: new Date('2020-01-01'), paygExpiresAt: new Date(paidUntil) });
    job.save = async () => { throw new Error('must not save'); };
    await assert.rejects(controllerFor(job).editJob({ params: { id: 'job' }, body: { userId: userId.toString(), deadline: '2099-11-08T12:00:00Z', extendExpiry: true } }, {}), error => error.statusCode === 403);
    assert.equal(job.adminApprove, true);
  }
});
