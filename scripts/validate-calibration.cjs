'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const combined = html + '\n' + app;

for (const id of [
  'maint-calibration-view', 'tab-maint-calibration', 'cal-asset',
  'cal-date', 'cal-valid-days', 'cal-certificate', 'cal-organization',
  'cal-operator', 'cal-result', 'cal-notes', 'table-calibration'
]) assert.ok(html.includes(id), 'calibration UI element must exist: ' + id);
assert.match(html, /onclick="saveCalibration\(\)"/,
  'calibration form must have an executable save action');

const saveStart = app.indexOf('async function saveCalibration()');
const saveEnd = app.indexOf('// ==================== 8. 备件管理', saveStart);
assert.ok(saveStart >= 0 && saveEnd > saveStart, 'saveCalibration function must exist');
const saveSource = app.slice(saveStart, saveEnd);
for (const token of [
  'domain.createCalibrationRecord', 'snapshotLabDB()', 'DB.calibrationLogs.unshift(record)',
  'await commitLabMutation(previousDB', 'certificateNo', 'organization', 'operator'
]) assert.ok(saveSource.includes(token), 'calibration save must enforce ' + token);

const renderStart = app.indexOf('async function renderCalibrationLogs()');
const renderEnd = app.indexOf('async function saveCalibration()', renderStart);
assert.ok(renderStart >= 0 && renderEnd > renderStart, 'calibration renderer must exist');
const renderSource = app.slice(renderStart, renderEnd);
assert.match(app, /return value \+ 'T00:00:00\\.000Z'/,
  'date-only calibration input must be stored at UTC midnight as a calendar date, not converted from local midnight');
assert.ok(renderSource.includes('domain.isCalibrationCurrent(record)'),
  'calibration UI must calculate current/expired status through the domain core');
assert.ok(renderSource.includes("record.result === 'fail'"),
  'failed calibration must remain visibly failed regardless of validity duration');
assert.ok(renderSource.includes('String(record.calibratedAt).slice(0, 10)'),
  'calibration history must display the original calendar date without a timezone-day shift');
assert.ok(renderSource.includes("dateInput.value = getToday()"),
  'the calibration form should default to the current local calendar date');

assert.ok(app.includes("if (!Array.isArray(DB.calibrationLogs)) DB.calibrationLogs = []"),
  'legacy cache migration must add an empty calibration table without inventing records');
assert.ok(app.includes('domain.createCalibrationRecord(row)'),
  'stored calibration records must be revalidated on startup and import');
assert.ok(app.includes("DB.calibrationLogs || []), \"设备校准记录\""),
  'Excel export must include the calibration history table');
assert.ok(app.includes('DB.calibrationLogs.unshift(record)'),
  'calibration history must be append-only from the user interface');
assert.ok(app.includes('storageRecoveryRequired') &&
  saveSource.includes('if (storageRecoveryRequired)'),
  'calibration saves must be blocked while source-cache recovery is required');

const start = app.indexOf('function isValidLabBackup(value) {');
const end = app.indexOf('function importFromLocal(event)', start);
assert.ok(start >= 0 && end > start, 'backup validator source must exist');
const source = app.slice(start, end);
const sandbox = {
  isValidDateOnly(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
};
vm.createContext(sandbox);
vm.runInContext(source + '\nthis.validateBackup = isValidLabBackup;', sandbox);

const legacyBackup = {
  gases: [], maintenance: [{ id: 11 }], spareParts: [], testDiary: [],
  maintLogs: [], spareLogs: []
};
assert.equal(sandbox.validateBackup(legacyBackup), true,
  'legacy backups without calibrationLogs must remain importable');

const validCalibration = {
  id: 101, assetId: 11, calibratedAt: '2026-01-01T08:00:00.000Z',
  validForDays: 365, certificateNo: 'CERT-001', organization: 'Metrology Lab',
  operator: 'Operator A', result: 'pass', notes: ''
};
assert.equal(sandbox.validateBackup({
  ...legacyBackup, calibrationLogs: [validCalibration]
}), true, 'well-formed calibration records linked to existing assets must import');

for (const [label, patch] of [
  ['orphan asset', { assetId: 99 }],
  ['invalid date', { calibratedAt: '2026-02-30T00:00:00Z' }],
  ['excess precision', { calibratedAt: '2026-01-01T00:00:00.1234Z' }],
  ['zero validity', { validForDays: 0 }],
  ['blank certificate', { certificateNo: ' ' }],
  ['blank organization', { organization: ' ' }],
  ['blank operator', { operator: ' ' }],
  ['unknown result', { result: 'unknown' }]
]) {
  assert.equal(sandbox.validateBackup({
    ...legacyBackup, calibrationLogs: [{ ...validCalibration, ...patch }]
  }), false, 'backup validator must reject ' + label);
}
assert.equal(sandbox.validateBackup({
  ...legacyBackup,
  calibrationLogs: [validCalibration, { ...validCalibration, id: 102 }]
}), false, 'duplicate asset/certificate references are rejected separately at save; duplicate row IDs are rejected in backup');
assert.equal(sandbox.validateBackup({
  ...legacyBackup, calibrationLogs: [validCalibration, { ...validCalibration }]
}), false, 'duplicate calibration row IDs must be rejected');

const importStart = app.indexOf('function importFromLocal(event)');
const importEnd = app.indexOf('// ==================== 初始化', importStart);
const importSource = app.slice(importStart, importEnd);
assert.ok(importSource.indexOf('isValidLabBackup(imported)') <
          importSource.indexOf('domain.createCalibrationRecord(row)'),
  'backup structure must validate before calibration rows are normalized');
assert.ok(importSource.indexOf('domain.createCalibrationRecord(row)') <
          importSource.indexOf('DB = imported;'),
  'calibration records must be fully validated before replacing the live database');

console.log('Equipment calibration UI, persistence, legacy backup compatibility, and import validation checks passed.');
