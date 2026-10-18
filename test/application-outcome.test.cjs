const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports) {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const context = { exports: {}, process: { env: {} }, console, require: name => imports[name] ?? {} };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
class AppError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}

function fixture({ conflict = false, forbidden = false, email = 'candidate@example.test' } = {}) {
  const sent = [], notices = [], events = [], writes = [];
  const candidate = { name: 'Alex Candidate', email, toString: () => 'candidate-id' };
  const mail = load('src/utils/sendEmail.ts', {
    nodemailer: { createTransport: () => ({ sendMail: async message => { sent.push(message); } }) },
    '../errors/AppError': AppError,
  });
  const controller = load('src/controllers/appliedJob.controller.ts', {
    '../utils/catchAsync': fn => fn,
    '../errors/AppError': AppError,
    'http-status': { OK: 200, BAD_REQUEST: 400 },
    '../utils/sendEmail': mail,
    '../models/appliedJob.model': { AppliedJob: {
      findById: async () => ({ jobId: 'job-id', userId: 'candidate-id' }),
      findOneAndUpdate(filter, update) {
        writes.push({ filter, update });
        const value = conflict ? null : {
          _id: 'application-id', __v: 1, status: update.$set.status,
          jobId: { title: 'Engineer <Remote> & QA' }, userId: candidate,
        };
        return { populate() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
      },
    } },
    '../services/candidateAccess.service': {
      assertCanManageJob: async () => { if (forbidden) throw new AppError(403, 'Not allowed'); },
      assertVisibleAccount: async () => {},
    },
    '../sockets/notification.service': { createNotification: async notice => { notices.push(notice); return notice; } },
    '../models/notification.model': { Notification: { countDocuments: async () => 1 } },
    '../server': { io: { to: room => ({ emit: (...args) => events.push({ room, args }) }) } },
  });
  const res = { status() { return this; }, json(body) { this.body = body; } };
  const run = status => controller.updateApplicationStatus({
    params: { id: 'application-id' }, user: { _id: 'manager-id' }, body: { status, expectedVersion: 0 },
  }, res);
  return { run, sent, notices, events, writes, res };
}

test('unsuccessful outcome preserves the stored status and emails the same candidate-facing notification', async () => {
  const f = fixture();
  await f.run('REJECTED');
  assert.equal(f.writes[0].update.$set.status, 'rejected');
  assert.equal(f.res.body.data.status, 'rejected');
  assert.equal(f.notices.length, 1);
  assert.match(f.notices[0].message, /has been unsuccessful/);
  assert.equal(f.events[0].room, 'candidate-id');
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].to, 'candidate@example.test');
  assert.match(f.sent[0].subject, /^Application Unsuccessful/);
  assert.match(f.sent[0].html, /Application Unsuccessful/);
  assert.match(f.sent[0].html, /has been unsuccessful/);
  assert.doesNotMatch(f.sent[0].subject + f.sent[0].html + f.notices[0].message, /rejected/i);
  assert.match(f.sent[0].html, /Engineer &lt;Remote&gt; &amp; QA/);
  assert.doesNotMatch(f.sent[0].html, /<Remote>/);
});

test('shortlisted outcomes send their own email without unsuccessful wording', async () => {
  const f = fixture();
  await f.run('shortlisted');
  assert.equal(f.sent.length, 1);
  assert.match(f.sent[0].subject, /^Application Shortlisted/);
  assert.match(f.sent[0].html, /forwarded to the hiring manager/);
  assert.doesNotMatch(f.sent[0].html, /unsuccessful|rejected/i);
});

test('pending updates retain notifications without sending an outcome email', async () => {
  const f = fixture();
  await f.run('pending');
  assert.equal(f.sent.length, 0);
  assert.equal(f.notices.length, 1);
});

for (const [name, options, statusCode] of [
  ['concurrent update', { conflict: true }, 409],
  ['unauthorized manager', { forbidden: true }, 403],
]) {
  test(`${name} sends neither an outcome email nor notification`, async () => {
    const f = fixture(options);
    await assert.rejects(f.run('rejected'), { statusCode });
    assert.equal(f.sent.length, 0);
    assert.equal(f.notices.length, 0);
  });
}

test('a missing candidate email does not undo the application update or notification', async () => {
  const f = fixture({ email: '' });
  await f.run('rejected');
  assert.equal(f.sent.length, 0);
  assert.equal(f.notices.length, 1);
  assert.equal(f.res.body.data.status, 'rejected');
});
