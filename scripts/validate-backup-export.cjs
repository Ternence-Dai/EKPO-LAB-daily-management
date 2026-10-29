'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const start = app.indexOf('function exportAllToJSON()');
const end = app.indexOf('function exportAllToExcel()', start);
assert.ok(start >= 0 && end > start, 'JSON export function must exist');
const source = app.slice(start, end);
const validatorStart = app.indexOf('function isValidLabBackup(value) {');
const validatorEnd = app.indexOf('function importFromLocal(event)', validatorStart);
const dateStart = app.indexOf('function isValidDateOnly(value) {');
const dateEnd = app.indexOf('function isOverdueDateOnly(value', dateStart);
assert.ok(validatorStart >= 0 && validatorEnd > validatorStart, 'real backup validator must exist');
assert.ok(dateStart >= 0 && dateEnd > dateStart, 'calendar-date validator must exist');
const validatorSource = app.slice(validatorStart, validatorEnd);
const dateSource = app.slice(dateStart, dateEnd);

function runExport({ provenance, invalid = false, locked = false }) {
  const events = { downloads: [], toasts: [], revoked: 0, clicks: 0 };
  const anchor = {
    href: '',
    download: '',
    click() { events.clicks++; events.downloads.push(this.download); },
    remove() {}
  };
  const context = {
    DB: invalid
      ? { gases: [], maintenance: [{ id: 1 }, { id: 1 }], spareParts: [], testDiary: [], dataProvenance: provenance }
      : { gases: [], maintenance: [], spareParts: [], testDiary: [], dataProvenance: provenance },
    storageRecoveryRequired: locked,
    labIdKey(value) { return typeof value === 'string' ? value.trim() : Number.isSafeInteger(value) ? String(value) : ''; },
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
  vm.runInContext(dateSource + '\n' + validatorSource + '\n' + source + '\nthis.exportNow = exportAllToJSON;', context);
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
assert.match(userData.downloads[0], /^来源未核验_数据迁移副本_2026-10-20\.json$/,
  'legacy data without provenance must remain exportable but must not be labeled a verified backup');
assert.match(userData.toasts[0], /来源未核验.*不能替代独立业务核验/,
  'legacy data export must disclose that structural validation does not verify business provenance');

const forgedVerified = runExport({ provenance: 'verified-operational' });
assert.match(forgedVerified.downloads[0], /^来源未核验_数据迁移副本_2026-10-20\.json$/,
  'a self-asserted provenance field in an editable backup must not certify business data');
assert.match(forgedVerified.toasts[0], /来源未核验.*不能替代独立业务核验/,
  'export must disclose that source claims are not independently verified');

const invalid = runExport({ provenance: undefined, invalid: true });
assert.equal(invalid.clicks, 0, 'invalid database shape must not be exported as a backup');
assert.match(invalid.toasts[0], /阻止导出/);

const recovery = runExport({ provenance: 'demo-seed', locked: true });
assert.equal(recovery.clicks, 0, 'recovery mode must continue to block ordinary JSON export');
assert.match(recovery.toasts[0], /原始缓存/);


const validatorContext = {
  labIdKey(value) {
    return typeof value === 'string' ? value.trim()
      : Number.isSafeInteger(value) ? String(value) : '';
  }
};
vm.createContext(validatorContext);
vm.runInContext(dateSource + '\n' + validatorSource +
  '\nthis.validateBackup = isValidLabBackup;', validatorContext);
const normalizedForeignKey = validatorContext.validateBackup({
  gases: [],
  maintenance: [{ id: 7 }],
  spareParts: [],
  testDiary: [],
  calibrationLogs: [{
    id: 'CAL-NORMALIZED-FK',
    assetId: ' 7 ',
    calibratedAt: '2026-10-20T00:00:00.000Z',
    validForDays: 30,
    certificateNo: 'CERT-NORMALIZED-FK',
    organization: 'Calibration Lab',
    operator: 'technician',
    result: 'pass'
  }]
});
assert.equal(normalizedForeignKey, true,
  'calibration foreign keys must use the same trimmed numeric/string ID normalization as equipment references');

console.log('JSON backup export provenance and structure checks passed.');

// ---- Full round trip: export -> clear -> import -> re-export ----
// Regression coverage for the restore path: backups exported by this app
// carry equipment ids, and the domain field whitelist rejects ids, so the
// import normalization must strip the id for validation and re-attach it.
// This section runs the application's own import statements (extracted from
// importFromLocal) against the real domain module.
const importBlockStart = app.indexOf('if (!imported.maintLogs) imported.maintLogs = [];');
const importBlockEndMarker = 'DB = imported;';
const importBlockEnd = app.indexOf(importBlockEndMarker, importBlockStart);
assert.ok(importBlockStart >= 0 && importBlockEnd > importBlockStart,
  'import normalization block must be extractable from importFromLocal');
let importBlock = app.slice(importBlockStart, importBlockEnd + importBlockEndMarker.length);
importBlock = importBlock.replace(/const domain = await import\([^;]*\);/, 'const domain = __domain;');
assert.ok(!importBlock.includes('await import('),
  'the domain import inside the extracted block must be replaced by the real module');

async function runImportNormalization(imported, domain) {
  const context = {
    imported,
    __domain: domain,
    DB: null,
    labIdKey(value) {
      return typeof value === 'string' ? value.trim()
        : Number.isSafeInteger(value) ? String(value) : '';
    }
  };
  vm.createContext(context);
  await vm.runInContext('(async () => {\n' + importBlock + '\n})()', context);
  return context.DB;
}

(async () => {
  const path = require('node:path');
  const { pathToFileURL } = require('node:url');
  const domain = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'domain', 'index.js')).href);

  const calibration = domain.createCalibrationRecord({
    id: 101, assetId: 2, calibratedAt: '2026-10-01T00:00:00.000Z', validForDays: 365,
    certificateNo: 'CERT-2026-001', organization: '示例计量机构', operator: '示例操作员',
    result: 'pass', notes: ''
  });
  const experiment = domain.createExperimentRecord({
    id: 'EXP-RT-1', title: '往返校验实验', assetId: 2, plannedDate: '2026-11-01',
    owner: '示例负责人', purpose: '备份往返校验', actor: '示例操作员',
    createdAt: '2026-10-20T00:00:00.000Z'
  });
  const fullLedger = {
    dataProvenance: 'local-ledger',
    gases: [
      { id: 1, item: 'Hydrogen', spec: '99.999%', supplier: '示例供应商 A', batch: 'H2-20260101', month: '2026-01', year: 2026, monthNum: 1, delivery: 182, return: 76, consumption: 106, unit: 'm³', cost: 9354.7, rent: 19827.58, freight: 3000 },
      { id: 2, item: 'Nitrogen', spec: '99.999%', supplier: '示例供应商 A', batch: 'N2-20260301', month: '2026-03', year: 2026, monthNum: 3, delivery: 48, return: 12, consumption: 36, cost: 2110.5, rent: 0, freight: 0 }
    ],
    maintenance: [
      { id: 1, name: '压力传感器', category: '传感器', location: '氮气房', qty: 17, cycle: '一级保养', freq: '季度', last: '2026-01-01', next: '2026-04-01', responsible: '示例责任人', record: '' },
      { id: 2, name: '燃料电池测试台架', category: '实验设备', location: '实验室', qty: 1, cycle: '二级保养', freq: '年度', last: '2026-01-01', next: '2027-01-01', responsible: '示例责任人', record: 'WAGO模块IO错误' }
    ],
    maintLogs: [
      { id: 1, eqId: 1, date: '2026-01-01', checker: '示例校验机构', operator: '示例操作员 A', cost: 5000, record: '季度校验' },
      { id: 2, eqId: 2, date: '2026-01-01', checker: '示例维保机构', operator: '示例操作员 B', cost: 20000, record: '年度维保' }
    ],
    spareParts: [
      { id: 1, category: 'PWM Box', desc: 'Pulse regulator', catalog: 'PWM-001', purpose: 'Stack testing', qty: 1, brand: '未配置', price: 0, location: '待配置库位', update: '2026-01-15' },
      { id: 2, category: 'Blower', desc: 'recirculation', catalog: 'BLW-002', purpose: 'Stack testing', qty: 2, brand: '示例品牌', price: 160000, location: '待配置库位', update: '2026-01-10' }
    ],
    spareLogs: [
      { id: 1, partId: 1, date: '2026-01-15', action: '入库', qty: 1, operator: '示例操作员 A', note: '新购备件入库' }
    ],
    calibrationLogs: [calibration],
    experiments: [experiment],
    testDiary: [
      { id: 1, start: '2026-01-11', end: '2026-01-12', duration: 2, unit: '示例测试台架 01', operator: '示例操作员', sap: 'Ok', result: 'Ok', cycle: 'C-1', error: '', errorDesc: '' }
    ]
  };

  assert.equal(validatorContext.validateBackup(fullLedger), true,
    'the full ledger fixture must pass the export structure gate');
  const exportedText = JSON.stringify(fullLedger, null, 2);
  const imported = JSON.parse(exportedText);
  assert.equal(validatorContext.validateBackup(imported), true,
    'an exported backup must pass the import structure gate');
  const restored = await runImportNormalization(imported, domain);
  assert.ok(restored, 'import normalization must produce the restored ledger');
  assert.equal(validatorContext.validateBackup(restored), true,
    'the restored ledger must be exportable again');
  for (const key of ['gases', 'maintenance', 'maintLogs', 'spareParts', 'spareLogs', 'calibrationLogs', 'experiments', 'testDiary']) {
    // Compare as JSON data: rows rebuilt inside the vm realm carry that
    // realm's prototypes, which deepStrictEqual would reject spuriously.
    assert.deepEqual(JSON.parse(JSON.stringify(restored[key])), fullLedger[key],
      `table ${key} must survive export -> import unchanged`);
  }
  assert.equal(restored.maintenance[1].id, 2, 'equipment identifiers must be preserved by restore');
  console.log('Full backup round trip (export -> import -> re-export) checks passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
