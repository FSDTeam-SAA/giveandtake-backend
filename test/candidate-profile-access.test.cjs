const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports) {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const context = { exports: {}, process: { env: {} }, console,
    require: name => imports[name] ?? {} };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
class AppError extends Error { constructor(statusCode, message) { super(message); this.statusCode = statusCode; } }
const common = {
  '../errors/AppError': AppError,
  '../utils/catchAsync': fn => fn,
  'http-status': { OK: 200, BAD_REQUEST: 400, NOT_FOUND: 404, CONFLICT: 409 },
};
const response = () => ({ status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } });

test('deleting either image only clears the authenticated owner and cleans up its stored file', async () => {
  for (const image of ['photo', 'banner']) {
    let deleted, avatarCleared = false;
    await new Promise((resolve, reject) => {
      // This controller uses its own Express catchAsync wrapper.
      const res = { status() { return this; }, json() { resolve(); } };
      const handler = load('../src/controllers/createResume.controller.ts', {
        ...common,
        '../models/createResume.model': { CreateResume: { async findOneAndUpdate(filter, update) {
          assert.equal(filter.userId, 'owner'); assert.deepEqual(Object.keys(update.$unset), [image, image + 'Key']);
          return { photo: 'photo-url', photoKey: 'photo-key', banner: 'banner-url', bannerKey: 'banner-key' };
        } } },
        '../models/user.model': { User: { async updateOne(filter) {
          assert.equal(filter._id, 'owner'); assert.equal(filter['avatar.url'], 'photo-url'); avatarCleared = true;
        } } },
        '../utils/mediaUpload': { deleteMedia: async key => { deleted = key; } },
        '../utils/sendResponse': (_, body) => { assert.equal(body.statusCode, 200); resolve(); },
      });
      handler.deleteResumeImage({ user: { _id: 'owner' }, params: { image }, body: { userId: 'other-owner' } }, res, reject);
    });
    assert.equal(deleted, image + '-key');
    assert.equal(avatarCleared, image === 'photo');
  }
});

test('an absent profile image can be deleted again without touching another file', async () => {
  const controller = load('../src/controllers/createResume.controller.ts', {
    ...common,
    '../models/createResume.model': { CreateResume: { findOneAndUpdate: async () => null } },
    '../utils/mediaUpload': { deleteMedia() { assert.fail('no object to delete'); } },
    '../utils/sendResponse': (res, body) => res.json(body),
  });
  await new Promise((resolve, reject) => controller.deleteResumeImage(
    { user: { _id: 'owner' }, params: { image: 'banner' } }, { json: resolve }, reject));
  await new Promise(resolve => controller.deleteResumeImage(
    { user: { _id: 'owner' }, params: { image: 'password' } }, {}, error => {
      assert.equal(error.statusCode, 400); resolve();
    }));
});

test('two team members cannot overwrite each other using the same application version', async () => {
  const application = { _id: 'app', jobId: 'job', userId: 'candidate', __v: 0, status: 'pending' };
  let notifications = 0;
  const controller = load('../src/controllers/appliedJob.controller.ts', {
    ...common,
    '../models/appliedJob.model': { AppliedJob: {
      findById: async () => ({ ...application }),
      findOneAndUpdate(filter, update) {
        let result = null;
        if (filter.__v === application.__v) {
          application.status = update.$set.status; application.__v += update.$inc.__v;
          result = { ...application };
        }
        const query = { populate() { return this; }, then(resolve) { return Promise.resolve(result).then(resolve); } };
        return query;
      },
    } },
    '../services/candidateAccess.service': { assertCanManageJob: async () => {}, assertVisibleAccount: async () => {} },
    '../sockets/notification.service': { createNotification: async () => { notifications++; } },
    '../models/notification.model': { Notification: { countDocuments: async () => 0 } },
    '../server': { io: { to: () => ({ emit() {} }) } },
  });
  const results = await Promise.allSettled(['shortlisted', 'rejected'].map(status => controller.updateApplicationStatus(
    { params: { id: 'app' }, user: { _id: 'team-member' }, body: { status, expectedVersion: 0 } }, response())));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.statusCode, 409);
  assert.equal(application.__v, 1);
  assert.equal(notifications, 1);
});

test('inactive, purging, and absent accounts cannot expose their profile or pitch', async () => {
  for (const account of [null, { deactivate: true }, { deletionInProgress: true }]) {
    const User = { exists: async filter => {
      assert.equal(filter.deactivate.$ne, true);
      assert.equal(filter.deletionInProgress.$ne, true);
      return account && !account.deactivate && !account.deletionInProgress;
    } };
    const access = load('../src/services/candidateAccess.service.ts', { ...common, '../models/user.model': { User } });
    await assert.rejects(access.assertVisibleAccount('candidate'), { statusCode: 404 });
    const pitches = load('../src/services/candidatePitchEntitlement.service.ts', { '../models/user.model': { User } });
    assert.equal(await pitches.isCandidatePitchAvailable({ status: 'active', processing: { state: 'ready' }, metadata: { duration: 20 } }, 'candidate'), false);
  }
});

test('application prerequisite check identifies incomplete profiles and unfinished pitches', async () => {
  const completeProfile = { firstName: 'Test', lastName: 'Candidate', email: 'test@mail.com', country: 'UK', city: 'London' };
  for (const [profile, pitch, profileComplete, pitchReady] of [
    [null, null, false, false],
    [{ ...completeProfile, city: '' }, null, false, false],
    [completeProfile, { status: 'active', processing: { state: 'pending' } }, true, false],
    [completeProfile, { status: 'active', processing: { state: 'ready' }, video: { hlsUrl: 'hls' } }, true, true],
  ]) {
    const controller = load('../src/controllers/appliedJob.controller.ts', {
      ...common,
      '../models/createResume.model': { CreateResume: { findOne: async () => profile } },
      '../services/candidatePitchEntitlement.service': { getAvailableCandidatePitch: async () => pitch },
    });
    const res = response();
    await controller.getApplicationRequirements({ user: { _id: 'candidate' } }, res);
    assert.equal(res.body.data.profileComplete, profileComplete);
    assert.equal(res.body.data.pitchReady, pitchReady);
  }
});
