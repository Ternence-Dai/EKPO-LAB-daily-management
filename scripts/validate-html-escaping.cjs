'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const helperStart = html.indexOf('const esc = value =>');
const helperEnd = html.indexOf('\n        // ==================== 1.', helperStart);
if (helperStart < 0 || helperEnd < 0) throw new Error('HTML escaping helper not found');
const helperSource = html.slice(helperStart, helperEnd).replace(/^const esc = /, '').replace(/;$/, '');
const esc = vm.runInNewContext('(' + helperSource + ')');
assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
assert.equal(esc('A&B "quoted"'), 'A&amp;B &quot;quoted&quot;');
for (const token of [
  '${esc(g.item||\'\')}',
  '${esc(m.name||\'\')}',
  '${esc(l.record||\'\')}',
  '${esc(s.desc||\'\')}',
  '${esc(t.errorDesc || \'-\')}',
  '${esc(row[k] !== undefined ? row[k] : \'\')}',
  'alerts.map(a => `<li>${esc(a)}</li>`).join(\'\')'
]) assert.ok(html.includes(token), 'Missing escaped render expression: ' + token);
for (const token of ['${g.item||\'\'}','${m.name||\'\'}','${l.record||\'\'}','${s.desc||\'\'}','${t.errorDesc || \'-\'}'])
  assert.ok(!html.includes(token), 'Unescaped imported value remains: ' + token);
console.log('Imported-data HTML escaping regression checks passed.');
