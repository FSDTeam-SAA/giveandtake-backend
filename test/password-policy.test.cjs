const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadPolicy(relativePath) {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const context = { exports: {} };
  vm.runInNewContext(outputText, context);
  return context.exports;
}

for (const [name, file] of [
  ['backend', '../src/utils/passwordPolicy.ts'],
  ['web', '../../evpitch-frontend/lib/password-policy.ts'],
  ['admin', '../../evpitch-admin/src/lib/password-policy.ts'],
]) {
  const policy = loadPolicy(file);
  test(`${name}: rejects nine characters and accepts ten and eleven`, () => {
    assert.equal(policy.PASSWORD_MIN_LENGTH, 10);
    assert.equal(policy.isValidPassword('Abcdefg1!'), false);
    assert.equal(policy.isValidPassword('Abcdefgh1!'), true);
    assert.equal(policy.isValidPassword('Abcdefghi1!'), true);
  });
  test(`${name}: preserves all character requirements`, () => {
    for (const password of ['abcdefgh1!', 'ABCDEFGH1!', 'Abcdefghi!', 'Abcdefghi1']) {
      assert.equal(policy.isValidPassword(password), false);
    }
    for (const special of '!@#$%^&*()_+-=[]{};:\'"\\|,.<>/?~') {
      assert.equal(policy.isValidPassword(`Abcdefgh1${special}`), true);
    }
  });
}

test('backend rejects non-string passwords', () => {
  const policy = loadPolicy('../src/utils/passwordPolicy.ts');
  for (const password of [undefined, null, 1234567890, {}, []]) {
    assert.equal(policy.isValidPassword(password), false);
  }
});

test('every password creation endpoint rejects a nine-character password before accessing data', async () => {
  const policy = loadPolicy('../src/utils/passwordPolicy.ts');
  const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers/user.controller.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  class AppError extends Error {
    constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  const context = {
    exports: {},
    process: { env: {} },
    require: (name) => {
      if (name === '../utils/passwordPolicy') return policy;
      if (name === '../utils/catchAsync') return handler => handler;
      if (name === '../errors/AppError') return AppError;
      if (name === 'http-status') return { BAD_REQUEST: 400 };
      return {};
    },
  };
  vm.runInNewContext(outputText, context);
  for (const [endpoint, body, query] of [
    ['register', { name: 'Test', email: 'test@example.com', password: 'Abcdefg1!' }],
    ['resetPassword', { email: 'test@example.com', otp: '123456', password: 'Abcdefg1!' }],
    ['changePassword', { oldPassword: 'Existing1!', newPassword: 'Abcdefg1!' }],
    ['securityResetPassword', { newPassword: 'Abcdefg1!' }, { token: 'reset-token' }],
  ]) {
    await assert.rejects(context.exports[endpoint]({ body, query }, {}), {
      statusCode: 400,
      message: policy.PASSWORD_REQUIREMENT_MESSAGE,
    });
  }
});
