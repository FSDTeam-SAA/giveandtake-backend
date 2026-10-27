const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const fixtures = require('./fixtures/display-contract.json');
function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const scope = { exports: {}, console, process: { env: {} }, require: name => imports[name] ?? {} };
  vm.runInNewContext(code, scope); return scope.exports;
}
const policy = load('src/utils/candidateDisplay.ts');
test('backend salutation and name rules agree with the website/mobile fixtures', () => {
  for (const row of fixtures.headlines) assert.equal(policy.candidateHeadline(row.value), row.expected);
  for (const row of fixtures.names) assert.equal(policy.candidateName(row.firstName, row.lastName), row.expected);
});
test('people-search filters candidate salutations before search/pagination while retaining recruiter titles', async () => {
  let pipeline;
  const controller = load('src/controllers/user.controller.ts', {
    '../utils/candidateDisplay': policy,
    '../utils/catchAsync': fn => fn,
    '../utils/sendResponse': () => {},
    '../utils/regex': { escapeRegex: value => value, capQuery: value => typeof value === 'string' ? value.trim() : '' },
    '../models/user.model': { User: { aggregate: steps => { pipeline = steps; return { collation: async () => [] }; } } },
  });
  await controller.fetchAllUsers({ query: {} }, {});
  const branches = pipeline.find(step => step.$addFields?.position).$addFields.position.$switch.branches;
  const candidate = branches.find(branch => branch.case.$eq[1] === 'candidate').then.$cond;
  assert.equal(candidate[1], null);
  const regex = new RegExp(candidate[0].$regexMatch.regex, candidate[0].$regexMatch.options);
  for (const row of fixtures.headlines.filter(row => typeof row.value === 'string' && row.value.trim())) assert.equal(regex.test(row.value), row.expected === null);
  assert.equal(branches.find(branch => branch.case.$eq[1] === 'recruiter').then.$ifNull[0], '$recruiter.title');
});
test('current omitted-title updates preserve saved career/salutation data; legacy requests still work', async () => {
  for (const title of ['Mr.', 'Software Engineer']) {
    const saved = { title, firstName: 'Alex', lastName: 'Candidate' };
    let finish;
    const history = { sortExperiences: x => x, sortEducation: x => x, sortAwards: x => x };
    const controller = load('src/controllers/createResume.controller.ts', {
      '../models/user.model': { User: { findById: async () => ({ save: async () => {} }) } },
      '../models/createResume.model': { CreateResume: { findOneAndUpdate: async (_filter, update) => Object.assign(saved, update) } },
      '../utils/profileHistory': history,
      '../utils/awardInput': load('src/utils/awardInput.ts'),
      '../utils/candidateProfilePolicy': { hasEducationContent: () => false },
      'http-status': { OK: 200 },
      '../utils/sendResponse': () => finish(),
    });
    const invoke = resume => new Promise((resolve, reject) => {
      const reply = { status() { return this; }, json() { resolve(); } };
      finish = resolve;
      const handler = controller.updateResume;
      assert.ok(handler);
      handler({ user: { _id: 'user-1' }, body: { userId: 'user-1', resume: JSON.stringify(resume) }, files: {} }, reply, reject);
    });
    await invoke({ firstName: 'Mr. Alex', lastName: 'Candidate' });
    assert.equal(saved.title, title);
    assert.equal(saved.firstName, 'Mr. Alex');
    await invoke({ title: 'Legacy career', firstName: 'Alex', lastName: 'Candidate' });
    assert.equal(saved.title, 'Legacy career');
  }
});
