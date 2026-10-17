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
assert.match(html, /storageRecoveryRequired = false;[\s\S]{0,100}if \(!DB\.maintLogs\)/,
  'only validated JSON import may release the lock');
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
