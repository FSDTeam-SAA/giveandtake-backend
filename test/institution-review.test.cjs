const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const scope = { exports: {}, require: name => imports[name] ?? require(name) };
  vm.runInNewContext(output, scope);
  return scope.exports;
}
const policy = load('src/utils/institutionReview.ts');
class AppError extends Error { constructor(statusCode, message) { super(message); this.statusCode = statusCode; } }
const id = '507f1f77bcf86cd799439011';
const adminId = '507f1f77bcf86cd799439012';

function fixture() {
  const schools = [{ _id: id, name: 'Catalog University', country: 'UK' },
    { _id: '507f1f77bcf86cd799439013', name: 'Inactive College', country: 'UK', active: false }];
  const education = [
    { instituteName: '  Independent   College ', country: 'UK', degree: 'BSc' },
    { instituteName: 'independent college', country: ' uk ', degree: 'MBA' },
    { instituteName: 'British Computer Institute', country: '' },
    { instituteName: 'Catalog University', country: '' },
    { instituteName: 'Inactive College', country: 'UK' },
  ];
  const decisions = [];
  let writes = 0;
  const query = value => ({ sort() { return this; }, select() { return this; }, lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
  const document = row => row && Object.assign(row, { save: async () => { writes++; return row; } });
  const model = {
    find: filter => query(schools.filter(item => !filter?.active || item.active !== false)),
    findOne: async filter => document(schools.find(item => filter.name.test(item.name) && filter.country.test(item.country))),
    findById: async key => document(schools.find(item => item._id === key)),
    create: async values => { writes++; const school = { _id: '507f1f77bcf86cd799439014', ...values }; schools.push(school); return document(school); },
    findByIdAndUpdate: async (key, update) => { writes++; const school = schools.find(item => item._id === key); if (school) Object.assign(school, update.$set); return school; },
    findByIdAndDelete: async key => { writes++; const i = schools.findIndex(item => item._id === key); return i < 0 ? null : schools.splice(i, 1)[0]; },
  };
  const reviewModel = {
    find: () => query(decisions),
    findById: key => query(decisions.find(item => item._id === key) || null),
    findOneAndUpdate: async (filter, update) => {
      writes++;
      let row = decisions.find(item => item._id === filter._id);
      if (!row) { row = { _id: filter._id }; decisions.push(row); }
      return Object.assign(row, update.$set);
    },
  };
  const controller = load('src/controllers/university.controller.ts', {
    '../utils/catchAsync': handler => handler, '../errors/AppError': AppError,
    '../models/university.model': { University: model },
    '../models/education.model': { Education: { find: () => query(education) } },
    '../models/institutionReview.model': { InstitutionReview: reviewModel },
    '../utils/institutionReview': policy,
  });
  async function call(name, body = {}, params = {}, query = {}) {
    const res = { responses: 0, setHeader() {}, status(code) { this.code = code; return this; }, json(payload) { this.responses++; this.body = payload; } };
    await controller[name]({ body, params, query, user: { _id: adminId } }, res);
    assert.equal(res.responses, 1);
    return res;
  }
  return { schools, education, decisions, call, model, writes: () => writes };
}

test('historical names group by whitespace/case and country without changing saved education', () => {
  const rows = [{ instituteName: ' A  School ', country: ' UK ' }, { instituteName: 'a school', country: 'uk' }, { instituteName: 'A School', country: 'US' }, {}, { instituteName: ' ' }];
  const before = JSON.stringify(rows);
  const groups = policy.groupInstitutions(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups.find(row => row.country === 'UK').count, 2);
  assert.equal(JSON.stringify(rows), before);
  assert.ok(policy.institutionMatch('A (School) + B').test('  a   (school) + b '));
  assert.ok(!policy.institutionMatch('A (School) + B').test('A School B'));
});

test('public list preserves legacy response and excludes only explicitly inactive suggestions', async () => {
  const f = fixture();
  const response = await f.call('listUniversities');
  assert.equal(response.code, 200);
  assert.equal(response.body.status, 'success');
  assert.equal(response.body.total, 1);
  assert.equal(response.body.data[0]._id, id);
  assert.equal((await f.call('manageUniversities')).body.total, 2);
});

test('pending includes historical/custom names but excludes catalog names, including inactive entries', async () => {
  const f = fixture();
  const response = await f.call('listInstitutionSubmissions');
  assert.equal(response.body.total, 2);
  assert.equal(response.body.data.find(row => row.name === 'Independent College').count, 2);
  assert.equal(f.writes(), 0, 'Reading review queue is read-only');
  await assert.rejects(f.call('listInstitutionSubmissions', {}, {}, { status: 'invalid' }), error => error.statusCode === 400);
});

test('reject persists across repeat saves and casing changes; profiles retain their original text', async () => {
  const f = fixture(), before = JSON.stringify(f.education);
  const key = policy.institutionKey('Independent College', 'UK');
  await f.call('reviewInstitutionSubmission', { key, action: 'reject' });
  assert.equal(f.decisions[0].reviewedBy, adminId);
  assert.equal((await f.call('listInstitutionSubmissions')).body.total, 1);
  f.education.push({ instituteName: 'INDEPENDENT   COLLEGE', country: 'uk' });
  assert.equal((await f.call('listInstitutionSubmissions')).body.total, 1);
  assert.equal((await f.call('listInstitutionSubmissions', {}, {}, { status: 'rejected' })).body.data[0].count, 3);
  f.education.pop();
  assert.equal(JSON.stringify(f.education), before);
});

test('approve custom name requires country, creates one catalog entry, and is retry-safe', async () => {
  const f = fixture(), before = JSON.stringify(f.education);
  const key = policy.institutionKey('British Computer Institute');
  await assert.rejects(f.call('reviewInstitutionSubmission', { key, action: 'approve' }), error => error.statusCode === 400);
  assert.equal(f.writes(), 0);
  await f.call('reviewInstitutionSubmission', { key, action: 'approve', country: 'UK' });
  await f.call('reviewInstitutionSubmission', { key, action: 'approve', country: 'UK' });
  assert.equal(f.schools.filter(row => row.name === 'British Computer Institute').length, 1);
  assert.equal((await f.call('listInstitutionSubmissions', {}, {}, { status: 'approved' })).body.total, 1);
  assert.equal(JSON.stringify(f.education), before);
});

test('linking approves an existing inactive institution without modifying candidate names', async () => {
  const f = fixture(), before = JSON.stringify(f.education);
  const key = policy.institutionKey('Independent College', 'UK');
  await f.call('reviewInstitutionSubmission', { key, action: 'approve', universityId: f.schools[1]._id });
  assert.equal(f.schools[1].active, true);
  assert.equal(f.decisions[0].universityId, f.schools[1]._id);
  assert.equal(JSON.stringify(f.education), before);
});

test('catalog edit/deactivate/delete and review never write or rewrite education', async () => {
  const f = fixture(), before = JSON.stringify(f.education);
  await f.call('updateUniversity', { name: 'Renamed Catalog' }, { id });
  await f.call('updateUniversity', { active: false }, { id });
  assert.equal(f.schools[0].active, false);
  await f.call('deleteUniversity', {}, { id });
  assert.equal(JSON.stringify(f.education), before);
});

test('invalid IDs, missing records, invalid values and duplicate names stop before any write', async () => {
  const f = fixture();
  for (const body of [{}, { name: '', country: 'UK' }, { name: 'a'.repeat(151), country: 'UK' }, { name: 'School', country: '' }, { name: 'School', country: 'UK', active: 'false' }]) {
    await assert.rejects(f.call('createUniversity', body), error => error.statusCode === 400);
  }
  await assert.rejects(f.call('createUniversity', { name: ' catalog   UNIVERSITY ', country: ' uk ' }), error => error.statusCode === 409);
  for (const method of ['getUniversity', 'updateUniversity', 'deleteUniversity']) {
    await assert.rejects(f.call(method, { name: 'School' }, { id: 'bad' }), error => error.statusCode === 400);
    await assert.rejects(f.call(method, { name: 'School' }, { id: adminId }), error => error.statusCode === 404);
  }
  await assert.rejects(f.call('reviewInstitutionSubmission', { key: 'bad', action: 'approve' }), error => error.statusCode === 400);
  await assert.rejects(f.call('reviewInstitutionSubmission', { key: 'f'.repeat(64), action: 'approve' }), error => error.statusCode === 404);
  // Delete performs a lookup/write operation even on a missing record; no data is changed.
  assert.equal(f.schools.length, 2);
  assert.equal(f.decisions.length, 0);
});

test('every management/import/mutation route is admin-only, named routes precede /:id', () => {
  const routes = [], protect = () => {}, isAdmin = () => {};
  const handlers = Object.fromEntries(['uploadUniversities', 'createUniversity', 'listUniversities', 'getUniversity', 'updateUniversity', 'deleteUniversity', 'manageUniversities', 'listInstitutionSubmissions', 'reviewInstitutionSubmission'].map(name => [name, () => {}]));
  load('src/routes/university.routes.ts', {
    express: { Router: () => Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [method, (...args) => routes.push({ method, args })])) },
    '../middlewares/auth.middleware': { protect, isAdmin },
    '../middlewares/multer.middleware': { upload: { single: () => () => {} } },
    '../controllers/university.controller': handlers,
  });
  for (const route of routes) {
    if (route.method === 'get' && ['/', '/:id'].includes(route.args[0])) assert.equal(route.args.length, 2);
    else { assert.equal(route.args[1], protect); assert.equal(route.args[2], isAdmin); }
  }
  assert.ok(routes.findIndex(route => route.args[0] === '/submissions') < routes.findIndex(route => route.args[0] === '/:id'));
});
