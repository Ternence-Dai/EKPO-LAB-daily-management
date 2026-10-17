'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const match = html.match(/const esc = value => String\(value == null \? '' : value\)\.replace\(\/\[&<>"'\]\/g,[\s\S]*?\n\s*\);/);
if (!match) throw new Error('HTML escaping helper not found');
const esc = vm.runInNewContext('(' + match[0].replace(/^const esc = /, '').replace(/;$/, '') + ')');
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
