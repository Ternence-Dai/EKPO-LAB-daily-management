'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
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
console.log('Lab timeline and maintenance regression checks passed.');
