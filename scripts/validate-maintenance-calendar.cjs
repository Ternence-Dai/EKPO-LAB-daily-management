'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8') + '\n' + fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const start = html.indexOf('function isValidDateOnly');
const end = html.indexOf('function renderMaintenance', start);
if (start < 0 || end < 0) throw new Error('Maintenance date helpers not found');
const source = html.slice(start, end);
const context = { DB:{maintenance:[{id:1,freq:'季度'}],maintLogs:[
  {id:1,eqId:1,date:'2026-01-31'},{id:2,eqId:1,date:'2026-04-30'}
]}};
vm.runInNewContext(source + '\nthis.testApi={isValidDateOnly,isOverdueDateOnly,maintenanceIntervalMonths,addCalendarMonths,syncMaintenanceSchedule};', context);
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
console.log('Maintenance calendar interval regression checks passed.');

assert.ok(html.includes('domain.validateMaintenanceAsset(data)'),
  'maintenance asset edits must pass through the shared domain validator');
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
    "const domain = await import('../../src/domain/index.js');",
    "const domain = {validateMaintenanceAsset: input => Object.freeze({...input})};"
  );
  function runSave({editing=true,saveAllowed=false}={}){
    const values={
      'm-id': editing ? '1' : '',
      'm-name':'Test asset','m-category':'Equipment','m-location':'Lab',
      'm-qty':'2','m-cycle':'一级保养','m-freq':'季度',
      'm-last':'2026-10-18','m-next':'2027-01-18',
      'm-responsible':'Operator','m-record':'updated'
    };
    const previous={id:1,name:'Old asset',category:'Equipment',location:'Lab',qty:1,
      cycle:'一级保养',freq:'季度',last:'2026-07-18',next:'2026-10-18',
      responsible:'Operator',record:'old'};
    const db={maintenance:editing?[previous]:[]};
    const messages=[];let closed=0,renders=0;
    const context={
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

  const successful=await runSave({editing:true,saveAllowed:true});
  assert.equal(successful.db.maintenance[0].name,'Test asset',
    'successful maintenance update must replace validated record data');
  assert.equal(successful.closed,1);
  assert.equal(successful.renders,1);
})().catch(error=>{console.error(error);process.exitCode=1;});

