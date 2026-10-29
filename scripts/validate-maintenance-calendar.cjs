'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8') + '\n' + app;
assert.ok(html.includes('function labIdKey(value)') && html.includes('function sameLabId(a, b)') && html.includes('function labInlineId(value)'),
  'equipment and maintenance history must share safe canonical string/integer ID helpers');
const identityStart = app.indexOf('function labIdKey(value)');
const identityEnd = app.indexOf('// ==================== 1. 数据层', identityStart);
assert.ok(identityStart >= 0 && identityEnd > identityStart, 'canonical equipment ID helper block must be bounded before app initialization');
const identityContext = {esc:value=>String(value == null ? '' : value).replace(/[&<>"\']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))};
vm.runInNewContext(app.slice(identityStart, identityEnd) + '\nthis.identity={labIdKey,sameLabId,labInlineId};', identityContext);
assert.equal(identityContext.identity.labIdKey(' asset-01 '), 'asset-01');
assert.equal(identityContext.identity.sameLabId(' asset-01 ', 'asset-01'), true);
assert.ok(!identityContext.identity.labInlineId('asset-01" onclick="alert(1)').includes('"'),
  'string equipment IDs must be safely encoded before they are embedded in inline HTML handlers');

function extractTopLevelFunction(source, name) {
  const marker = 'function ' + name + '(';
  const start = source.indexOf(marker);
  assert.ok(start >= 0, 'maintenance helper must exist: ' + name);
  const nextMarkers = name === 'syncMaintenanceSchedule'
    ? ['async function renderMaintenance']
    : [
        'function isValidDateOnly','function isOverdueDateOnly',
        'function maintenanceIntervalMonths','function addCalendarMonths',
        'function syncMaintenanceSchedule','async function renderMaintenance'
      ];
  const next = nextMarkers
    .filter(candidate => !candidate.endsWith(name))
    .map(candidate => source.indexOf(candidate, start + marker.length))
    .filter(index => index >= 0)
    .sort((a,b)=>a-b)[0];
  assert.ok(next !== undefined, 'next maintenance function boundary must exist after ' + name);
  return source.slice(start, next);
}
const helperNames = ['isValidDateOnly','isOverdueDateOnly','maintenanceIntervalMonths','addCalendarMonths','syncMaintenanceSchedule'];
const helperSource = helperNames.map(name => extractTopLevelFunction(app, name)).join('\n');
const context = { sameLabId:(a,b)=>{const key=v=>typeof v==='string'?v.trim():Number.isSafeInteger(v)?String(v):'';const left=key(a);return left!==''&&left===key(b);}, getToday:()=> '2026-10-17', DB:{maintenance:[{id:1,freq:'季度'}],maintLogs:[
  {id:1,eqId:1,date:'2026-01-31'},{id:2,eqId:1,date:'2026-04-30'}
]}};
vm.runInNewContext(helperSource + '\nthis.testApi={isValidDateOnly,isOverdueDateOnly,maintenanceIntervalMonths,addCalendarMonths,syncMaintenanceSchedule};', context);
const api = context.testApi;
assert.equal(api.isValidDateOnly('2026-02-28'), true);
assert.equal(api.isValidDateOnly('2026-02-30'), false);
assert.equal(api.isOverdueDateOnly('2026-10-17', '2026-10-17'), false, 'due today is not overdue');
assert.equal(api.isOverdueDateOnly('2026-10-16', '2026-10-17'), true, 'a past calendar date is overdue');
assert.equal(api.isOverdueDateOnly('2026-02-30', '2026-10-17'), false, 'invalid dates must not be counted as overdue');
assert.equal(api.maintenanceIntervalMonths('季度'), 3);
assert.equal(api.maintenanceIntervalMonths('半年'), 6);
assert.equal(api.maintenanceIntervalMonths('年度'), 12);
assert.equal(api.maintenanceIntervalMonths('每 2 个月'), 2);
assert.equal(api.maintenanceIntervalMonths('每 2 年'), 24);
assert.equal(api.maintenanceIntervalMonths('0 个月'), null);
assert.equal(api.maintenanceIntervalMonths('按需'), null, 'unknown frequencies must not default to annual');
assert.equal(api.addCalendarMonths('2026-01-31', 1), '2026-02-28');
assert.equal(api.addCalendarMonths('2024-02-29', 12), '2025-02-28');
assert.equal(api.addCalendarMonths('2026-01-31', 3), '2026-04-30');
api.syncMaintenanceSchedule(1);
assert.equal(context.DB.maintenance[0].last, '2026-04-30', 'latest log must win');
assert.equal(context.DB.maintenance[0].next, '2026-07-30');
context.DB.maintenance[0].id = ' 1 ';
context.DB.maintLogs = [{id:3,eqId:1,date:'2026-05-31'}];
api.syncMaintenanceSchedule('1');
assert.equal(context.DB.maintenance[0].last, '2026-05-31', 'maintenance history joins must normalize legacy string/integer equipment IDs');
console.log('Maintenance calendar interval regression checks passed.');

assert.ok(html.includes('domain.validateMaintenanceAsset(data)'),
  'maintenance asset edits must pass through the shared domain validator');
assert.ok(html.includes('domain.validateMaintenanceAsset(asset)') &&
  html.includes('imported.maintenance = imported.maintenance.map(asset => {') &&
  html.includes('delete asset.id;') &&
  html.includes('...domain.validateMaintenanceAsset(asset)'),
  'backup restore must normalize and validate every maintenance asset while preserving its identifier');
const restoreStart = html.indexOf('function importFromLocal(event)');
const restoreEnd = html.indexOf('// ==================== 初始化', restoreStart);
const restoreSource = html.slice(restoreStart, restoreEnd);
assert.ok(restoreSource.indexOf('domain.validateMaintenanceAsset(asset)') <
  restoreSource.indexOf('DB = imported'),
  'invalid equipment masters must be rejected before imported data replaces the live database');
assert.ok(html.includes('async function saveMaint()'),
  'maintenance asset saves must await persistence before reporting success');

assert.ok(!html.includes('validated.id = newId'),
  'a frozen validated maintenance record must not be mutated when assigning its identifier');
assert.ok(html.includes('DB.maintenance.push({ ...validated, id: newRecordId })'),
  'new maintenance records must be created by copying validated domain data');

(async()=>{
  const saveStart=html.indexOf('async function saveMaint()');
  const saveEnd=html.indexOf('function editMaintLog',saveStart);
  assert.ok(saveStart>=0&&saveEnd>saveStart,'saveMaint implementation must be extractable for rollback testing');
  const saveSource=html.slice(saveStart,saveEnd).replace(
    /const domain = await import\(['"]\.\.\/\.\.\/src\/domain\/index\.js(?:\?v=[^'"]+)?['"]\);/,
    "const domain = {validateMaintenanceAsset: input => Object.freeze({...input})};"
  );
  function runSave({editing=true,saveAllowed=false,previousId=1,formId}={}){
    const values={
      'm-id': editing ? (formId === undefined ? String(previousId) : formId) : '',
      'm-name':'Test asset','m-category':'Equipment','m-location':'Lab',
      'm-qty':'2','m-cycle':'一级保养','m-freq':'季度',
      'm-last':'2026-10-18','m-next':'2027-01-18',
      'm-responsible':'Operator','m-record':'updated'
    };
    const previous={id:previousId,name:'Old asset',category:'Equipment',location:'Lab',qty:1,
      cycle:'一级保养',freq:'季度',last:'2026-07-18',next:'2026-10-18',
      responsible:'Operator',record:'old'};
    const db={maintenance:editing?[previous]:[]};
    const messages=[];let closed=0,renders=0;
    const context={
      sameLabId:(a,b)=>{const key=v=>typeof v==='string'?v.trim():Number.isSafeInteger(v)?String(v):'';const left=key(a);return left!==''&&left===key(b);},
      DB:db,
      document:{getElementById:key=>({value:values[key]??''})},
      saveToLocal:async()=>saveAllowed,
      showToast:message=>messages.push(message),
      closeModal:()=>{closed++;},
      renderMaintenance:()=>{renders++},
      console:{error(){}}
    };
    vm.createContext(context);
    vm.runInContext(saveSource+'\nthis.run=saveMaint;',context);
    return context.run().then(()=>({db:context.DB,messages,closed,renders,previous}));
  }
  const failedUpdate=await runSave({editing:true,saveAllowed:false});
  assert.deepEqual(failedUpdate.db.maintenance,[failedUpdate.previous],
    'failed maintenance update must restore the entire previous record');
  assert.equal(failedUpdate.closed,0,'failed maintenance update must not close the editor');
  assert.equal(failedUpdate.renders,0,'failed maintenance update must not render uncommitted state');
  assert.ok(failedUpdate.messages.some(message=>message.includes('已撤销')),
    'failed maintenance update must explain rollback');

  const failedNew=await runSave({editing:false,saveAllowed:false});
  assert.equal(failedNew.db.maintenance.length,0,
    'failed new maintenance record must not leave an in-memory record');

  const paddedIdUpdate=await runSave({editing:true,saveAllowed:true,previousId:' asset-01 ',formId:'asset-01'});
  assert.equal(paddedIdUpdate.db.maintenance[0].name,'Test asset',
    'editing must preserve valid string equipment IDs even when a legacy ID contains surrounding whitespace');
  const successful=await runSave({editing:true,saveAllowed:true});
  assert.equal(successful.db.maintenance[0].name,'Test asset',
    'successful maintenance update must replace validated record data');
  assert.equal(successful.closed,1);
  assert.equal(successful.renders,1);
})().catch(error=>{console.error(error);process.exitCode=1;});

