'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8') + '\n' + fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const helperStart = html.indexOf('const esc = value =>');
const helperEnd = html.indexOf('\n        // ==================== 1.', helperStart);
if (helperStart < 0 || helperEnd < 0) throw new Error('HTML escaping helper not found');
const helperSource = html.slice(helperStart, helperEnd)
  .replace(/^const esc = /, '')
  .trim()
  .replace(/;\s*$/, '');
const esc = vm.runInNewContext('(' + helperSource + ')');
assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
assert.equal(esc('A&B "quoted"'), 'A&amp;B &quot;quoted&quot;');
for (const token of [
  '${esc(g.item||\'\')}',
  '${esc(m.name||\'\')}',
  '${esc(l.record||\'\')}',
  '${esc(s.desc||\'\')}',
  '${esc(t.errorDesc || \'-\')}',
  '${esc(row[k] !== undefined ? row[k] : \'\')}',
  'alerts.map(a => `<li>${esc(a)}</li>`).join(\'\')'
]) assert.ok(html.includes(token), 'Missing escaped render expression: ' + token);
for (const token of ['${g.item||\'\'}','${m.name||\'\'}','${l.record||\'\'}','${s.desc||\'\'}','${t.errorDesc || \'-\'}'])
  assert.ok(!html.includes(token), 'Unescaped imported value remains: ' + token);
console.log('Imported-data HTML escaping regression checks passed.');

(async function validateSpareLedgerDeletion() {
  const start = html.indexOf('        async function deleteItem(table, id) {');
  const end = html.indexOf('        function exportAllToJSON()', start);
  assert.ok(start >= 0 && end > start, 'spare ledger delete function must be present');
  const source = html.slice(start, end);
  const sandbox = {
    DB: { spareParts: [{id: 1, qty: 10}], spareLogs: [{id: 7, partId: 1, action: '入库', qty: 4}] },
    storageRecoveryRequired: false,
    confirm: () => true, showToast: () => {}, saveToLocal: async () => true,
    renderSpareParts: () => {}, renderSpareLogs: () => {}, renderGases: () => {},
    renderMaintenance: () => {}, renderMaintLogs: () => {}, renderTestDiary: () => {},
    syncMaintenanceSchedule: () => {},
    sameLabId:(a,b)=>{const key=v=>typeof v==='string'?v.trim():Number.isSafeInteger(v)?String(v):'';const left=key(a);return left!==''&&left===key(b);},
    labIdKey:value=>typeof value==='string'?value.trim():Number.isSafeInteger(value)?String(value):''
  };
  sandbox.snapshotLabDB = () => JSON.parse(JSON.stringify(sandbox.DB));
  sandbox.commitLabMutation = async previousDB => {
    if (await sandbox.saveToLocal()) return true;
    sandbox.DB = previousDB;
    return false;
  };
  const remove = vm.runInNewContext('(' + source.replace(/^        /gm, '') + ')', sandbox);
  await remove('spareLogs', 7);
  assert.equal(sandbox.DB.spareParts[0].qty, 6, 'deleting a receipt must reverse its stock increase');
  assert.equal(sandbox.DB.spareLogs.length, 0, 'deleted ledger entry must be removed');
  sandbox.DB.spareParts[0].qty = 2;
  sandbox.DB.spareLogs = [{id: 8, partId: 1, action: '入库', qty: 5}];
  await remove('spareLogs', 8);
  assert.equal(sandbox.DB.spareParts[0].qty, 2, 'deletion must not create negative stock');
  assert.equal(sandbox.DB.spareLogs.length, 1, 'unsafe reversal must preserve the ledger entry');
  sandbox.DB.spareParts[0].qty = 10;
  sandbox.DB.spareLogs = [{id: 9, partId: 1, action: '出库', qty: 3}];
  await remove('spareLogs', 9);
  assert.equal(sandbox.DB.spareParts[0].qty, 13, 'deleting an issue must restore the stock');
  sandbox.DB.maintenance = [{id: 3}];
  sandbox.DB.maintLogs = [{id: 11, eqId: 3}];
  await remove('maintenance', 3);
  assert.equal(sandbox.DB.maintenance.length, 1, 'equipment with maintenance history must not be orphaned');
  sandbox.DB.spareParts = [{id: 4, qty: 5}];
  sandbox.DB.spareLogs = [{id: 12, partId: 4, action: '入库', qty: 1}];
  await remove('spareParts', 4);
  assert.equal(sandbox.DB.spareParts.length, 1, 'spare parts with movement history must not be orphaned');
  assert.ok(html.includes('${esc(m.name)}') && html.includes('${esc(p.desc)}'), 'imported option labels must be HTML escaped');
  assert.ok(html.includes('function isValidLabBackup(value)') &&
    html.includes("const required = ['gases', 'maintenance', 'spareParts', 'testDiary']") &&
    html.includes('if (!isValidLabBackup(imported))'),
    'imported tables must pass full structure and relationship validation before replacing live data');
  console.log('Spare-parts ledger reversal and imported option escaping checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
