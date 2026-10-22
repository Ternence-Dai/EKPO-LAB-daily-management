'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const start = source.indexOf('async function enableLocalRealTimeSave() {');
const end = source.indexOf('// ==================== 5. Reference operations cockpit', start);
assert.ok(start >= 0 && end > start, 'file-save setup function must exist');
const functionSource = source.slice(start, end);

async function runCase(picker) {
  const classes = new Set();
  const status = { innerText: '' };
  const toasts = [];
  const sandbox = {
    DB: { maintenance: [{ id: 'asset-1' }], calibrationLogs: [] },
    storageRecoveryRequired: false,
    fileHandle: null,
    getToday: () => '2026-10-20',
    showToast: (message, type) => toasts.push({ message, type }),
    console,
    window: { showSaveFilePicker: picker },
    document: { getElementById(id) {
      if (id === 'saveDot') return { classList: { add(value) { classes.add(value); } } };
      if (id === 'saveText') return status;
      throw new Error('Unexpected DOM lookup: ' + id);
    } }
  };
  vm.createContext(sandbox);
  vm.runInContext(functionSource + '\nthis.startSave = enableLocalRealTimeSave; this.currentHandle = () => fileHandle;', sandbox);
  await sandbox.startSave();
  return { sandbox, classes, status, toasts };
}

(async () => {
  const successMetrics = { writes: [], closeCalls: 0 };
  const successHandle = {
    async createWritable() {
      return {
        async write(value) { successMetrics.writes.push(value); },
        async close() { successMetrics.closeCalls++; }
      };
    }
  };
  const success = await runCase(async () => successHandle);
  assert.equal(success.sandbox.currentHandle(), successHandle,
    'file handle must become active after initial snapshot is written');
  assert.equal(successMetrics.writes.length, 1, 'initial snapshot must be written exactly once');
  assert.equal(successMetrics.writes[0], JSON.stringify(success.sandbox.DB, null, 2));
  assert.equal(successMetrics.closeCalls, 1, 'initial writable must close before activation');
  assert.ok(success.classes.has('active'), 'save indicator activates after successful close');
  assert.match(success.toasts.at(-1).message, /本地实时保存已开启/);

  const failureMetrics = { abortCalls: 0, closeCalls: 0 };
  const failedHandle = {
    async createWritable() {
      return {
        async write() { throw new Error('simulated disk write failure'); },
        async close() { failureMetrics.closeCalls++; },
        async abort() { failureMetrics.abortCalls++; }
      };
    }
  };
  const failed = await runCase(async () => failedHandle);
  assert.equal(failed.sandbox.currentHandle(), null,
    'failed initial write must not leave a live file handle');
  assert.equal(failureMetrics.closeCalls, 0, 'failed write must not close as if committed');
  assert.equal(failureMetrics.abortCalls, 1, 'failed initial write must attempt writable rollback');
  assert.equal(failed.classes.has('active'), false,
    'failed initial write must not show autosave as active');
  assert.equal(failed.toasts.at(-1).type, 'error');

  const cancelled = await runCase(async () => {
    const error = new Error('cancelled');
    error.name = 'AbortError';
    throw error;
  });
  assert.equal(cancelled.sandbox.currentHandle(), null);
  assert.equal(cancelled.toasts.length, 0, 'user cancellation must remain silent');

  console.log('Local file autosave activation and initial-write rollback checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
