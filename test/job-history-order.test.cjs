const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function historyController(records) {
  const requests = [];
  const { outputText } = ts.transpileModule(
    fs.readFileSync(path.resolve(__dirname, '../src/controllers/appliedJob.controller.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } },
  );
  const imports = {
    '../utils/catchAsync': handler => handler,
    '../errors/AppError': class extends Error {
      constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
    },
    mongoose: { Types: { ObjectId: { isValid: () => true } } },
    'http-status': { OK: 200, BAD_REQUEST: 400 },
    '../services/candidateAccess.service': { assertVisibleAccount: async () => {} },
    '../utils/pagination': {
      getPaginationParams: ({ page = 1, limit = 2 }) => ({ page, limit, skip: (page - 1) * limit }),
      buildMetaPagination: (totalItems, currentPage, itemsPerPage) => ({ totalItems, currentPage, itemsPerPage }),
    },
    '../models/appliedJob.model': { AppliedJob: {
      countDocuments: async () => records.length,
      find(filter) {
        requests.push(filter);
        let sort, skip = 0, limit = records.length;
        const query = {
          populate() { return query; },
          sort(value) {
            assert.equal(value.createdAt, -1);
            assert.equal(value._id, -1);
            sort = value;
            return query;
          },
          skip(value) { skip = value; return query; },
          limit(value) { limit = value; return query; },
          then(resolve) {
            const rows = [...records];
            if (sort) rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b._id.localeCompare(a._id));
            resolve(rows.slice(skip, skip + limit));
          },
        };
        return query;
      },
    } },
    '../models/createResume.model': { CreateResume: { findOne: () => ({ lean: async () => null }) } },
    '../models/education.model': { Education: { find: async () => [] } },
    '../models/experience.model': { Experience: { find: async () => [] } },
    '../models/awardsAndHonor.model': { AwardsAndHonor: { find: async () => [] } },
    '../services/candidatePitchEntitlement.service': { getAvailableCandidatePitch: async () => null },
  };
  const context = { exports: {}, require: name => imports[name] ?? {} };
  vm.runInNewContext(outputText, context);
  return { handler: context.exports.getApplicationsByUser, requests };
}

test('job history sorts newest applications across pages, with stable date ties', async () => {
  const { handler, requests } = historyController([
    { _id: 'a', createdAt: '2024-01-01T00:00:00Z' },
    { _id: 'b', createdAt: '2026-10-01T00:00:00Z' },
    { _id: 'c', createdAt: '2026-10-01T00:00:00Z' },
    { _id: 'd', createdAt: '2025-01-01T00:00:00Z' },
  ]);
  const pages = [];
  for (const page of [1, 2]) {
    const res = { status() { return this; }, json(body) { pages.push(body); } };
    await handler({ params: { userId: 'owner' }, user: { _id: 'owner' }, query: { page, limit: 2, status: 'pending' } }, res);
  }
  assert.deepEqual(pages[0].data.applications.map(row => row._id), ['c', 'b']);
  assert.deepEqual(pages[1].data.applications.map(row => row._id), ['d', 'a']);
  assert.equal(pages[0].meta.totalItems, 4);
  assert.equal(requests[0].userId, 'owner');
  assert.equal(requests[0].status, 'pending');
});

test('history ordering preserves access restrictions', async () => {
  const { handler, requests } = historyController([]);
  await assert.rejects(handler({ params: { userId: 'owner' }, user: { _id: 'someone-else', role: 'candidate' }, query: {} }, {}), error => error.statusCode === 403);
  assert.equal(requests.length, 0);
});
