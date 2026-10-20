'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const domain = fs.readFileSync('src/domain/index.js', 'utf8');
const css = fs.readFileSync('assets/css/product-system.css', 'utf8');
const workspaceCss = fs.readFileSync('assets/css/workspace-v5.css', 'utf8');
const seed = fs.readFileSync('assets/js/demo-seed-data.js', 'utf8');

assert.ok(html.includes('product-system.css?v=20261019-v8'),
  'LabOS must load the experiment lifecycle V6 workflow stylesheet revision');
for (const id of [
  'page-experiments', 'experiment-create-form', 'experiment-title',
  'experiment-asset', 'experiment-planned-date', 'experiment-owner',
  'experiment-creator', 'experiment-purpose', 'experiment-action-actor',
  'experiments-table', 'search-experiments', 'experiment-count-planned',
  'experiment-count-active', 'experiment-count-completed', 'experiment-count-cancelled'
]) assert.ok(html.includes('id="' + id + '"'),
  'experiment lifecycle UI must expose ' + id);
assert.ok(html.includes('data-tab="experiments"') &&
          html.includes("switchTab('experiments')"),
  'experiment lifecycle page must be reachable from the mobile navigation');
assert.ok(html.includes("switchTab('experiments', this)"),
  'experiment lifecycle page must be reachable from the desktop navigation');

assert.ok(domain.includes('export function createExperimentRecord(') &&
          domain.includes('export function validateExperimentRecord('),
  'domain core must create and verify lifecycle records');
assert.ok(domain.includes('experiment audit timestamps must be chronological') &&
          domain.includes('experiment status does not match its audit history'),
  'domain core must reject inconsistent or reordered audit histories');
assert.ok(seed.includes('experiments: []') &&
          seed.includes('No fabricated experiment plans or execution records are seeded'),
  'demo data must not invent experiment plans or run records');

const renderStart = app.indexOf('async function renderExperiments()');
const createStart = app.indexOf('async function createLabExperiment()', renderStart);
const transitionStart = app.indexOf('async function transitionLabExperiment(id, nextStatus)', createStart);
const bindStart = app.indexOf('function bindExperimentActions()', transitionStart);
const yearlyStart = app.indexOf('function renderYearlyFilter()', bindStart);
assert.ok(renderStart >= 0 && createStart > renderStart && transitionStart > createStart &&
          bindStart > transitionStart && yearlyStart > bindStart,
  'LabOS experiment lifecycle render/create/transition/bind functions must exist');
const render = app.slice(renderStart, createStart);
const create = app.slice(createStart, transitionStart);
const transition = app.slice(transitionStart, bindStart);
const binding = app.slice(bindStart, yearlyStart);
assert.ok(render.includes('record.audit.map') && render.includes('data-experiment-action') &&
          render.includes('record.owner') && render.includes('record.plannedDate') && render.includes('record.purpose'),
  'experiment table must display owners, planned dates, permitted actions and audit history');
assert.ok(render.includes('domain.getExperimentEquipmentReadiness(') &&
          render.includes('readiness.label') && render.includes('readiness.ready ?') &&
          render.includes('disabled aria-disabled="true"'),
  'experiment workspace must show each equipment calibration state and disable unsafe planned starts');
assert.ok(create.includes('domain.createExperimentRecord') &&
          create.includes('DB.experiments.push(record)') &&
          create.includes('snapshotLabDB()') &&
          create.includes('commitLabMutation(') &&
          create.includes('form.checkValidity()'),
  'experiment creation must validate fields and use transactional persistence');
assert.ok(transition.includes('domain.validateExperimentRecord(DB.experiments[index])') &&
          transition.includes('domain.transitionExperiment(') &&
          transition.includes('domain.validateExperimentRecord(updated)') &&
          transition.includes('snapshotLabDB()') &&
          transition.includes('commitLabMutation('),
  'each lifecycle transition must validate and atomically persist its audit trail');
const saveMaintStart = app.indexOf('async function saveMaint()');
const saveMaintEnd = app.indexOf('function editMaintLog(', saveMaintStart);
const saveMaintSource = app.slice(saveMaintStart, saveMaintEnd);
assert.ok(saveMaintSource.includes('sameLabId(item.id, newRecordId)'),
  'new equipment IDs must be checked using the shared canonical identity helper');

assert.ok(domain.includes('export function getAssetCalibrationStatus(') &&
          domain.includes('export function getExperimentEquipmentReadiness(') &&
          transition.includes('domain.getExperimentEquipmentReadiness(') &&
          transition.includes("nextStatus === 'in-progress'") &&
          transition.includes('!readiness.ready') &&
          transition.indexOf('domain.getExperimentEquipmentReadiness(') < transition.indexOf('domain.transitionExperiment('),
  'experiment start must be blocked unless the centralized equipment-readiness gate confirms a current passing calibration');
for (const status of ['not-recorded', 'future-dated', 'failed', 'expired', 'ambiguous', 'not-registered']) {
  assert.ok(domain.includes(JSON.stringify(status)),
    'domain equipment-readiness gate must explain the calibration failure state: ' + status);
}
assert.ok(workspaceCss.includes('.experiment-calibration-ready') &&
          workspaceCss.includes('.experiment-calibration-blocked'),
  'experiment table must visually distinguish equipment with current vs blocked calibration');

assert.ok(transition.includes('experiment-action-actor') &&
          transition.includes('storageRecoveryRequired'),
  'state changes must identify the operator and respect recovery lock');
assert.ok(transition.includes('!confirm(') &&
          transition.includes('它不代表测量结果已经审核'),
  'terminal lifecycle states must require confirmation and disclose the review boundary');
assert.ok(binding.includes("container.addEventListener('click'") &&
          binding.includes('button.dataset.experimentId'),
  'experiment actions must use delegated data attributes, not interpolate imported IDs into inline JavaScript');
const deleteStart = app.indexOf('function deleteItem(table, id)');
const deleteEnd = app.indexOf('function exportAllToJSON', deleteStart);
const deleteSource = app.slice(deleteStart, deleteEnd);
assert.ok(deleteSource.includes("table === 'maintenance' && DB.experiments.some(item => sameLabId(item.assetId, id))") &&
          deleteSource.includes('sameLabId(item.assetId, id)'),
  'equipment referenced by an experiment must not be deletable under the canonical ID relationship helper');
const exportStart = app.indexOf('function exportAllToExcel()');
const exportEnd = app.indexOf('function isValidLabBackup', exportStart);
const exportSource = app.slice(exportStart, exportEnd);
assert.ok(exportSource.includes('实验计划') && exportSource.includes('实验状态审计') &&
          exportSource.includes('record.audit'),
  'Excel export must include both experiment plans and a flattened audit ledger');


const backupStart = app.indexOf('function isValidLabBackup(value)');
const backupEnd = app.indexOf('function importFromLocal(event)', backupStart);
const importEnd = app.indexOf('// ==================== 初始化', backupEnd);
const startupStart = app.indexOf('window.onload = async');
const backup = app.slice(backupStart, backupEnd);
const restore = app.slice(backupEnd, importEnd);
const startup = app.slice(startupStart);
assert.ok(backup.includes("value.experiments !== undefined && !Array.isArray(value.experiments)") &&
          backup.includes("'experiments'"),
  'backup validation must remain compatible with older backups and reject malformed experiment tables');
assert.ok(restore.includes('if (!imported.experiments) imported.experiments = []') &&
          restore.includes('domain.validateExperimentRecord(row)') &&
          restore.indexOf('domain.validateExperimentRecord(row)') < restore.indexOf('DB = imported;') &&
          restore.includes('importedAssetIds.has(labIdKey(record.assetId))'),
  'backup restore must migrate legacy exports and validate every experiment before replacing live state');
assert.ok(startup.includes('domain.validateExperimentRecord(record)') &&
          startup.includes('storageRecoveryRequired = true') &&
          startup.includes('DB.experiments = []'),
  'corrupt local experiment history must be quarantined and lock writes at startup');

for (const selector of [
  '.experiment-intro{', '.experiment-metrics', '.experiment-form-card',
  '.experiment-toolbar', '.experiment-status.status-planned',
  '.experiment-audit', '.experiment-empty'
]) assert.ok(css.includes(selector),
  'experiment lifecycle UI must have a dedicated product style: ' + selector);

console.log('EKPO experiment lifecycle UI, persistence, backup migration and audit integration checks passed.');


assert.ok(css.includes('V4 · EKPO LabOS operations control room') &&
          css.includes('.labos-intro:after{') &&
          css.includes('.product-workflow__grid{') &&
          css.includes('.content-body .metrics-grid>.card:after{'),
  'EKPO V4 must implement the lab operations masthead, workflow cards and KPI treatment');
assert.ok(css.includes('@media(max-width:900px)') &&
          css.includes('@media(max-width:520px)') &&
          css.includes('.product-workflow__item:hover'),
  'EKPO V4 must include responsive operations workflows and interactive states');
