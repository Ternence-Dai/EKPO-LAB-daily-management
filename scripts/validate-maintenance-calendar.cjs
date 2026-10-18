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
