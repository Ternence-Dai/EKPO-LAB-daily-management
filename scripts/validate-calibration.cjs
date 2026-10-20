'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const productCss = fs.readFileSync('assets/css/product-system.css', 'utf8');
const combined = html + '\n' + app;

assert.ok(html.includes('product-system.css?v=20261019-v8'),
  'LabOS must load the V6 operations workspace stylesheet');
assert.ok(html.includes('class="labos-demo-note"'),
  'the source-data warning must retain a dedicated responsive style hook');
assert.ok(html.includes('class="topbar-actions"'),
  'backup and persistence actions must be grouped for small-screen layout');
const mobileNavStart = html.indexOf('<nav class="mobile-nav"');
const mobileNavEnd = html.indexOf('</nav>', mobileNavStart);
assert.ok(mobileNavStart >= 0 && mobileNavEnd > mobileNavStart,
  'LabOS must provide a mobile primary navigation');
const mobileNavSource = html.slice(mobileNavStart, mobileNavEnd);
const tabIds = ['dashboard', 'gases', 'maintenance', 'spareParts', 'testDiary', 'yearly', 'system'];
for (const id of tabIds) {
  assert.ok(mobileNavSource.includes('data-tab="' + id + '"') &&
            mobileNavSource.includes("switchTab('" + id + "')"),
    'mobile navigation must expose a working ' + id + ' route');
}
const switchStart = app.indexOf('function switchTab(tabId, element)');
const switchEnd = app.indexOf('function switchSubTab(parent, sub)', switchStart);
assert.ok(switchStart >= 0 && switchEnd > switchStart,
  'shared route switching must exist for desktop and mobile navigation');
const switchSource = app.slice(switchStart, switchEnd);
assert.ok(switchSource.includes("document.querySelectorAll('.mobile-nav button')") &&
          switchSource.includes("el.dataset.tab === tabId") &&
          switchSource.includes("el.classList.toggle('active', active)"),
  'route changes must keep the mobile active state synchronized with the selected page');
assert.ok(switchSource.includes("document.querySelectorAll('.nav-item')"),
  'the same route must keep desktop navigation synchronized');
for (const selector of ['.mobile-nav{', '.topbar-actions{', '.metrics-grid{', '.charts-row{', '#maint-calibration-view']) {
  assert.ok(productCss.includes(selector),
    'LabOS V3 must style the major operations surface: ' + selector);
}
assert.ok(productCss.includes('@media(max-width:900px)') &&
          productCss.includes('@media(max-width:520px)'),
  'LabOS must provide tablet and phone layouts');
assert.ok(productCss.includes('prefers-reduced-motion:reduce'),
  'LabOS must respect reduced motion settings');

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
assert.ok(app.includes("return value + 'T00:00:00.000Z'"),
  'date-only calibration input must be stored at UTC midnight as a calendar date, not converted from local midnight');
assert.ok(renderSource.includes('domain.isCalibrationCurrent(record)'),
  'calibration UI must calculate current/expired status through the domain core');
assert.ok(renderSource.includes("record.result === 'fail'"),
  'failed calibration must remain visibly failed regardless of validity duration');
assert.ok(renderSource.includes('String(record.calibratedAt).slice(0, 10)'),
  'calibration history must display the original calendar date without a timezone-day shift');
assert.ok(renderSource.includes("dateInput.value = getToday()"),
  'the calibration form should default to the current local calendar date');

const maintenanceStart = app.indexOf('async function renderMaintenance()');
const maintenanceEnd = app.indexOf('function renderMaintLogs()', maintenanceStart);
assert.ok(maintenanceStart >= 0 && maintenanceEnd > maintenanceStart,
  'equipment register renderer must remain available');
const maintenanceSource = app.slice(maintenanceStart, maintenanceEnd);
assert.ok(html.includes('<th>校准状态</th>'),
  'equipment register must expose the latest calibration status column');
for (const token of [
  'latestCalibrationByAsset', 'DB.calibrationLogs', 'calibrationDomain.isCalibrationCurrent(calibration)',
  "'未记录'", "'校准不合格'", "'已过期'", "'有效'"
]) assert.ok(maintenanceSource.includes(token),
  'equipment register must distinguish calibration state: ' + token);
assert.ok(maintenanceSource.includes("String(record.calibratedAt) > String(current.calibratedAt)"),
  'equipment register must use the newest calibration record for each asset');
assert.ok(maintenanceSource.includes('const key = String(record.assetId).trim()') &&
          maintenanceSource.includes('latestCalibrationByAsset.get(String(m.id).trim())'),
  'equipment register calibration labels must use the same trimmed asset identity as the domain readiness gate');


assert.ok(app.includes("if (!Array.isArray(DB.calibrationLogs)) DB.calibrationLogs = []"),
  'legacy cache migration must add an empty calibration table without inventing records');
assert.ok(app.includes('domain.createCalibrationRecord(row)'),
  'stored calibration records must be revalidated on startup and import');
const startupStart = app.indexOf('window.onload = async () =>');
const startupEnd = app.indexOf('renderDashboard();', startupStart);
assert.ok(startupStart >= 0 && startupEnd > startupStart,
  'stored calibration startup validation block must exist');
const startupSource = app.slice(startupStart, startupEnd);
assert.ok(startupSource.includes('const certificateReferences = new Set();') &&
          startupSource.includes('certificateReferences.has(reference)') &&
          startupSource.includes('校准台账包含重复的设备/机构/证书编号组合'),
  'legacy local caches must be locked for recovery if duplicate certificate references are found');
assert.ok(startupSource.indexOf('certificateReferences.has(reference)') <
          startupSource.indexOf('DB.calibrationLogs = validated;'),
  'duplicate certificate validation must run before trusted calibration records are accepted');

assert.ok(app.includes("DB.calibrationLogs || []), \"设备校准记录\""),
  'Excel export must include the calibration history table');
assert.ok(app.includes('DB.calibrationLogs.unshift(record)'),
  'calibration history must be append-only from the user interface');

assert.ok(app.includes('DB.maintenance.find(item => sameLabId(item.id, record.assetId))'),
  'calibration history must resolve equipment IDs using canonical identity');
assert.ok(app.includes('DB.maintenance.find(item => sameLabId(item.id, assetId))'),
  'new calibration records must accept canonical-equivalent equipment IDs');
assert.ok(app.includes('sameLabId(row.assetId, assetId)'),
  'duplicate certificate checks must use canonical equipment identity');
assert.ok(app.includes('const assetIds = new Set(DB.maintenance.map(asset => labIdKey(asset.id)))') &&
          app.includes('validated.some(row => !assetIds.has(labIdKey(row.assetId)))'),
  'startup calibration foreign-key checks must normalize the same IDs as the domain core');


const deleteStart = app.indexOf('async function deleteItem(table, id)');
const deleteEnd = app.indexOf('function exportAllToJSON()', deleteStart);
assert.ok(deleteStart >= 0 && deleteEnd > deleteStart,
  'shared delete handler must remain available');
const deleteSource = app.slice(deleteStart, deleteEnd);
assert.ok(deleteSource.includes("(DB.calibrationLogs || []).some(item => sameLabId(item.assetId, id))") &&
          deleteSource.includes('不能删除设备台账'),
  'equipment with calibration certificate history must not be deleted and orphan its calibration ledger');
assert.ok(app.includes('storageRecoveryRequired') &&
  saveSource.includes('if (storageRecoveryRequired)'),
  'calibration saves must be blocked while source-cache recovery is required');

const start = app.indexOf('function isValidLabBackup(value) {');
const end = app.indexOf('function importFromLocal(event)', start);
assert.ok(start >= 0 && end > start, 'backup validator source must exist');
const source = app.slice(start, end);
const sandbox = {
  labIdKey(value) { return typeof value === 'string' ? value.trim() : Number.isSafeInteger(value) ? String(value) : ''; },
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
}), false, 'backup validator must reject duplicate asset/organization/certificate references even when row IDs differ');
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
assert.ok(importSource.includes('const previousRecoveryRequired = storageRecoveryRequired;'),
  'backup import must snapshot whether the user was already in recovery mode');
const failedCommitStart = importSource.indexOf('if (!await commitLabMutation(previousDB');
const failedCommitEnd = importSource.indexOf('switchTab(\'dashboard\'', failedCommitStart);
const failedCommitBranch = importSource.slice(failedCommitStart, failedCommitEnd);
assert.ok(failedCommitBranch.includes('storageRecoveryRequired = previousRecoveryRequired || storageRecoveryRequired;') &&
          failedCommitBranch.includes('if (storageRecoveryRequired) storageWarning = true;'),
  'a failed restore write must preserve both the original lock and any newly raised cache-failure lock');


console.log('Equipment calibration UI, persistence, legacy backup compatibility, and import validation checks passed.');


assert.ok(productCss.includes('V4 · EKPO LabOS operations control room') &&
          productCss.includes('.labos-intro:after{') &&
          productCss.includes('.product-workflow__grid{') &&
          productCss.includes('.content-body .metrics-grid>.card:after{'),
  'EKPO V4 must implement the lab operations masthead, workflow cards and KPI treatment');
assert.ok(productCss.includes('@media(max-width:900px)') &&
          productCss.includes('@media(max-width:520px)') &&
          productCss.includes('.product-workflow__item:hover'),
  'EKPO V4 must include responsive operations workflows and interactive states');


assert.equal(sandbox.validateBackup({
  ...legacyBackup,
  calibrationLogs: [validCalibration, { ...validCalibration, id: 102, assetId: '11' }]
}), false,
  'backup validation must detect duplicate certificate references when equivalent equipment IDs use number and string forms');


assert.equal(sandbox.validateBackup({
  ...legacyBackup,
  calibrationLogs: [validCalibration, { ...validCalibration, id: 102, assetId: ' 11 ' }]
}), false,
  'backup validation must normalize whitespace around equipment references before checking duplicate certificates');
