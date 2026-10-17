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
  const context = { exports: {}, require: name => imports[name] ?? require(name) };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
const words = count => Array(count).fill('word').join(' ');
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
  for (const message of [words(51), words(51).replaceAll(' ', '\n\t\u00a0'), 123, ['hello']]) {
    await assert.rejects(createContactUs({ body: { ...valid, message } }, {}), error => error.statusCode === 400);
  }
  assert.equal(writes.length, 0);
  await createContactUs({ body: { ...valid, message: words(50) } }, {});
  assert.equal(writes.length, 1);
  assert.equal(writes[0].address, valid.address);
  assert.equal(replies[0].statusCode, 201);
});

test('contact model permits 50 words and rejects 51', () => {
  require('ts-node/register/transpile-only');
  const { ContactUs } = require('../src/models/contactUs.model');
  assert.equal(new ContactUs({ ...valid, message: words(50) }).validateSync(), undefined);
  const error = new ContactUs({ ...valid, message: words(51) }).validateSync();
  assert.equal(error.errors.message.message, 'Message cannot exceed 50 words.');
});
