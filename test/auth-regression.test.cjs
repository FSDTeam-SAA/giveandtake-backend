const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const bcrypt = require('bcrypt');

function load(file, imports = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const context = {
    exports: {}, process: { env: {} }, console,
    require: name => imports[name] ?? {},
  };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
const regex = load('../src/utils/regex.ts');
const email = load('../src/utils/email.ts', { './regex': regex });
const policy = load('../src/utils/passwordPolicy.ts');
class AppError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}
function handlers(user, sendEmail = async () => {}) {
  return load('../src/controllers/user.controller.ts', {
    '../utils/email': email,
    '../utils/passwordPolicy': policy,
    '../utils/catchAsync': handler => handler,
    '../errors/AppError': AppError,
    'http-status': { OK: 200, BAD_REQUEST: 400, CONFLICT: 409, NOT_FOUND: 404 },
    '../models/user.model': { User: { isUserExistsByEmail: async () => user } },
    '../utils/authToken': { verifyToken: () => ({ otp: '123456' }), createToken: () => 'otp-token' },
    '../utils/generateOTP': { generateOTP: () => '123456' },
    '../utils/sendEmail': { sendEmail, resetOtpTemplate: () => 'OTP email' },
    '../utils/sendResponse': () => {},
  });
}

test('email lookup matches legacy casing literally and never expands regex characters', () => {
  const filter = email.userEmailFilter(' Person+tag@Example.COM ');
  const pattern = new RegExp(filter.email.$regex, filter.email.$options);
  assert.ok(pattern.test('PERSON+TAG@EXAMPLE.COM'));
  assert.ok(!pattern.test('personntag@example.com'));
  assert.ok(!pattern.test('otherperson+tag@example.com'));
  assert.equal(email.normalizeEmail(' Person@Example.COM '), 'person@example.com');
});

test('reset saves a usable password, consumes the OTP, and rejects reuse', async () => {
  const user = {
    password: 'old-hash', password_reset_token: 'otp-token',
    async save() { this.password = await bcrypt.hash(this.password, 4); },
  };
  const controller = handlers(user);
  await controller.resetPassword({ body: {
    email: 'Person@Example.COM', otp: '123456', password: 'NewPassword1!',
  } }, {});
  assert.ok(await bcrypt.compare('NewPassword1!', user.password));
  assert.equal(user.password_reset_token, '');
  await assert.rejects(controller.resetPassword({ body: {
    email: 'person@example.com', otp: '123456', password: 'AnotherPass1!',
  } }, {}), { statusCode: 400, message: 'Password reset token is invalid' });
});

test('incorrect reset OTP cannot change the password', async () => {
  const user = { password: 'old-hash', password_reset_token: 'otp-token', save() { assert.fail('must not save'); } };
  await assert.rejects(handlers(user).resetPassword({ body: {
    email: 'person@example.com', otp: '000000', password: 'NewPassword1!',
  } }, {}), { statusCode: 400, message: 'Invalid OTP' });
  assert.equal(user.password, 'old-hash');
});

test('older mobile reset requests save the password on the verification endpoint', async () => {
  const user = {
    password: 'old-hash', password_reset_token: 'otp-token',
    async save() { this.password = await bcrypt.hash(this.password, 4); },
  };
  await handlers(user).otpVerifyResetPassword({ body: {
    email: 'PERSON@EXAMPLE.COM', otp: '123456', password: 'NewPassword1!',
  } }, {});
  assert.ok(await bcrypt.compare('NewPassword1!', user.password));
  assert.equal(user.password_reset_token, '');
});

test('verification-only requests leave the reset OTP available for the next step', async () => {
  const user = { password_reset_token: 'otp-token', save() { assert.fail('must not save'); } };
  await handlers(user).otpVerifyResetPassword({ body: {
    email: 'person@example.com', otp: '123456',
  } }, {});
  assert.equal(user.password_reset_token, 'otp-token');
});

test('reset email delivery failures propagate instead of reporting success', async () => {
  const user = { name: 'Person', email: 'person@example.com', async save() {} };
  await assert.rejects(handlers(user, async () => { throw new Error('SMTP unavailable'); })
    .forgetPassword({ body: { email: 'Person@Example.COM' } }, {}), /SMTP unavailable/);
});

test('registration rejects an existing email before creating a duplicate', async () => {
  await assert.rejects(handlers({ email: 'person@example.com' }).register({ body: {
    name: 'Person', email: 'PERSON@EXAMPLE.COM', password: 'Password123!',
  } }, {}), { statusCode: 409 });
});
