const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const context = { exports: {}, require: name => imports[name] ?? require(name) };
  vm.runInNewContext(output, context);
  return context.exports;
}
const defaults = load('src/utils/qualificationDefaults.ts');
class AppError extends Error { constructor(statusCode, message) { super(message); this.statusCode = statusCode; } }
function controller(model) {
  return load('src/controllers/qualification.controller.ts', {
    '../utils/catchAsync': handler => handler,
    '../errors/AppError': AppError,
    '../models/qualification.model': { Qualification: model },
    '../utils/qualificationDefaults': defaults,
    '../utils/sendResponse': (res, reply) => { res.reply = reply; },
  });
}
test('catalog includes vocational qualifications and correct labels without changing stored values', () => {
  const entries = new Map(defaults.qualificationDefaults);
  for (const value of ['ONC', 'OND', 'HNC', 'HND']) assert.equal(entries.get(value), value);
  assert.equal(entries.get('BSc'), 'B.Sc');
  assert.equal(entries.get('MSc'), 'M.Sc');
  assert.equal(defaults.qualificationKey('B.Sc'), defaults.qualificationKey(' bsc '));
});
test('bootstrapping only inserts missing entries and never overwrites admin edits', async () => {
  let operations;
  const { ensureQualifications } = load('src/jobs/ensureQualifications.ts', {
    '../models/qualification.model': { Qualification: { bulkWrite: async ops => operations = ops } },
    '../utils/qualificationDefaults': defaults,
  });
  await ensureQualifications();
  assert.equal(operations.length, 19);
  for (const { updateOne } of operations) {
    assert.equal(updateOne.upsert, true);
    assert.deepEqual(Object.keys(updateOne.update), ['$setOnInsert']);
    assert.equal(updateOne.filter.value, updateOne.update.$setOnInsert.value);
  }
});
test('invalid requests never write; duplicate qualifications return a conflict', async () => {
  let writes = 0;
  const { saveQualification } = controller({ create: async () => { writes++; throw { code: 11000 }; } });
  for (const body of [{ label: '' }, { label: 1 }, { label: '...' }, { label: 'a'.repeat(101) }, { label: 'OND', active: 'false' }]) {
    await assert.rejects(saveQualification({ body, params: {} }, {}), err => err.statusCode === 400);
  }
  assert.equal(writes, 0);
  await assert.rejects(saveQualification({ body: { label: 'OND' }, params: {} }, {}), err => err.statusCode === 409);
});
test('editing updates labels and status but preserves the saved resume value', async () => {
  let update;
  const { saveQualification } = controller({ findByIdAndUpdate: async (id, body) => { update = body; return { value: 'BSc', ...body.$set }; } });
  const res = {};
  await saveQualification({ params: { id: '507f1f77bcf86cd799439011' }, body: { label: ' B.Sc ', active: false, value: 'changed' } }, res);
  assert.equal(update.$set.value, undefined);
  assert.equal(res.reply.data.value, 'BSc');
  assert.equal(res.reply.data.label, 'B.Sc');
  assert.equal(res.reply.data.active, false);
});
test('anonymous reads are public while every admin read and write requires admin authorization', () => {
  const routes = [];
  const protect = () => {}, isAdmin = () => {};
  load('src/routes/qualification.routes.ts', {
    express: { Router: () => Object.fromEntries(['get', 'post', 'patch'].map(method => [method, (...handlers) => routes.push({ method, handlers })])) },
    '../middlewares/auth.middleware': { protect, isAdmin },
    '../controllers/qualification.controller': { listQualifications: () => () => {}, saveQualification: () => {} },
  });
  assert.equal(routes[0].handlers.length, 2);
  for (const route of routes.slice(1)) {
    assert.equal(route.handlers[1], protect);
    assert.equal(route.handlers[2], isAdmin);
  }
});
