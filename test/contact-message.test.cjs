require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports = {}) {
  const { outputText } = ts.transpileModule(
    fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } },
  );
  const context = { exports: {}, require: name => imports[name] ?? require(name.startsWith('.') ? path.resolve(__dirname, '..', path.dirname(file), name) : name) };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
const words = count => 'A'.repeat(count);
const valid = { firstName: 'Alex', lastName: 'Smith', address: 'alex@example.com', subject: 'Question' };

test('contact API rejects over-limit or non-text messages before database writes', async () => {
  const writes = [];
  const replies = [];
  class AppError extends Error {
    constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
  }
  const { createContactUs } = load('src/controllers/contactUs.controller.ts', {
    '../utils/catchAsync': handler => handler,
    '../errors/AppError': AppError,
    '../models/contactUs.model': { ContactUs: { create: async data => { writes.push(data); return data; } } },
    '../models/user.model': { User: { find: () => ({ select: async () => [{ email: 'admin@example.com' }] }) } },
    '../utils/sendResponse': (res, reply) => replies.push(reply),
  });
  for (const message of [words(501), words(501).replaceAll(' ', '\n\t\u00a0'), 123, ['hello']]) {
    await assert.rejects(createContactUs({ body: { ...valid, message } }, {}), error => error.statusCode === 400);
  }
  assert.equal(writes.length, 0);
  await createContactUs({ body: { ...valid, message: words(500), phoneNumber: 'legacy client phone' } }, {});
  assert.equal(writes.length, 1);
  assert.equal(writes[0].address, valid.address);
  assert.equal(Object.hasOwn(writes[0], 'phoneNumber'), false);
  assert.equal(replies[0].statusCode, 201);
});

test('contact model permits 500 characters and rejects 51', () => {
  require('ts-node/register/transpile-only');
  const { ContactUs } = require('../src/models/contactUs.model');
  assert.equal(new ContactUs({ ...valid, message: words(500) }).validateSync(), undefined);
  const error = new ContactUs({ ...valid, message: words(501) }).validateSync();
  assert.equal(error.errors.message.message, 'Message cannot exceed 500 characters.');
});

test('contact API rejects non-text or over-limit subjects before writes', async () => {
  const writes = [];
  class AppError extends Error {
    constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
  }
  const { createContactUs } = load('src/controllers/contactUs.controller.ts', {
    '../utils/catchAsync': handler => handler,
    '../errors/AppError': AppError,
    '../models/contactUs.model': { ContactUs: { create: async data => { writes.push(data); return data; } } },
    '../models/user.model': { User: { find: () => ({ select: async () => [{ email: 'admin@example.com' }] }) } },
    '../utils/sendResponse': () => {},
  });
  for (const subject of [words(51), words(100), words(51).replaceAll(' ', '\n\t\u00a0'), 123, ['hello'], {}]) {
    await assert.rejects(createContactUs({ body: { ...valid, subject, message: words(500) } }, {}),
      error => error.statusCode === 400 && error.message ===
        (typeof subject === 'string' ? 'Subject can be at most 50 characters' : 'Subject must be text'));
  }
  assert.equal(writes.length, 0);
  for (const subject of [words(50), ' one\ttwo\nthree\u00a0four  five six ']) {
    await createContactUs({ body: { ...valid, subject, message: words(500) } }, {});
  }
  assert.equal(writes.length, 2);
  assert.equal(writes[0].subject, words(50));
});

test('contact model permits 50 subject characters and rejects 51', () => {
  require('ts-node/register/transpile-only');
  const { ContactUs } = require('../src/models/contactUs.model');
  const contact = { ...valid, message: words(500) };
  for (const subject of [words(50), ' one\ttwo\nthree\u00a0four  five six ']) {
    assert.equal(new ContactUs({ ...contact, subject }).validateSync(), undefined);
  }
  for (const subject of [words(51), words(51).replaceAll(' ', '\n\t\u00a0')]) {
    const error = new ContactUs({ ...contact, subject }).validateSync();
    assert.equal(error.errors.subject.message, 'Subject cannot exceed 50 characters.');
  }
  assert.ok(new ContactUs({ ...contact, subject: '' }).validateSync().errors.subject);
});
