'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8') + '\n' + fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const start = html.indexOf('function snapshotLabDB()');
const end = html.indexOf('// ==================== 9. 测试台日志', start);
if (start < 0 || end < 0) throw new Error('saveSpareLog source not found');
const source = html.slice(start, end);
async function run(action, qty, stock, saveAllowed = true) {
  const values = {'sl-part':'1','sl-action':action,'sl-qty':String(qty),'sl-date':'2026-10-17','sl-operator':'test','sl-note':''};
  const messages = [];
  const document = {getElementById(id) {
    if (id === 'spare-log-view') return {classList:{contains:()=>true}};
    return {value:values[id] || ''};
  }};
  const context = {document,DB:{spareParts:[{id:1,qty:stock}],spareLogs:[]},
    isValidDateOnly:value=>/^\d{4}-\d{2}-\d{2}$/.test(value),
    showToast:message=>messages.push(message),saveToLocal:async()=>saveAllowed,closeModal:()=>{},
    renderSpareParts:()=>{},renderSpareLogs:()=>{},console:{error(){}}};
  vm.runInNewContext(source,context);
  await context.saveSpareLog();
  return {stock:context.DB.spareParts[0].qty,logs:context.DB.spareLogs,messages};
}
let result=await run('出库',6,5);
assert.equal(result.stock,5,'oversubscribed outbound movement must not change stock');
assert.equal(result.logs.length,0,'oversubscribed outbound movement must not be logged');
result=await run('出库',5,5);
assert.equal(result.stock,0,'valid outbound movement should reduce stock exactly');
assert.equal(result.logs.length,1);
result=await run('入库',-1,5);
assert.equal(result.stock,5,'negative inbound quantity must be rejected');
assert.equal(result.logs.length,0);
result=await run('入库',2,5);
assert.equal(result.stock,7,'valid inbound movement should increase stock');
assert.equal(result.logs.length,1);
result=await run('入库',2,5,false);
assert.equal(result.stock,5,'failed persistence must roll inventory back to the original quantity');
assert.equal(result.logs.length,0,'failed persistence must not leave an uncommitted stock ledger row');
assert.ok(result.messages.some(message=>message.includes('库存与流水已撤销')),
  'failed persistence must explain that the stock change was rolled back');
console.log('Spare-part stock movement and persistence rollback checks passed.');
