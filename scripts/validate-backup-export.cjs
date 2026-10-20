'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const start = app.indexOf('function exportAllToJSON()');
const end = app.indexOf('function exportAllToExcel()', start);
assert.ok(start >= 0 && end > start, 'JSON export function must exist');
const source = app.slice(start, end);

function runExport({ provenance, valid = true, locked = false }) {
  const events = { downloads: [], toasts: [], revoked: 0, clicks: 0 };
  const anchor = {
    href: '',
    download: '',
    click() { events.clicks++; events.downloads.push(this.download); },
    remove() {}
  };
  const context = {
    DB: { gases: [], maintenance: [], spareParts: [], testDiary: [], dataProvenance: provenance },
    storageRecoveryRequired: locked,
    isValidLabBackup: () => valid,
    getToday: () => '2026-10-20',
    showToast: message => events.toasts.push(message),
    Blob: class { constructor(parts, options) { this.parts = parts; this.options = options; } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => { events.revoked++; } },
    document: {
      createElement: () => anchor,
      body: { appendChild() {} }
    }
  };
  vm.createContext(context);
  vm.runInContext(source + '\nthis.exportNow = exportAllToJSON;', context);
  context.exportNow();
  return events;
}

const demo = runExport({ provenance: 'demo-seed' });
assert.equal(demo.clicks, 1, 'valid demo seed data should remain exportable for review');
assert.match(demo.downloads[0], /^演示样例_需核验_2026-10-20\.json$/,
  'demo seed export filename must clearly disclose that it is not a verified backup');
assert.match(demo.toasts[0], /未经业务核验，不可作为真实实验室备份/,
  'demo seed export must warn that its records are not verified');
assert.equal(demo.revoked, 1, 'temporary download URL must be revoked');

const userData = runExport({ provenance: undefined });
assert.match(userData.downloads[0], /^燃料电池实验室数据备份_2026-10-20\.json$/,
  'unmarked/imported operational data should retain the normal backup filename');
assert.match(userData.toasts[0], /通过结构校验/,
  'normal backup export must report structural validation');

const invalid = runExport({ provenance: undefined, valid: false });
assert.equal(invalid.clicks, 0, 'invalid database shape must not be exported as a backup');
assert.match(invalid.toasts[0], /阻止导出/);

const recovery = runExport({ provenance: 'demo-seed', locked: true });
assert.equal(recovery.clicks, 0, 'recovery mode must continue to block ordinary JSON export');
assert.match(recovery.toasts[0], /原始缓存/);

console.log('JSON backup export provenance and structure checks passed.');
