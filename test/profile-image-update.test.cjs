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
  const context = { exports: {}, console, require: name => imports[name] ?? {} };
  vm.runInNewContext(outputText, context);
  return context.exports;
}

const common = {
  '../utils/catchAsync': handler => handler,
  '../utils/sendResponse': () => {},
  'http-status': { OK: 200, NOT_FOUND: 404, FORBIDDEN: 403 },
  '../errors/AppError': class AppError extends Error {
    constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
  },
};

function recruiter() {
  const account = { photo: 'photo-url', photoKey: 'photo-key', banner: 'banner-url', bannerKey: 'banner-key' };
  const user = { avatar: { url: 'photo-url', key: 'photo-key' }, async save() {} };
  const deleted = [];
  let updates;
  const controller = load('../src/controllers/recruiterAccount.controller.ts', {
    ...common,
    '../models/user.model': { User: { findById: async id => { assert.equal(id, 'owner'); return user; } } },
    '../models/recruiterAccount.model': { RecruiterAccount: {
      findOne: async filter => { assert.equal(filter.userId, 'owner'); return account; },
      findOneAndUpdate: async (filter, data) => { assert.equal(filter.userId, 'owner'); updates = data; return data; },
    } },
    '../utils/mediaUpload': {
      deleteMedia: async key => deleted.push(key),
      uploadMedia: async () => ({ url: 'new-url', key: 'new-key' }),
    },
  });
  return { user, deleted, updates: () => updates,
    update: (body, files, actor = { _id: 'owner', role: 'recruiter' }) => controller.updateRecruiterAccount({ params: { userId: 'owner' }, body, files, user: actor }, {}),
  };
}

test('recruiter removal clears only the selected image, storage key and matching avatar', async () => {
  for (const image of ['photo', 'banner']) {
    const fixture = recruiter();
    await fixture.update({ [image]: '' });
    assert.equal(fixture.updates()[image], '');
    assert.equal(fixture.updates()[image + 'Key'], '');
    assert.equal(fixture.updates()[image === 'photo' ? 'banner' : 'photo'], undefined);
    assert.deepEqual(fixture.deleted, [image + '-key']);
    assert.equal(fixture.user.avatar?.url, image === 'photo' ? undefined : 'photo-url');
  }
});

test('recruiter text-only changes preserve images and an unrelated avatar is never removed', async () => {
  const fixture = recruiter();
  await fixture.update({ bio: 'Updated bio' });
  assert.equal(fixture.updates().photo, undefined);
  assert.equal(fixture.updates().banner, undefined);
  assert.deepEqual(fixture.deleted, []);
  assert.equal(fixture.user.avatar.url, 'photo-url');
  fixture.user.avatar = { url: 'unrelated-url' };
  await fixture.update({ photo: '' });
  assert.equal(fixture.user.avatar.url, 'unrelated-url');
});

test('a new recruiter upload overrides an empty image field without deleting the new file', async () => {
  const fixture = recruiter();
  await fixture.update({ photo: '' }, { photo: [{ path: 'upload.jpg' }] });
  assert.equal(fixture.updates().photo, 'new-url');
  assert.equal(fixture.updates().photoKey, 'new-key');
  assert.equal(fixture.user.avatar.url, 'new-url');
  assert.deepEqual(fixture.deleted, []);
});

function company() {
  const deleted = [];
  let updates;
  const controller = load('../src/controllers/company.controller.ts', {
    ...common,
    '../models/company.model': { Company: {
      findById: async id => { assert.equal(id, 'company'); return {
        userId: 'owner', clogo: 'logo-url', clogoKey: 'logo-key', banner: 'banner-url', bannerKey: 'banner-key',
      }; },
      findByIdAndUpdate: async (id, data) => { assert.equal(id, 'company'); updates = data; return data; },
    } },
    '../utils/mediaUpload': {
      deleteMedia: async key => deleted.push(key),
      uploadMedia: async () => ({ url: 'new-url', key: 'new-key' }),
    },
  });
  return { deleted, updates: () => updates,
    update: (body, files, actor = { _id: 'owner', role: 'company' }) => controller.updateCompany({ params: { id: 'company' }, body, files, user: actor }, {}),
  };
}

test('company logo and banner removals preserve the other image and clean the selected storage key', async () => {
  for (const image of ['clogo', 'banner']) {
    const fixture = company();
    await fixture.update({ [image]: '' });
    assert.equal(fixture.updates()[image], '');
    assert.equal(fixture.updates()[image + 'Key'], '');
    assert.equal(fixture.updates()[image === 'clogo' ? 'banner' : 'clogo'], undefined);
    assert.deepEqual(fixture.deleted, [image === 'clogo' ? 'logo-key' : 'banner-key']);
  }
});

test('company text-only edits preserve images, and replacement files override removals', async () => {
  const fixture = company();
  await fixture.update({ cname: 'Updated name' });
  assert.equal(fixture.updates().clogo, undefined);
  assert.equal(fixture.updates().banner, undefined);
  assert.deepEqual(fixture.deleted, []);
  await fixture.update({ banner: '' }, { banner: [{ path: 'upload.jpg' }] });
  assert.equal(fixture.updates().banner, 'new-url');
  assert.equal(fixture.updates().bannerKey, 'new-key');
  assert.deepEqual(fixture.deleted, []);
});

for (const [name, create, image] of [
  ['company', company, 'clogo'], ['recruiter', recruiter, 'photo'],
]) {
  test(`${name} profile changes reject other accounts and anonymous callers before updating or deleting media`, async () => {
    for (const actor of [{ _id: 'someone-else', role: 'candidate' }, null]) {
      const fixture = create();
      await assert.rejects(fixture.update({ [image]: '' }, undefined, actor), { statusCode: 403 });
      assert.equal(fixture.updates(), undefined);
      assert.deepEqual(fixture.deleted, []);
    }
  });
  test(`${name} profile removal remains available to administrators`, async () => {
    const fixture = create();
    await fixture.update({ [image]: '' }, undefined, { _id: 'administrator', role: 'admin' });
    assert.equal(fixture.updates()[image], '');
    assert.equal(fixture.deleted.length, 1);
  });
}
