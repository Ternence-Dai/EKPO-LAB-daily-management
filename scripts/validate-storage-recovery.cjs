'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8') + '\n' + fs.readFileSync('assets/js/legacy-app.js', 'utf8');
assert.match(html, /let storageRecoveryRequired = false;/,
  'app must track a separate persistence recovery lock');
assert.match(html, /storageRecoveryRequired = true;/,
  'malformed or unreadable cache must activate the lock');
assert.match(html, /if \(storageRecoveryRequired\)[\s\S]{0,500}return false;/,
  'autosave must stop before writing while recovery is required');
assert.match(html, /if \(storageRecoveryRequired\)[\s\S]{0,300}阻止将演示数据写入新文件/,
  'linked-file creation must not persist demo fallback data');
const importStart = html.indexOf('function importFromLocal(event)');
const importEnd = html.indexOf('// ==================== 初始化', importStart);
if (importStart < 0 || importEnd < 0) throw new Error('importFromLocal source not found');
const importSource = html.slice(importStart, importEnd);
const importValidation = importSource.indexOf('if (!isValidLabBackup(imported))');
const lockRelease = importSource.indexOf('storageRecoveryRequired = false;');
const importCommit = importSource.indexOf('await commitLabMutation(previousDB');
assert.ok(importValidation >= 0 && lockRelease > importValidation && importCommit > lockRelease,
  'only fully validated JSON import may release the recovery lock, and it must persist before success');
const start = html.indexOf('async function saveToLocal()');
const end = html.indexOf('function getToday()', start);
if (start < 0 || end < 0) throw new Error('saveToLocal source not found');
const source = html.slice(start, end);
async function run({locked=false,failWrites=false}={}) {
  let writes = 0;
  const messages = [];
  const status = {innerText:''};
  const context = {
    storageRecoveryRequired:locked, storageWarning:locked,
    DB:{gases:[],maintenance:[],spareParts:[],testDiary:[]},
    localStorage:{setItem(){writes++;if(failWrites)throw new Error('quota exceeded');}},
    fileHandle:null,
    showToast:m=>messages.push(m),
    document:{getElementById:()=>status},
    console:{error(){}}
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const result = await context.saveToLocal();
  return {writes,result,messages,status:status.innerText};
}
(async()=>{
  let result=await run({locked:true});
  assert.equal(result.result,false,'locked save must report failure');
  assert.equal(result.writes,0,'locked save must not overwrite the cache');
  assert.equal(result.messages.length,1,'locked save must explain the recovery requirement');
  result=await run();
  assert.equal(result.writes,1,'normal save should persist when recovery is not required');
  assert.equal(result.result,true,'successful browser save must be reported');
  assert.match(result.status,/自动保存中/,'successful save status must be accurate');
  result=await run({failWrites:true});
  assert.equal(result.writes,1,'failed save should attempt one write');
  assert.equal(result.result,false,'storage quota failure must be reported');
  assert.match(result.status,/保存失败/,'failed storage write must not be overwritten by a success status');
  assert.equal(result.messages.length,1,'failed storage write must show a backup warning');
  console.log('Lab persistence recovery checks passed (locked, normal, quota failure).');
})().catch(error=>{console.error(error);process.exitCode=1;});

assert.ok(html.includes('async function commitLabMutation('),
  'all transactional changes must use the shared persistence commit helper');
assert.ok(html.includes('async function saveMaintLog()') &&
  html.slice(html.indexOf('async function saveMaintLog()'), html.indexOf('// ==================== 8. 备件管理'))
    .includes('await commitLabMutation'),
  'maintenance history changes must await persistence and roll back on failure');
assert.ok(html.includes('async function saveSpare()') &&
  html.slice(html.indexOf('async function saveSpare()'), html.indexOf('async function saveSpareLog()'))
    .includes('await commitLabMutation'),
  'spare-part master changes must validate and await persistence');
assert.ok(html.includes('async function saveTestDiary()') &&
  html.slice(html.indexOf('async function saveTestDiary()'), html.indexOf('// ==================== 10. 年度综合统计'))
    .includes('await commitLabMutation'),
  'test diary changes must roll back when persistence fails');
assert.ok(html.includes('async function deleteItem(table, id)') &&
  html.slice(html.indexOf('async function deleteItem(table, id)'), html.indexOf('function exportAllToJSON()'))
    .includes('await commitLabMutation'),
  'deletes and stock-ledger reversal must roll back when persistence fails');

assert.ok(html.includes('originalRaw') && html.includes('lab-browser-cache-recovery'),
  'recovery-mode JSON export must contain original raw cache data, not demo fallback data');
assert.ok(html.includes('function isValidLabBackup(value)'),
  'JSON restore must validate table rows and linked maintenance/spare ledgers');
assert.ok(html.includes('if (!await commitLabMutation(previousDB'),
  'JSON restore must report success only after persisted write succeeds');
assert.ok(html.includes('原始缓存尚未恢复') && html.includes('阻止 Excel 导出'),
  'Excel export must not present fallback demo data as the recovered user dataset');
