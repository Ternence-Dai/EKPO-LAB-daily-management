'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8') + '\n' + fs.readFileSync('assets/js/legacy-app.js', 'utf8');
assert.match(html, /value:\s*\[index,\s*last,\s*next\]/,
  'maintenance timeline must include category index, start and end');
assert.match(html, /value:\s*\[index,\s*start,\s*end\]/,
  'test diary timeline must include category index, start and end');
assert.match(html, /api\.value\(0\)/, 'custom timeline renderer must read category index');
assert.match(html, /api\.value\(1\)/, 'custom timeline renderer must read start timestamp');
assert.match(html, /api\.value\(2\)/, 'custom timeline renderer must read end timestamp');
assert.match(html, /Number\(l\.cost\)\s*\|\|\s*0/,
  'maintenance cost aggregation must coerce imported numeric values');
assert.match(html, /days === null[\s\S]{0,160}未设置日期/,
  'missing due dates must not be shown as healthy/normal');
assert.match(html, /年度已记录费用（气体\+维保）/,
  'annual expense KPI must distinguish recorded costs from inventory valuation');
assert.match(html, /let totalCost = totalGasCost \+ totalMaintCost;/,
  'spare inventory valuation must not be added to annual expense');
assert.match(html, /非年度采购额/,
  'spare inventory valuation must not be mislabeled as annual procurement');
assert.doesNotMatch(html, /年度备件采购总额/,
  'current stock valuation must not be presented as annual purchases');
assert.ok(html.includes("if(!t){showToast('测试记录不存在，请刷新后重试','error');return;}"), 'stale test diary edit IDs must be handled without dereferencing a missing record');
console.log('Lab timeline and maintenance regression checks passed.');
assert.match(html, /new Date\(p\.value\[1\]\)\.toLocaleString\(\)/, 'test diary tooltip must display the actual start timestamp');
assert.match(html, /new Date\(p\.value\[2\]\)\.toLocaleString\(\)/, 'test diary tooltip must display the actual end timestamp');
assert.doesNotMatch(html, /new Date\(p\.value\[0\]\)\.toLocaleDateString\(\)/, 'category index must never be interpreted as a date');
