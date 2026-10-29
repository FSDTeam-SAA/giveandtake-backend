const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const mongoose = require('mongoose');

function load(file, imports = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const scope = { module, exports: module.exports, console, process: { env: {}, argv: [] },
    require: name => imports[name] ?? (name.startsWith('.') ? {} : require(name)) };
  vm.runInNewContext(output, scope, { filename: file });
  return module.exports;
}
const AppError = load('src/errors/AppError.ts');
const skills = load('src/utils/skillCatalog.ts', { '../errors/AppError': AppError });
const about = load('src/utils/profileSearch.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const id = number => number.toString(16).padStart(24, '0');
function query(value) {
  return { sort() { return this; }, select() { return this; }, lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
}
function harness(initial = {}) {
  const profiles = plain(initial.profiles || [{ skills: [' Risk   Strategy ', 'risk strategy', 'C++'] }, { skills: ['Risk Strategy'] }]);
  const original = JSON.stringify(profiles);
  const catalog = plain(initial.catalog || []), decisions = plain(initial.decisions || []);
  const matches = (row, filter) => Object.entries(filter || {}).every(([key, value]) => {
    if (value instanceof RegExp || Object.prototype.toString.call(value) === '[object RegExp]') return value.test(row[key]);
    if (value && typeof value === 'object' && '$ne' in value) return row[key] !== value.$ne;
    return String(row[key]) === String(value);
  });
  let nextId = 100, race;
  const SkillModel = {
    find: filter => query(catalog.filter(row => matches(row, filter))),
    findOne: filter => query(catalog.find(row => matches(row, filter)) || null),
    findById: value => query(catalog.find(row => row._id === String(value)) || null),
    async create(value) {
      if (race) { const action = race; race = null; return action(value); }
      if (catalog.some(row => row.normalizedKey && row.normalizedKey === value.normalizedKey)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      const result = { _id: id(nextId++), ...plain(value) }; catalog.push(result); return result;
    },
    async updateMany(filter, update) { for (const row of catalog.filter(row => matches(row, filter))) Object.assign(row, plain(update.$set)); },
    async findByIdAndUpdate(value, update) {
      const row = catalog.find(row => row._id === String(value));
      if (!row) return null;
      if (update.$set.normalizedKey && catalog.some(item => item !== row && item.normalizedKey === update.$set.normalizedKey)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      Object.assign(row, plain(update.$set)); return row;
    },
    async findByIdAndDelete(value) { const index = catalog.findIndex(row => row._id === String(value)); return index < 0 ? null : catalog.splice(index, 1)[0]; },
  };
  const SkillReview = {
    find: () => query(decisions), findById: value => query(decisions.find(row => row._id === value) || null),
    async findOneAndUpdate(filter, update) {
      let row = decisions.find(item => item._id === filter._id);
      if (!row) { row = { _id: filter._id }; decisions.push(row); }
      Object.assign(row, plain(update.$set)); return row;
    },
  };
  const controller = load('src/controllers/skill.controller.ts', {
    '../models/skill.model': { SkillModel }, '../models/skillReview.model': { SkillReview },
    '../models/createResume.model': { CreateResume: { find: () => query(profiles) } },
    '../utils/catchAsync': fn => fn, '../errors/AppError': AppError, '../utils/skillCatalog': skills,
  });
  async function call(method, request = {}) {
    let count = 0, status = 200, payload;
    const reply = { setHeader() {}, status(value) { status = value; return this; }, json(value) { count++; payload = value; } };
    await controller[method]({ query: {}, params: {}, body: {}, user: { _id: id(99) }, ...request }, reply);
    assert.equal(count, 1, 'Each success sends exactly one response');
    assert.equal(JSON.stringify(profiles), original, 'Catalog/review must never change saved profiles');
    return { status, ...payload };
  }
  return { call, catalog, profiles, decisions, setRace: value => { race = value; } };
}

test('skill normalization groups whitespace/case while retaining punctuation and Unicode', () => {
  assert.equal(skills.skillKey(' Risk \n Strategy '), skills.skillKey('risk strategy'));
  assert.equal(skills.validSkillName('  Risk   Strategy '), 'Risk Strategy');
  for (const value of ['C', 'C++', 'C#', 'বাংলা', 'développement']) assert.equal(skills.validSkillName(value), value);
  assert.equal(new Set(['C', 'C++', 'C#'].map(skills.skillKey)).size, 3);
  assert.equal(skills.validSkillName('A'.repeat(100)).length, 100);
  for (const value of ['', '  ', {}, ['Risk'], 'A'.repeat(101)]) assert.throws(() => skills.validSkillName(value), /1 to 100/);
  assert.ok(skills.skillMatch('C++').test(' c++ '));
  assert.ok(!skills.skillMatch('C++').test('C'));
  assert.ok(skills.skillMatch('Risk (Audit)').test('risk (audit)'));
  const { validateFieldLimits } = load('src/middlewares/fieldLimits.ts', { '../errors/AppError': AppError });
  const values = Array.from({ length: 30 }, (_, index) => 'Custom skill ' + index);
  validateFieldLimits('resume', { resume: { skills: values } }, { creating: true });
  assert.throws(() => validateFieldLimits('resume', { resume: { skills: [...values, 'Thirty first'] } }), /30 skills/);
  assert.throws(() => validateFieldLimits('resume', { resume: { skills: [] } }), /At least one skill/);
});

test('historical submissions count each normalized skill once per saved profile', () => {
  const profiles = [{ skills: ['Risk', ' risk ', 'C++', '', null] }, { skills: ['RISK', 'C#'] }, { skills: 'not an array' }];
  const before = JSON.stringify(profiles);
  const grouped = skills.groupSkills(profiles);
  assert.equal(grouped.find(row => row.key === skills.skillKey('risk')).count, 2);
  assert.equal(grouped.length, 3);
  assert.equal(JSON.stringify(profiles), before);
});

test('suggestions retain legacy active rows and IDs, deduplicate names, and omit inactive rows', () => {
  const rows = [{ _id: 'a', name: 'Risk' }, { _id: 'b', name: ' risk ' }, { _id: 'c', name: 'C++', active: false }, { _id: 'd', name: 'C#', active: true }];
  assert.deepEqual(plain(skills.skillSuggestions(rows)).map(row => row._id), ['a', 'd']);
  assert.equal(rows.length, 4);
});

test('review lifecycle derives pending names and never mutates stored skill arrays', async () => {
  const h = harness({ catalog: [{ _id: id(1), name: 'C++' }] });
  const key = skills.skillKey('Risk Strategy');
  let response = await h.call('listSkillSubmissions');
  assert.equal(response.data.length, 1); assert.equal(response.data[0].count, 2);
  await h.call('reviewSkillSubmission', { body: { key, action: 'reject' } });
  assert.equal((await h.call('listSkillSubmissions')).data.length, 0);
  assert.equal((await h.call('listSkillSubmissions', { query: { status: 'rejected' } })).data[0].name, 'Risk Strategy');
  await h.call('reviewSkillSubmission', { body: { key, action: 'reopen' } });
  assert.equal((await h.call('listSkillSubmissions')).data.length, 1);
  response = await h.call('reviewSkillSubmission', { body: { key, action: 'approve', name: 'Risk Strategy' } });
  assert.equal(response.data.status, 'approved');
  assert.equal(h.catalog.length, 2);
  assert.equal((await h.call('listSkillSubmissions')).data.length, 0);
  assert.equal((await h.call('listSkillSubmissions', { query: { status: 'approved' } })).data[0].count, 2);
  await h.call('reviewSkillSubmission', { body: { key, action: 'reopen' } });
  assert.equal((await h.call('listSkillSubmissions')).data.length, 1, 'Explicit reopen is visible even for a known catalog name');
});

test('link approval reactivates an existing catalog entry without creating a duplicate', async () => {
  const h = harness({ catalog: [{ _id: id(1), name: 'Risk Management', active: false }] });
  const response = await h.call('reviewSkillSubmission', { body: { key: skills.skillKey('Risk Strategy'), action: 'approve', skillId: id(1) } });
  assert.equal(String(response.data.skillId), id(1));
  assert.equal(h.catalog.length, 1); assert.equal(h.catalog[0].active, true);
});

test('repeated and racing approvals reuse catalog entries', async () => {
  const h = harness();
  const key = skills.skillKey('Risk Strategy');
  h.setRace(value => { h.catalog.push({ _id: id(7), ...plain(value) }); throw Object.assign(new Error('duplicate'), { code: 11000 }); });
  await h.call('reviewSkillSubmission', { body: { key, action: 'approve' } });
  await h.call('reviewSkillSubmission', { body: { key, action: 'approve' } });
  assert.equal(h.catalog.length, 1);
  assert.equal(h.decisions.length, 1);
});

test('catalog deactivation covers duplicate legacy suggestions, while admin management retains rows', async () => {
  const h = harness({ catalog: [{ _id: id(1), name: 'Risk Strategy' }, { _id: id(2), name: 'risk   strategy' }, { _id: id(3), name: 'C++' }] });
  await h.call('updateSkill', { params: { id: id(1) }, body: { active: false } });
  assert.equal((await h.call('getAllSkills')).data.length, 1);
  assert.equal((await h.call('manageSkills')).data.length, 3);
  await h.call('updateSkill', { params: { id: id(2) }, body: { active: true } });
  assert.equal((await h.call('getAllSkills')).data.length, 2);
  await assert.rejects(h.call('createSkill', { body: { name: ' RISK STRATEGY ' } }), error => error.statusCode === 409);
  await assert.rejects(h.call('updateSkill', { params: { id: id(3) }, body: { name: 'Risk Strategy' } }), error => error.statusCode === 409);
});

test('invalid IDs, states, names and review actions fail before a catalog mutation', async () => {
  const h = harness();
  for (const method of ['getSkillById', 'updateSkill', 'deleteSkill']) await assert.rejects(h.call(method, { params: { id: 'bad' } }), error => error.statusCode === 400);
  await assert.rejects(h.call('listSkillSubmissions', { query: { status: 'unknown' } }), error => error.statusCode === 400);
  for (const body of [{ key: 'bad', action: 'approve' }, { key: skills.skillKey('Risk Strategy'), action: 'drop' }, { key: skills.skillKey('Risk Strategy'), action: 'approve', skillId: {} }]) await assert.rejects(h.call('reviewSkillSubmission', { body }), error => error.statusCode === 400);
  await assert.rejects(h.call('createSkill', { body: { name: 'A'.repeat(101) } }), error => error.statusCode === 400);
  await assert.rejects(h.call('createSkill', { body: { name: 'Risk', active: 'false' } }), error => error.statusCode === 400);
  assert.equal(h.catalog.length, 0);
});

test('CSV import validates all rows, skips normalized duplicates and removes its temporary file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evp-skills-'));
  const file = path.join(dir, 'skills.csv');
  try {
    const h = harness({ catalog: [{ _id: id(1), name: 'C++' }] });
    fs.writeFileSync(file, 'name\nC++\nRisk Strategy\nrisk   strategy\n');
    const response = await h.call('uploadSkillsFile', { file: { path: file } });
    assert.equal(response.status, 201); assert.equal(h.catalog.length, 2); assert.ok(!fs.existsSync(file));
    fs.writeFileSync(file, 'name\nValid Skill\n' + 'A'.repeat(101) + '\n');
    await assert.rejects(h.call('uploadSkillsFile', { file: { path: file } }), error => error.statusCode === 400);
    assert.equal(h.catalog.length, 2, 'No partial insert before input validation'); assert.ok(!fs.existsSync(file));
  } finally { if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(dir); }
});

test('all skill mutation and review routes authorize before upload/validation; public reads remain open', () => {
  const rows = [], protect = () => {}, admin = () => {}, upload = () => {}, validate = () => {};
  const router = Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [method, (route, ...handlers) => rows.push({ method, route, handlers })]));
  load('src/routes/skill.route.ts', {
    express: { Router: () => router }, '../middlewares/auth.middleware': { protect, isAdmin: admin },
    '../middlewares/multer.middleware': { upload: { single: () => upload } }, '../middlewares/fieldLimits': { fieldLimits: () => validate },
    '../controllers/skill.controller': new Proxy({}, { get: () => () => {} }),
  });
  for (const row of rows) {
    if (row.method !== 'get' || ['/manage', '/submissions'].includes(row.route)) assert.deepEqual(row.handlers.slice(0, 2), [protect, admin], row.route);
    else assert.ok(!row.handlers.includes(protect), row.route);
  }
  assert.ok(rows.findIndex(row => row.route === '/submissions') < rows.findIndex(row => row.route === '/:id'));
  assert.ok(rows.find(row => row.route === '/csv').handlers.indexOf(upload) > 1);
});

test('About search reads visible text, inline words and entities without tags, scripts, styles or destinations', () => {
  const text = about.profileAboutText('<h2>Risk</h2><p>ri<strong>sk</strong> &amp; C++ &eacute; &#x1F600;</p><a href="https://secret.test/hidden">Visible link</a><script>invisibleScript()</script><style>.hiddenStyle{}</style>');
  assert.match(text.toLowerCase(), /risk.*risk & c\+\+ é 😀.*visible link/);
  for (const value of ['hiddenStyle', 'invisibleScript', 'secret.test', '<strong>']) assert.ok(!text.includes(value));
  assert.equal(about.profileAboutText(null), '');
});

function hooks(schema, method, context) {
  return new Promise((resolve, reject) => schema.s.hooks.execPre(method, context, [], error => error ? reject(error) : resolve()));
}
test('Mongoose save and query hooks derive server-owned About metadata and preserve unrelated updates', async () => {
  for (const source of ['aboutUs', 'bio']) {
    const schema = new mongoose.Schema({ [source]: String, name: String }); about.installAboutSearch(schema, source);
    const Model = mongoose.model('SkillsAbout' + source, schema);
    const document = new Model({ [source]: '<p>Risk &amp; audit</p>', searchAboutText: 'spoofed' });
    await hooks(schema, 'save', document); assert.equal(document.searchAboutText, 'Risk & audit');
    assert.equal(schema.path('searchAboutText').options.select, false);
    for (const [method, update, expected] of [
      ['findOneAndUpdate', { [source]: '<p>Changed</p>', searchAboutText: 'spoofed' }, 'Changed'],
      ['updateOne', { $set: { [source]: '', searchAboutText: 'spoofed' } }, ''],
      ['updateMany', { $unset: { [source]: 1, searchAboutText: 1 } }, ''],
      ['findOneAndUpdate', { name: 'Unrelated', searchAboutText: 'spoofed', $set: { searchAboutText: 'spoofed' } }, undefined],
    ]) {
      const context = { getUpdate: () => update };
      await hooks(schema, method, context);
      assert.equal(update.searchAboutText ?? update.$set?.searchAboutText, expected);
    }
    mongoose.deleteModel(Model.modelName);
  }
});

test('About backfill is dry-run first, idempotent and guards original values and concurrent edits', async () => {
  const { backfillProfileSearch } = load('src/scripts/backfill-profile-search.ts', {
    dotenv: { config() {} }, '../utils/profileSearch': about,
  });
  const values = { createresumes: [{ _id: 'a', aboutUs: '<p>Risk</p>', updatedAt: '2026-01-01' }], companies: [{ _id: 'b', aboutUs: 'Company', updatedAt: '2026-01-01' }], recruiteraccounts: [{ _id: 'c', bio: 'Recruiter', updatedAt: '2026-01-01' }] };
  let writes = 0, conflict = false;
  const db = { collection(name) { return {
    async *find() { for (const row of values[name]) yield { ...row }; },
    async updateOne(filter, update) {
      const row = values[name].find(item => item._id === filter._id);
      assert.deepEqual(Object.keys(update), ['$set']); assert.deepEqual(Object.keys(update.$set), ['searchAboutText']);
      if (conflict && name === 'createresumes') { row.aboutUs = 'Concurrent edit'; conflict = false; }
      const matches = Object.entries(filter).every(([key, condition]) => key === '_id' || ('$exists' in condition ? Object.prototype.hasOwnProperty.call(row, key) === condition.$exists : row[key] === condition.$eq));
      if (matches) { Object.assign(row, update.$set); writes++; }
      return { matchedCount: matches ? 1 : 0 };
    },
  }; } };
  const dry = await backfillProfileSearch(db); assert.equal(writes, 0); assert.equal(dry.reduce((sum, row) => sum + row.pending, 0), 3);
  conflict = true;
  const first = await backfillProfileSearch(db, true); assert.equal(first[0].conflicts, 1); assert.equal(values.createresumes[0].aboutUs, 'Concurrent edit');
  const second = await backfillProfileSearch(db, true); assert.equal(second[0].updated, 1);
  assert.equal((await backfillProfileSearch(db)).reduce((sum, row) => sum + row.pending, 0), 0);
  for (const rows of Object.values(values)) assert.equal(rows[0].updatedAt, '2026-01-01');
});

test('both search contracts include all role About fields and a bounded candidate employment match without changing projection', async () => {
  const pipelines = [], replies = [];
  const controller = load('src/controllers/user.controller.ts', {
    '../utils/catchAsync': fn => fn, '../utils/sendResponse': (_res, value) => replies.push(value),
    '../utils/regex': load('src/utils/regex.ts'), '../utils/candidateDisplay': load('src/utils/candidateDisplay.ts'),
    '../utils/pagination': { getPaginationParams: () => ({ page: 1, limit: 12 }), buildMetaPagination: () => ({}) },
    '../models/user.model': { User: { aggregate: pipeline => { pipelines.push(pipeline); return { collation: async () => pipeline.some(row => row.$facet) ? [{ users: [], total: [] }] : [] }; } } },
  });
  await controller.fetchAllUsers({ query: { q: 'C++' } }, {});
  await controller.searchPeople({ query: { q: 'C++', page: '1', limit: '12' } }, {});
  for (const pipeline of pipelines) {
    const match = pipeline.find(row => row.$match?.$or).$match.$or;
    for (const [role, field] of [['candidate', 'resume.searchAboutText'], ['company', 'company.searchAboutText'], ['recruiter', 'recruiter.searchAboutText']]) {
      assert.ok(match.some(row => row.$and?.some(part => part.role === role) && row.$and.some(part => field in part)), role + ' must search only its public About');
    }
    const employment = pipeline.find(row => row.$lookup?.from === 'experiences').$lookup;
    assert.equal(employment.foreignField, 'userId'); assert.equal(employment.localField, '_id');
    assert.deepEqual(plain(employment.let.candidate), { $eq: ['$role', 'candidate'] });
    assert.equal(employment.pipeline.find(row => row.$limit).$limit, 1);
    assert.equal(employment.pipeline[0].$match.position.test('Engineer C++'), true);
    assert.equal(employment.pipeline[0].$match.position.test('Engineer C'), false);
    assert.ok(!pipeline.some(row => row.$unwind), 'Multiple roles must not duplicate people');
    const final = pipeline.at(-1);
    const project = final.$project ?? final.$facet.users.at(-1).$project;
    assert.equal(project.position, 1); assert.equal(project.searchAboutText, undefined);
    assert.equal(pipeline[0].$match.deactivate.$ne, true); assert.equal(pipeline[0].$match.deletionInProgress.$ne, true);
  }
  assert.equal(replies.length, 2);
});
