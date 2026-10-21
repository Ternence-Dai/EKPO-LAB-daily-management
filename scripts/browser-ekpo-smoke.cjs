'use strict';

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 30000 });
    const contextScript = await page.locator('script[src*="workspace-v5-context.js"]').getAttribute('src');
    if (!contextScript || !contextScript.includes('v=20261021-mutationobserver-fix-v1')) {
      throw new Error('Workspace observer fix cache-busting URL is missing: ' + contextScript);
    }
    await page.waitForSelector('#page-dashboard:not(.hidden)');
    if (!(await page.locator('#page-dashboard').innerText()).trim()) {
      throw new Error('EKPO dashboard did not render its operating summary');
    }

    const tabs = ['gases', 'maintenance', 'spareParts', 'testDiary', 'experiments', 'yearly', 'system'];
    for (const tab of tabs) {
      await page.locator('.sidebar .nav-item[data-tab="' + tab + '"]').click();
      await page.waitForFunction(expected => {
        const active = document.querySelector('.sidebar .nav-item.active');
        const page = document.getElementById('page-' + expected);
        return active?.dataset.tab === expected && page && !page.classList.contains('hidden') &&
          page.textContent.trim().length > 20;
      }, tab);
      await page.waitForSelector('#page-' + tab + ' > .w5-module-context');
      const text = await page.locator('#page-' + tab).innerText();
      if (!text.trim() || text.includes('页面不存在')) {
        throw new Error('EKPO module failed to render: ' + tab);
      }
    }

    // Exercise the laboratory gas-usage form with synthetic data in this isolated browser context.
    await page.locator('.sidebar .nav-item[data-tab="gases"]').click();
    await page.waitForSelector('#page-gases:not(.hidden)');
    await page.locator('#page-gases .action-bar button.btn-primary').click();
    const gasModal = page.locator('#modal-gas');
    await gasModal.waitFor({ state: 'visible' });
    await gasModal.locator('#g-item').selectOption('Hydrogen');
    await gasModal.locator('#g-year').selectOption('2026');
    await gasModal.locator('#g-month').selectOption('10');
    await gasModal.locator('#g-spec').fill('99.999%');
    await gasModal.locator('#g-supplier').fill('Synthetic test supplier');
    await gasModal.locator('#g-batch').fill('PW-GAS-001');
    await gasModal.locator('#g-delivery').fill('30');
    await gasModal.locator('#g-return').fill('4');
    await gasModal.locator('#g-consumption').fill('26');
    await gasModal.locator('#g-cost').fill('-1');
    await gasModal.locator('#g-rent').fill('0');
    await gasModal.locator('#g-freight').fill('0');
    await gasModal.locator('#modal-gas button[onclick="saveGas()"]').click();
    await page.waitForFunction(() => document.getElementById('toast')?.textContent.includes('不能为负数或非数字'));
    let labCache = await page.evaluate(() => JSON.parse(localStorage.getItem('lab_management_db_v9') || '{}'));
    if ((labCache.gases || []).some(row => row.batch === 'PW-GAS-001')) {
      throw new Error('Invalid negative gas cost was persisted to the laboratory ledger');
    }

    await gasModal.locator('#g-cost').fill('120');
    await gasModal.locator('#modal-gas button[onclick="saveGas()"]').click();
    await page.waitForFunction(() => document.getElementById('modal-gas')?.style.display === 'none');
    await page.waitForFunction(() => {
      const db = JSON.parse(localStorage.getItem('lab_management_db_v9') || '{}');
      const row = (db.gases || []).find(item => item.batch === 'PW-GAS-001');
      return !!row && row.delivery === 30 && row.return === 4 &&
        row.consumption === 26 && row.cost === 120 && row.year === 2026 && row.monthNum === 10;
    }, undefined, { timeout: 10000 });
    labCache = await page.evaluate(() => JSON.parse(localStorage.getItem('lab_management_db_v9') || '{}'));
    if ((labCache.gases || []).filter(row => row.batch === 'PW-GAS-001').length !== 1 ||
        !(await page.locator('#table-gases tbody').innerText()).includes('Synthetic test supplier')) {
      throw new Error('Valid gas usage record was not persisted exactly once and rendered in the table');
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => {
      const nav = document.getElementById('mobileNav');
      return {
        viewport: window.innerWidth,
        visible: !!nav && getComputedStyle(nav).display !== 'none' &&
          nav.getBoundingClientRect().width >= 300,
        tabs: nav ? nav.querySelectorAll('button[data-tab]').length : 0
      };
    });
    if (!mobile.visible || mobile.tabs < 8) {
      throw new Error('EKPO mobile navigation is incomplete: ' + JSON.stringify(mobile));
    }
    await page.locator('#mobileNav button[data-tab="experiments"]').click();
    await page.waitForFunction(() =>
      document.querySelector('#page-experiments:not(.hidden)') &&
      document.querySelector('#mobileNav button.active')?.dataset.tab === 'experiments');
    if (pageErrors.length) throw new Error('EKPO browser runtime errors: ' + pageErrors.join(' | '));
    console.log('EKPO LabOS browser acceptance passed: dashboard, seven operational modules, contextual headers, gas-usage validation and persistence, and eight mobile navigation entries passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
