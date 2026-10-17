'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
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
async function run(locked) {
  let writes = 0;
  const messages = [];
  const context = {
    storageRecoveryRequired:locked, storageWarning:locked,
    DB:{gases:[],maintenance:[],spareParts:[],testDiary:[]},
    localStorage:{setItem(){writes++;}},
    fileHandle:null,
    showToast:m=>messages.push(m),
    document:{getElementById:()=>({innerText:''})},
    console
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const result = await context.saveToLocal();
  return {writes,result,messages};
}
(async()=>{
  let result=await run(true);
  assert.equal(result.result,false,'locked save must report failure');
  assert.equal(result.writes,0,'locked save must not overwrite the cache');
  assert.equal(result.messages.length,1,'locked save must explain the recovery requirement');
  result=await run(false);
  assert.equal(result.writes,1,'normal save should persist when recovery is not required');
  assert.equal(result.result,undefined,'normal save keeps its existing return contract');
  console.log('Lab persistence recovery regression checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
