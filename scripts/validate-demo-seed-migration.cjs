'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const seedSource = fs.readFileSync('assets/js/demo-seed-data.js', 'utf8');
const appSource = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const seedContext = {};
vm.runInNewContext(seedSource + '\nthis.__fixture = defaultData;', seedContext);
const fixture = JSON.parse(JSON.stringify(seedContext.__fixture));

const start = appSource.indexOf('function migrateUnmodifiedDemoRows() {');
const end = appSource.indexOf('\n        migrateUnmodifiedDemoRows();', start);
assert.ok(start >= 0 && end > start, 'demo-seed migration helper must exist');
const helperSource = appSource.slice(start, end);

function run(initial, currentRawOverride) {
  const raw = JSON.stringify(initial);
  const values = new Map([['lab_management_db_v9', currentRawOverride === undefined ? raw : currentRawOverride]]);
  const context = {
    DB: JSON.parse(raw),
    defaultData: fixture,
    cachedLabRaw: raw,
    lastKnownLabStorageValue: raw,
    storageWarning: false,
    storageRecoveryRequired: false,
    labStorageConflictDetected: false,
    demoSeedMigrationNotice: '',
    Date,
    JSON,
    console: {info(){}, warn(){}, error(){}},
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); }
    }
  };
  vm.createContext(context);
  vm.runInContext(helperSource + '\nmigrateUnmodifiedDemoRows();', context);
  return {context, values, raw};
}

{
  const result = run(fixture);
  const migrated = JSON.parse(result.values.get('lab_management_db_v9'));
  const archiveKeys = [...result.values.keys()].filter(key => key.startsWith('lab_management_db_v9_demo_archive_'));
  assert.equal(archiveKeys.length, 1, 'original demo ledger must be archived before cleanup');
  assert.equal(result.values.get(archiveKeys[0]), result.raw, 'archive must preserve the exact old cache');
  for (const key of ['gases','maintenance','maintLogs','spareParts','spareLogs','calibrationLogs','experiments','testDiary']) {
    assert.deepEqual(migrated[key], [], key + ' must not retain unmodified synthetic seed rows');
  }
  assert.equal(migrated.dataProvenance, 'empty-ledger');
  assert.ok(result.context.demoSeedMigrationNotice, 'successful cleanup must expose a user-facing migration notice');
}

{
  const edited = JSON.parse(JSON.stringify(fixture));
  edited.gases[0].cost += 1;
  edited.gases.push({id:99,item:'用户新增气体记录',cost:120,month:'2026-10'});
  const result = run(edited);
  const migrated = JSON.parse(result.values.get('lab_management_db_v9'));
  assert.equal(migrated.gases.length, 2, 'edited and user-added gas rows must be retained');
  assert.equal(migrated.gases[0].cost, edited.gases[0].cost, 'edited seed-like rows must never be deleted');
  assert.equal(migrated.dataProvenance, 'demo-seed', 'mixed/unverified data must remain visibly marked as demo-origin');
  assert.equal([...result.values.keys()].filter(key => key.startsWith('lab_management_db_v9_demo_archive_')).length, 1);
}

{
  const fixtureWithoutProvenance = JSON.parse(JSON.stringify(fixture));
  fixtureWithoutProvenance.dataProvenance = 'imported-ledger';
  const result = run(fixtureWithoutProvenance);
  assert.equal(result.values.size, 1, 'non-demo imported ledgers must not be rewritten');
  assert.equal(result.values.get('lab_management_db_v9'), result.raw);
}

{
  const result = run(fixture, 'changed-in-another-tab');
  assert.equal(result.values.size, 1, 'stale tabs must not archive or overwrite another tab\'s newer ledger');
  assert.equal(result.context.labStorageConflictDetected, true);
}
console.log('EKPO exact demo-seed migration checks passed.');
