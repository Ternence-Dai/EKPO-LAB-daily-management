'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8') + '\n' + fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const start = html.indexOf('function snapshotLabDB()');
const end = html.indexOf('// ==================== 9. 测试台日志', start);
if (start < 0 || end < 0) throw new Error('saveSpareLog source not found');
const source = html.slice(start, end);
const masterStart = html.indexOf('async function saveSpare()');
const masterEnd = html.indexOf('async function saveSpareLog()', masterStart);
if (masterStart < 0 || masterEnd <= masterStart) throw new Error('saveSpare source not found');
const masterSource = html.slice(masterStart, masterEnd);

async function run(action, qty, stock, saveAllowed = true, selectedPartId = '1', storedPartId = 1, date = '2026-10-22', existingLogs = []) {
  const values = {'sl-part':String(selectedPartId),'sl-action':action,'sl-qty':String(qty),'sl-date':date,'sl-operator':'test','sl-note':''};
  const messages = [];
  const document = {getElementById(id) {
    if (id === 'spare-log-view') return {classList:{contains:()=>true}};
    return {value:values[id] || ''};
  }};
  const context = {document,DB:{spareParts:[{id:storedPartId,qty:stock}],spareLogs:JSON.parse(JSON.stringify(existingLogs))},
    sameLabId:(a,b)=>{const key=v=>typeof v==='string'?v.trim():Number.isSafeInteger(v)?String(v):'';const left=key(a);return left!==''&&left===key(b);},
    labIdKey:value=>typeof value==='string'?value.trim():Number.isSafeInteger(value)?String(value):'',
    isValidDateOnly:value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T00:00:00.000Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;},
    getToday:()=> '2026-10-23',
    showToast:message=>messages.push(message),saveToLocal:async()=>saveAllowed,closeModal:()=>{},
    renderSpareParts:()=>{},renderSpareLogs:()=>{},console:{error(){}}};
  vm.runInNewContext(source,context);
  // The application declares its own getToday(); reapply the fixed clock after evaluation
  // so date-boundary tests remain deterministic on every CI calendar day.
  context.getToday = () => '2026-10-23';
  context.showToast = message => messages.push(message);
  context.closeModal = () => {};
  context.renderSpareParts = () => {};
  context.renderSpareLogs = () => {};
  await context.saveSpareLog();
  return {stock:context.DB.spareParts[0].qty,logs:context.DB.spareLogs,messages};
}

async function runMasterSave({id='1',storedPartId=1,desc='Test part',qty=5,catalog='SKU-1',price=10,history=true,otherParts=[],saveAllowed=true}={}) {
  const values = {
    's-id':id,'s-update':'2026-10-18','s-category':'Test','s-desc':desc,
    's-catalog':catalog,'s-purpose':'Test','s-qty':String(qty),'s-brand':'Brand',
    's-price':String(price),'s-location':'Shelf'
  };
  const messages=[];
  const context={
    sameLabId:(a,b)=>{const key=v=>typeof v==='string'?v.trim():Number.isSafeInteger(v)?String(v):'';const left=key(a);return left!==''&&left===key(b);},
    labIdKey:value=>typeof value==='string'?value.trim():Number.isSafeInteger(value)?String(value):'',
    DB:{spareParts:[{id:storedPartId,category:'Test',desc:'Test part',catalog:'SKU-1',purpose:'Test',qty:5,brand:'Brand',price:10,location:'Shelf',update:'2026-10-17'},...otherParts],
        spareLogs:history?[{id:1,partId:storedPartId,date:'2026-10-17',action:'入库',qty:5}]:[]},
    document:{getElementById:key=>({value:values[key]??''})},
    getToday:()=> '2026-10-18',
    isValidDateOnly:value=>value === '2026-10-18' || value === '2026-10-17',
    snapshotLabDB:()=>JSON.parse(JSON.stringify(context.DB)),
    commitLabMutation:async previousDB=>{if(saveAllowed)return true;context.DB=previousDB;return false;},
    showToast:message=>messages.push(message),
    closeModal:()=>{},renderSpareParts:()=>{},
    console:{error(){}}
  };
  vm.runInNewContext(masterSource,context);
  await context.saveSpare();
  return {db:context.DB,messages};
}

(async()=>{
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

// Current stock is a live balance: future-dated and backdated entries must not
// mutate it because this ledger has no historical balance reconstruction.
result=await run('入库',2,5,true,'1',1,'2026-10-24');
assert.equal(result.stock,5,'future-dated movements must not change current stock');
assert.equal(result.logs.length,0,'future-dated movements must not be recorded');
assert.ok(result.messages.some(message=>message.includes('不能晚于今天')));
result=await run('入库',2,5,true,'1',1,'2026-10-21',[
  {id:10,partId:1,date:'2026-10-22',action:'入库',qty:1}
]);
assert.equal(result.stock,5,'backdated movements must not change current stock');
assert.equal(result.logs.length,1,'backdated movements must not be appended');
assert.ok(result.messages.some(message=>message.includes('早于该物料最近一笔流水')));
result=await run('入库',2,5,true,'spare-asset-01',' spare-asset-01 ');
assert.equal(result.stock,7,
  'string-valued imported spare-part IDs must support stock receipts without numeric coercion');
assert.equal(result.logs[0].partId,' spare-asset-01 ',
  'a new stock movement must retain the exact original foreign-key value for traceability');
result=await run('入库',2,5,false);
assert.equal(result.stock,5,'failed persistence must roll inventory back to the original quantity');
assert.equal(result.logs.length,0,'failed persistence must not leave an uncommitted stock ledger row');
assert.ok(result.messages.some(message=>message.includes('库存与流水已撤销')),
  'failed persistence must explain that the stock change was rolled back');

// Stock with an existing ledger must only change through new stock movements.
let master=await runMasterSave({qty:8});
assert.equal(master.db.spareParts[0].qty,5,
  'direct stock edits must not bypass an existing spare movement ledger');
assert.equal(master.db.spareLogs.length,1,'blocked stock edit must preserve its stock ledger');
assert.ok(master.messages.some(message=>message.includes('通过新增入库/出库流水调整')),
  'blocked direct stock edits must direct users to the auditable movement form');

master=await runMasterSave({qty:5,catalog:'SKU-2'});
assert.equal(master.db.spareParts[0].catalog,'SKU-1',
  'a SKU with movement history must not be renamed');
assert.ok(master.messages.some(message=>message.includes('物料编码不可修改')),
  'blocked SKU changes must explain that historical traceability is protected');

master=await runMasterSave({qty:5,otherParts:[{id:2,catalog:'SKU-2',qty:0}],catalog:'SKU-2',history:false});
assert.equal(master.db.spareParts.length,2,'duplicate catalog codes must not create another part');
assert.ok(master.messages.some(message=>message.includes('物料编码已存在')),
  'duplicate SKU rejection must be explicit');

master=await runMasterSave({qty:5,price:12,saveAllowed:true});
assert.equal(master.db.spareParts[0].price,12,
  'non-stock master fields may still be edited when movement history exists');
master=await runMasterSave({id:'spare-asset-01',storedPartId:' spare-asset-01 ',
  desc:'Renamed spare part',qty:5,catalog:'SKU-1',history:true,saveAllowed:true});
assert.equal(master.db.spareParts[0].desc,'Renamed spare part',
  'editing an imported whitespace-padded string-ID spare master must resolve the canonical form ID');
assert.equal(master.db.spareParts[0].id,' spare-asset-01 ',
  'editing a spare master must preserve its original raw identifier');
assert.equal(master.db.spareLogs[0].partId,' spare-asset-01 ',
  'editing non-stock master fields must preserve the original ledger foreign key');


console.log('Spare-part stock movement and persistence rollback checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
