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
    console.log('EKPO LabOS browser acceptance passed: dashboard, seven operational modules, contextual module headers and eight mobile navigation entries passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
