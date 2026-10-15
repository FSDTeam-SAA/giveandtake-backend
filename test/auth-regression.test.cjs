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
const sessionPolicy = load('../src/utils/sessionPolicy.ts');
class AppError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}
function handlers(user, sendEmail = async () => {}, sendResponse = () => {}, overrides = {}) {
  return load('../src/controllers/user.controller.ts', {
    '../utils/email': email,
    '../utils/passwordPolicy': policy,
    '../utils/sessionPolicy': sessionPolicy,
    '../utils/catchAsync': handler => handler,
    '../errors/AppError': AppError,
    'http-status': { OK: 200, BAD_REQUEST: 400, CONFLICT: 409, NOT_FOUND: 404 },
    '../models/user.model': { User: { isUserExistsByEmail: async () => user } },
    '../utils/authToken': { verifyToken: () => ({ otp: '123456' }), createToken: () => 'otp-token' },
    '../utils/generateOTP': { generateOTP: () => '123456' },
    '../utils/sendEmail': { sendEmail, resetOtpTemplate: () => 'OTP email' },
    '../utils/sendResponse': sendResponse,
    ...overrides,
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

test('reset delivery failures cannot disclose that an account exists', async () => {
  const user = { name: 'Person', email: 'person@example.com', async save() {} };
  let response;
  await handlers(user, async () => { throw new Error('SMTP unavailable'); }, (_, value) => { response = value; })
    .forgetPassword({ body: { email: 'Person@Example.COM' } }, {});
  assert.equal(response.statusCode, 200);
  assert.match(response.message, /^If an account exists/);
});

test('known and unknown reset email requests return exactly the same response', async () => {
  const responses = [];
  let deliveries = 0;
  for (const user of [null, { name: 'Test', email: 'test@mail.com', async save() {} }]) {
    await handlers(user, async () => { deliveries++; }, (_, body) => responses.push(body))
      .forgetPassword({ body: { email: 'Test@Mail.com' } }, {});
  }
  assert.equal(deliveries, 1);
  assert.equal(JSON.stringify(responses[0]), JSON.stringify(responses[1]));
});

test('unknown and reset-token-less accounts have the same invalid reset response', async () => {
  for (const user of [null, { password_reset_token: '' }]) {
    for (const name of ['otpVerifyResetPassword', 'resetPassword']) {
      await assert.rejects(handlers(user)[name]({ body: {
        email: 'unknown@mail.com', otp: '000000', password: 'NewPassword1!',
      } }, {}), { statusCode: 400, message: 'Password reset token is invalid' });
    }
  }
});

test('sessions last twelve hours or thirty days and refresh cannot move the deadline', () => {
  const now = Date.UTC(2026, 9, 15);
  const normal = sessionPolicy.sessionDeadline(false, now);
  const remembered = sessionPolicy.sessionDeadline(true, now);
  assert.equal(normal - now / 1000, 12 * 3600);
  assert.equal(remembered - now / 1000, 30 * 24 * 3600);
  assert.equal(sessionPolicy.sessionDeadline('false', now), normal);
  assert.equal(sessionPolicy.remainingSessionSeconds(normal, now + 11 * 3600 * 1000), 3600);
  assert.equal(sessionPolicy.remainingSessionSeconds(normal, now + 12 * 3600 * 1000), 0);
});

test('Test@Mail.com and test@mail.com resolve to the same account', async () => {
  const account = { email: 'Test@Mail.com' };
  for (const entered of ['Test@Mail.com', 'test@mail.com']) {
    const filter = email.userEmailFilter(entered);
    assert.ok(new RegExp(filter.email.$regex, filter.email.$options).test(account.email));
    await assert.rejects(handlers(account).register({ body: {
      name: 'Test', email: entered, password: 'Password123!',
    } }, {}), { statusCode: 409 });
  }
});

test('login issues short access tokens and a refresh token with the selected absolute lifetime', async () => {
  for (const rememberMe of [false, true]) {
    const issued = [];
    const user = { _id: 'user', email: 'test@mail.com', name: 'Test', password: 'hash', role: 'candidate',
      verificationInfo: { verified: true }, async save() { return this; } };
    let response;
    const controller = handlers(user, undefined, (_, body) => { response = body; }, {
      '../models/user.model': { User: { isUserExistsByEmail: async () => user, isPasswordMatched: async () => true } },
      '../utils/authToken': { createToken: (claims, _, duration) => { issued.push({ claims, duration }); return 'token'; } },
      '../models/paymentInfo.model': { paymentInfo: { findOne: () => ({ sort: () => ({ populate: async () => null }) }) } },
    });
    await controller.login({ body: { email: 'Test@Mail.com', password: 'Password123!', rememberMe } }, {});
    assert.equal(issued[0].duration, 15 * 60);
    const expected = rememberMe ? 30 * 24 * 3600 : 12 * 3600;
    assert.ok(issued[1].duration >= expected - 2 && issued[1].duration <= expected);
    assert.equal(issued[0].claims.sessionExpiresAt, issued[1].claims.sessionExpiresAt);
    assert.equal(response.data.sessionExpiresAt, issued[1].claims.sessionExpiresAt);
  }
});

test('refresh preserves the deadline, bounds access expiry, and rejects expired or deleted sessions', async () => {
  const deadline = Math.floor(Date.now() / 1000) + 60;
  for (const scenario of ['active', 'expired', 'deleted', 'deactivated', 'purging']) {
    const user = scenario === 'deleted' ? null : { _id: 'user', email: 'test@mail.com', role: 'candidate',
      deactivate: scenario === 'deactivated', deletionInProgress: scenario === 'purging', async save() {} };
    const issued = [];
    const controller = handlers(null, undefined, () => {}, {
      '../models/user.model': { User: { findById: async () => user } },
      '../utils/authToken': {
        verifyToken: () => ({ _id: 'user', sessionExpiresAt: scenario === 'expired' ? 1 : deadline }),
        createToken: (claims, _, duration) => { issued.push({ claims, duration }); return 'token'; },
      },
    });
    const call = controller.refreshToken({ body: { refreshToken: 'refresh' } }, {});
    if (scenario !== 'active') {
      await assert.rejects(call, { statusCode: 401 });
      assert.equal(issued.length, 0);
    } else {
      await call;
      assert.ok(issued[0].duration > 0 && issued[0].duration <= 60);
      assert.equal(issued[0].claims.sessionExpiresAt, deadline);
      assert.equal(issued[1].claims.sessionExpiresAt, deadline);
    }
  }
});

test('registration rejects an existing email before creating a duplicate', async () => {
  await assert.rejects(handlers({ email: 'person@example.com' }).register({ body: {
    name: 'Person', email: 'PERSON@EXAMPLE.COM', password: 'Password123!',
  } }, {}), { statusCode: 409 });
});
