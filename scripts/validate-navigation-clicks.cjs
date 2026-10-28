'use strict';
const { chromium } = require('playwright');

const results = [];
function check(name, cond, extra) {
  results.push({ name, pass: !!cond, extra: extra || '' });
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(600);

  const visibleSection = () => page.evaluate(() => document.querySelector('.content-body > section:not(.hidden)')?.id);
  const maintSubVisible = () => page.evaluate(() => ({
    eq: !document.getElementById('maint-eq-view').classList.contains('hidden'),
    cal: !document.getElementById('maint-calibration-view').classList.contains('hidden')
  }));

  // --- S1a: workflow step 03 must land on calibration sub-view ---
  await page.click('.ekpo-oc-steps button[data-ekpo-open="maintenance:calibration"]');
  await page.waitForTimeout(400);
  let sub = await maintSubVisible();
  check('S1 workflow step 03 lands on calibration sub-view', (await visibleSection()) === 'page-maintenance' && sub.cal && !sub.eq, JSON.stringify(sub));

  // --- back to dashboard, then S1b: calibration KPI metric ---
  await page.evaluate(() => switchTab('dashboard', null));
  await page.waitForTimeout(400);
  await page.click('.ekpo-oc-metric[data-ekpo-metric="calibration"]');
  await page.waitForTimeout(400);
  sub = await maintSubVisible();
  check('S1 calibration KPI lands on calibration sub-view', (await visibleSection()) === 'page-maintenance' && sub.cal, JSON.stringify(sub));

  // --- S2: quick action opens registration modal on target page ---
  await page.evaluate(() => switchTab('dashboard', null));
  await page.waitForTimeout(400);
  await page.click('.ekpo-oc-action[data-ekpo-modal="modal-gas"]');
  await page.waitForTimeout(500);
  const gasModal = await page.evaluate(() => ({
    section: document.querySelector('.content-body > section:not(.hidden)')?.id,
    display: document.getElementById('modal-gas').style.display
  }));
  check('S2 quick action gas opens modal-gas on gases page', gasModal.section === 'page-gases' && gasModal.display === 'flex', JSON.stringify(gasModal));
  await page.evaluate(() => { document.getElementById('modal-gas').style.display = 'none'; });

  // --- S4: equipment row click navigates ---
  await page.evaluate(() => switchTab('dashboard', null));
  await page.waitForTimeout(400);
  const rowCount = await page.locator('.ekpo-oc-equipment[data-ekpo-open]').count();
  if (rowCount > 0) {
    await page.locator('.ekpo-oc-equipment[data-ekpo-open]').first().click();
    await page.waitForTimeout(300);
    check('S4 equipment row click opens maintenance', (await visibleSection()) === 'page-maintenance');
  } else {
    check('S4 equipment row click opens maintenance', true, 'no equipment rows in seed; skipped click');
  }

  // --- S3: string-id gas row edit/delete ---
  await page.evaluate(() => {
    DB.gases.push({ id: 'str-gas-001', item: 'Hydrogen', spec: '99.999%', supplier: 'TestSupplier', batch: 'B1', year: 2026, monthNum: 10, delivery: 1, return: 0, consumption: 1, cost: 10, rent: 0, freight: 0 });
    switchTab('gases', null);
  });
  await page.waitForTimeout(400);
  const btnCount = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#page-gases tbody button')].filter(b => (b.getAttribute('onclick') || '').includes('str-gas-001'));
    return btns.length;
  });
  check('S3 gas row renders string-id handlers', btnCount >= 2, 'buttons=' + btnCount);
  await page.evaluate(() => { const b = [...document.querySelectorAll('#page-gases tbody button')].find(x => (x.getAttribute('onclick') || '').startsWith('editGas("str-gas-001")')); if (b) b.click(); });
  await page.waitForTimeout(300);
  const editState = await page.evaluate(() => ({
    display: document.getElementById('modal-gas').style.display,
    idVal: document.getElementById('g-id').value
  }));
  check('S3 editGas with string id opens modal with row loaded', editState.display === 'flex' && editState.idVal === 'str-gas-001', JSON.stringify(editState));
  await page.evaluate(() => { document.getElementById('modal-gas').style.display = 'none'; });

  // --- S3: system table edit/delete with string id ---
  await page.evaluate(() => switchTab('system', null));
  await page.waitForTimeout(400);
  await page.evaluate(() => { const sel = document.getElementById('sys-table-select'); sel.value = 'gases'; renderSystemTable('gases'); });
  await page.waitForTimeout(300);
  const sysBtn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#page-system tbody button')].find(x => (x.getAttribute('onclick') || '').startsWith('systemEdit'));
    return b ? b.getAttribute('onclick') : null;
  });
  check('S3 system table renders quoted string ids', !!sysBtn && sysBtn.includes('"str-gas-001"'), String(sysBtn));

  check('No page errors during all clicks', errors.length === 0, errors.join(' ;; ').slice(0, 400));

  await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log('\nTOTAL: ' + results.length + ' checks, ' + failed.length + ' failed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
