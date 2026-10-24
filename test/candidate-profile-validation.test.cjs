const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { validateFieldLimits, fieldLimits } = require('../src/middlewares/fieldLimits');
const { candidateSocialUrlError } = require('../src/utils/candidateProfilePolicy');

test('candidate social URLs enforce length, platform, scheme and hostname boundaries', () => {
  for (const [label, domain] of [['LinkedIn','linkedin.com'],['Twitter','x.com'],['Facebook','facebook.com'],['TikTok','tiktok.com'],['Instagram','instagram.com'],['Upwork','upwork.com'],['Fiverr','fiverr.com'],['Others','example.com']]) {
    const base = `https://${domain}/`;
    const url = base + 'a'.repeat(160 - base.length);
    assert.equal(candidateSocialUrlError(url, label), undefined);
    assert.match(candidateSocialUrlError(url + 'a', label), /160/);
    assert.equal(candidateSocialUrlError('', label), undefined);
  }
  assert.equal(candidateSocialUrlError('https://uk.linkedin.com/in/person', 'LinkedIn'), undefined);
  assert.equal(candidateSocialUrlError('https://twitter.com/person', 'Twitter'), undefined);
  for (const url of ['https://linkedin.com.evil.test/person','https://evil.test/linkedin.com','https://user:pass@linkedin.com','ftp://linkedin.com','javascript:alert(1)','linkedin.com/person','https://linkedin.com:99999']) {
    assert.ok(candidateSocialUrlError(url, 'LinkedIn'), url);
  }
  assert.ok(candidateSocialUrlError('https://linkedin.com/in/person', 'TikTok'));
});

test('candidate create requires skills; edits reject empty skills while unrelated partial edits remain valid', () => {
  const payload = resume => ({ resume: JSON.stringify(resume) });
  for (const creating of [false, true]) {
    for (const skills of [[], [' '], ['React', '']]) {
      assert.throws(() => validateFieldLimits('resume', payload({ skills }), { creating }), /skill/i);
    }
    validateFieldLimits('resume', payload({ skills: ['Saved legacy skill'] }), { creating });
  }
  assert.throws(() => validateFieldLimits('resume', payload({}), { creating: true }), /skill/i);
  validateFieldLimits('resume', payload({ aboutUs: 'Unrelated edit' }));
});

test('education requires institution on populated rows and permits empty placeholders and deletion', () => {
  const check = rows => validateFieldLimits('resume', { educationList: JSON.stringify(rows) });
  check([{}, { instituteName: '   ' }, { instituteName: 'A school outside the catalogue' }]);
  check([{ _id: 'old-row', type: 'delete', instituteName: '' }]);
  for (const row of [{degree:'Bachelors'}, {city:'Dhaka'}, {currentlyStudying:true}, {_id:'existing', type:'update', instituteName:''}]) {
    assert.throws(() => check([row]), /Institution name is required/);
  }
  check([{instituteName:'A'.repeat(150)}]);
  assert.throws(() => check([{instituteName:'A'.repeat(151)}]), /150/);
});

test('invalid multipart candidate input is rejected before the write handler', () => {
  for (const body of [
    {resume: JSON.stringify({skills:[]})},
    {resume: JSON.stringify({sLink:[{label:'TikTok',url:'https://linkedin.com/in/person'}]})},
    {educationList: JSON.stringify([{degree:'Bachelors'}])},
    {educationList:'not-json'},
  ]) {
    let writes = 0;
    fieldLimits('resume')({body}, {}, error => { if (!error) writes++; else assert.equal(error.statusCode, 400); });
    assert.equal(writes, 0);
  }
});
