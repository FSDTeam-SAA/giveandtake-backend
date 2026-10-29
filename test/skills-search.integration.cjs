// Optional isolated MongoDB verification. Never reads MONGO_URI or production data.
// MONGODB_MEMORY_SERVER_MODULE must resolve to separately installed mongodb-memory-server.
// Run: node --test test/skills-search.integration.cjs
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require(process.env.MONGODB_MEMORY_SERVER_MODULE || 'mongodb-memory-server');

function load(file, imports = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, console, process: { env: {}, argv: [] },
    require: name => imports[name] ?? (name.startsWith('.') ? {} : require(name)) }, { filename: file });
  return module.exports;
}
const about = load('src/utils/profileSearch.ts');
const models = {};
for (const [name, source, file] of [['Candidate', 'aboutUs', 'createResume.model.ts'], ['Company', 'aboutUs', 'company.model.ts'], ['Recruiter', 'bio', 'recruiterAccount.model.ts']]) {
  const exported = load('src/models/' + file, { '../utils/profileSearch': about });
  models[name] = exported.CreateResume || exported.Company || exported.RecruiterAccount;
}
const Experience = load('src/models/experience.model.ts').Experience;
const SkillModel = load('src/models/skill.model.ts').SkillModel;
const SkillReview = load('src/models/skillReview.model.ts').SkillReview;
const AppError = load('src/errors/AppError.ts');
const catalog = load('src/utils/skillCatalog.ts', { '../errors/AppError': AppError });
const User = mongoose.model('SkillsSearchFixtureUser', new mongoose.Schema({}, { strict: false, collection: 'users' }));
let memory;
const id = number => new mongoose.Types.ObjectId(number.toString(16).padStart(24, '0'));
const controller = load('src/controllers/user.controller.ts', {
  '../models/user.model': { User }, '../utils/catchAsync': fn => fn,
  '../utils/regex': load('src/utils/regex.ts'), '../utils/pagination': load('src/utils/pagination.ts'),
  '../utils/candidateDisplay': load('src/utils/candidateDisplay.ts'),
  '../utils/sendResponse': (_res, payload) => _res.json(payload),
});
const skillController = load('src/controllers/skill.controller.ts', {
  '../models/skill.model': { SkillModel }, '../models/skillReview.model': { SkillReview },
  '../models/createResume.model': { CreateResume: models.Candidate }, '../utils/catchAsync': fn => fn,
  '../errors/AppError': AppError, '../utils/skillCatalog': catalog,
});
async function call(handlers, method, request = {}) {
  let payload, replies = 0;
  const res = { status() { return this; }, setHeader() {}, json(value) { payload = value; replies++; } };
  await handlers[method]({ query: {}, body: {}, params: {}, user: { _id: id(99) }, ...request }, res);
  assert.equal(replies, 1);
  return payload;
}
before(async () => {
  memory = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName: 'skills_search_isolated' }, binary: { version: process.env.MONGOMS_VERSION || '7.0.24' } });
  const uri = memory.getUri();
  assert.ok(uri.startsWith('mongodb://127.0.0.1:'), 'Only the newly created loopback database is allowed');
  await mongoose.connect(uri, { autoCreate: false, autoIndex: false });
  await Experience.createIndexes();
  await SkillModel.createIndexes();
}, { timeout: 240000 });
after(async () => { await mongoose.disconnect(); if (memory) await memory.stop(); });
beforeEach(async () => {
  for (const collection of ['users', 'createresumes', 'companies', 'recruiteraccounts', 'experiences', 'skillmodels', 'skillreviews']) await mongoose.connection.db.collection(collection).deleteMany({});
  await User.insertMany([
    { _id: id(1), name: 'Ibukun Emmanuel', slug: 'ibukun-emmanuel', role: 'candidate' },
    { _id: id(2), name: 'About Candidate', slug: 'about-only', role: 'candidate' },
    { _id: id(3), name: 'Company', slug: 'company-about', role: 'company' },
    { _id: id(4), name: 'Recruiter', slug: 'recruiter-about', role: 'recruiter' },
    { _id: id(5), name: 'Multiple Matches', slug: 'multiple', role: 'candidate' },
    { _id: id(6), name: 'Deactivated', slug: 'inactive', role: 'candidate', deactivate: true },
    { _id: id(7), name: 'Deleting', slug: 'deleting', role: 'candidate', deletionInProgress: true },
    { _id: id(8), name: 'Malachi Adebayo', slug: 'malachi-adebayo', role: 'candidate' },
    { _id: id(9), name: 'Emmanuel Joseph', slug: 'emmanuel-joseph', role: 'candidate' },
    { _id: id(10), name: 'Literal Match', slug: 'literal', role: 'candidate' },
  ]);
  for (const row of [
    { userId: id(1), title: '', aboutUs: 'Leadership and governance', skills: ['Strategy'] },
    { userId: id(2), aboutUs: '<p>ri<strong>sk</strong> &amp; resilience</p>', skills: ['Strategy'] },
    { userId: id(5), aboutUs: 'Risk management', skills: ['Risk'], immediatelyAvailable: true },
    { userId: id(6), aboutUs: 'Risk', skills: ['Risk'] },
    { userId: id(7), aboutUs: 'Risk', skills: ['Risk'] },
    { userId: id(8), skills: ['Risk'] },
    { userId: id(9), title: 'Risk Analyst', skills: ['Strategy'] },
    { userId: id(10), aboutUs: '<a href="https://secret.example/hidden">Visible</a><script>secretScript</script><style>secretStyle</style>', skills: ['C++'] },
  ]) await models.Candidate.create(row);
  await models.Company.create({ userId: id(3), cname: 'Company', country: 'UK', city: 'London', cemail: 'company@example.test', aboutUs: '<p>Risk company expertise</p>' });
  await models.Recruiter.create({ userId: id(4), bio: '<p>Risk recruiting expertise</p>' });
  await Experience.insertMany([
    { userId: id(1), position: 'Founder', startDate: new Date('2024-01-01') },
    { userId: id(1), position: 'Senior Risk and Controls Consultant', startDate: new Date('2022-09-01'), endDate: new Date('2023-04-01') },
    { userId: id(5), position: 'Risk Analyst' }, { userId: id(5), position: 'Risk Auditor' },
    { userId: id(10), position: 'Engineer C++ (Platform)' },
  ]);
});

test('real Mongo lookup finds previous titles, every role About and existing matches once', async () => {
  const legacy = await call(controller, 'fetchAllUsers', { query: { q: ' Risk ' } });
  const rows = legacy.data;
  assert.equal(rows.length, 7);
  assert.equal(new Set(rows.map(row => String(row._id))).size, rows.length);
  for (const slug of ['ibukun-emmanuel', 'about-only', 'company-about', 'recruiter-about', 'multiple', 'malachi-adebayo', 'emmanuel-joseph']) assert.ok(rows.some(row => row.slug === slug), slug);
  for (const slug of ['inactive', 'deleting']) assert.ok(!rows.some(row => row.slug === slug));
  assert.equal(rows[0].slug, 'multiple', 'Availability-first sort is retained');
  assert.equal(rows.find(row => row.slug === 'ibukun-emmanuel').position, '', 'Historical match does not replace headline');
  assert.ok(rows.every(row => !('searchAboutText' in row) && !('employmentMatches' in row)));
});

test('web pagination totals, role filters, availability and literal punctuation match legacy eligibility', async () => {
  const web = await call(controller, 'searchPeople', { query: { q: 'risk', limit: '2', page: '2' } });
  assert.equal(web.data.users.length, 2); assert.equal(web.data.meta.totalItems, 7); assert.equal(web.data.meta.totalPages, 4);
  const companies = await call(controller, 'searchPeople', { query: { q: 'risk', role: 'company' } });
  assert.equal(companies.data.users.length, 1); assert.equal(companies.data.users[0].slug, 'company-about');
  const immediate = await call(controller, 'searchPeople', { query: { q: 'risk', immediate: 'true' } });
  assert.equal(immediate.data.users.length, 1); assert.equal(immediate.data.users[0].slug, 'multiple');
  const literal = await call(controller, 'fetchAllUsers', { query: { q: 'C++ (Platform)' } });
  assert.equal(literal.data.length, 1); assert.equal(literal.data[0].slug, 'literal');
  for (const q of ['secretScript', 'secretStyle', 'secret.example', 'nothing-matches']) assert.equal((await call(controller, 'fetchAllUsers', { query: { q } })).data.length, 0, q);
});

test('real model saves and partial updates own derived text, including clearing and operator spoofing', async () => {
  for (const [name, source, userId] of [['Candidate', 'aboutUs', id(2)], ['Company', 'aboutUs', id(3)], ['Recruiter', 'bio', id(4)]]) {
    const Model = models[name];
    await Model.updateOne({ userId }, { $set: { [source]: '<p>New &amp; searchable</p>', searchAboutText: 'spoofed' } });
    assert.equal((await Model.findOne({ userId }).select('+searchAboutText')).searchAboutText, 'New & searchable');
    await Model.findOneAndUpdate({ userId }, { searchAboutText: 'spoofed' });
    assert.equal((await Model.findOne({ userId }).select('+searchAboutText')).searchAboutText, 'New & searchable');
    await Model.updateOne({ userId }, { $rename: { [source]: 'searchAboutText' } });
    assert.equal((await Model.findOne({ userId }).select('+searchAboutText')).searchAboutText, 'New & searchable');
    await Model.findOneAndUpdate({ userId }, { [source]: '' });
    assert.equal((await Model.findOne({ userId }).select('+searchAboutText')).searchAboutText, '');
  }
});

test('users with historical documents in another role do not match hidden former-role About text', async () => {
  await models.Candidate.create({ userId: id(3), aboutUs: 'privateFormerRoleKeyword', skills: ['Legacy'] });
  await models.Recruiter.create({ userId: id(1), bio: 'privateFormerRecruiterKeyword' });
  for (const q of ['privateFormerRoleKeyword', 'privateFormerRecruiterKeyword']) {
    assert.equal((await call(controller, 'fetchAllUsers', { query: { q } })).data.length, 0, q);
  }
  assert.equal((await call(controller, 'searchPeople', { query: { q: 'Risk', role: 'company' } })).data.users.length, 1);
});

test('raw backfill changes only derived metadata and is idempotent on actual Mongo collections', async () => {
  const { backfillProfileSearch } = load('src/scripts/backfill-profile-search.ts', { dotenv: { config() {} }, '../utils/profileSearch': about });
  const collection = mongoose.connection.db.collection('createresumes');
  const before = await collection.findOne({ userId: id(1) });
  await collection.updateOne({ _id: before._id }, { $unset: { searchAboutText: 1 } });
  const dry = await backfillProfileSearch(mongoose.connection.db);
  assert.equal(dry[0].pending, 1); assert.ok(!(await collection.findOne({ _id: before._id })).searchAboutText);
  const applied = await backfillProfileSearch(mongoose.connection.db, true); assert.equal(applied[0].updated, 1);
  const after = await collection.findOne({ _id: before._id });
  assert.equal(after.aboutUs, before.aboutUs); assert.deepEqual(after.updatedAt, before.updatedAt); assert.deepEqual(after.createdAt, before.createdAt);
  assert.equal(after.searchAboutText, 'Leadership and governance');
  assert.equal((await backfillProfileSearch(mongoose.connection.db)).reduce((sum, row) => sum + row.pending, 0), 0);
});

test('real catalog review and duplicate approval races do not change persisted profiles', async () => {
  const profiles = await mongoose.connection.db.collection('createresumes').find().toArray();
  const before = JSON.stringify(profiles);
  await models.Candidate.updateOne({ userId: id(1) }, { skills: ['Unique custom skill', ' unique   CUSTOM skill '] });
  const saved = JSON.stringify(await mongoose.connection.db.collection('createresumes').find().toArray());
  const key = catalog.skillKey('Unique custom skill');
  const pending = await call(skillController, 'listSkillSubmissions');
  assert.equal(pending.data.find(row => row.key === key).count, 1);
  await Promise.all([
    call(skillController, 'reviewSkillSubmission', { body: { key, action: 'approve' } }),
    call(skillController, 'reviewSkillSubmission', { body: { key, action: 'approve' } }),
  ]);
  assert.equal(await SkillModel.countDocuments({ normalizedKey: key }), 1);
  assert.equal(await SkillReview.countDocuments({ _id: key }), 1);
  const skill = await SkillModel.findOne({ normalizedKey: key });
  await call(skillController, 'updateSkill', { params: { id: String(skill._id) }, body: { active: false } });
  assert.ok(!(await call(skillController, 'getAllSkills')).data.some(row => catalog.skillKey(row.name) === key));
  await call(skillController, 'reviewSkillSubmission', { body: { key, action: 'reject' } });
  assert.ok(!(await call(skillController, 'listSkillSubmissions')).data.some(row => row.key === key));
  assert.equal(JSON.stringify(await mongoose.connection.db.collection('createresumes').find().toArray()), saved);
  assert.notEqual(before, saved, 'Only the explicitly simulated candidate edit changed skills');
});

test('employment lookup uses the targeted userId index in an actual aggregation plan', async () => {
  let pipeline;
  const capture = load('src/controllers/user.controller.ts', {
    '../models/user.model': { User: { aggregate: steps => { pipeline = steps; return { collation: async () => [] }; } } },
    '../utils/catchAsync': fn => fn, '../utils/sendResponse': () => {},
    '../utils/regex': load('src/utils/regex.ts'), '../utils/candidateDisplay': load('src/utils/candidateDisplay.ts'),
  });
  await capture.fetchAllUsers({ query: { q: 'risk' } }, {});
  const explanation = await mongoose.connection.db.collection('users').aggregate(pipeline).explain('executionStats');
  const stage = explanation.stages.find(row => row.$lookup?.from === 'experiences');
  assert.ok(stage, 'Employment lookup must be present');
  assert.ok(stage.indexesUsed.includes('experience_user_idx'), JSON.stringify(stage));
  assert.equal(Number(stage.collectionScans), 0);
  console.log('Isolated lookup plan:', JSON.stringify({ indexesUsed: stage.indexesUsed, collectionScans: stage.collectionScans, totalDocsExamined: stage.totalDocsExamined }));
});
