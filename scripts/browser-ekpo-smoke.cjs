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
    const skipLink = page.locator('a.skip-link[href="#main-content"]');
    if (await skipLink.count() !== 1) throw new Error('Keyboard skip-navigation link is missing');
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => document.activeElement?.classList.contains('skip-link')))) {
      throw new Error('Skip navigation is not the first keyboard focus target');
    }
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.id === 'main-content');
    const contextScript = await page.locator('script[src*="workspace-v5-context.js"]').getAttribute('src');
    if (!contextScript || !contextScript.includes('v=20261021-mutationobserver-fix-v1')) {
      throw new Error('Workspace observer fix cache-busting URL is missing: ' + contextScript);
    }
    await page.waitForSelector('#page-dashboard:not(.hidden)');
    if (!(await page.locator('#page-dashboard').innerText()).trim()) {
      throw new Error('EKPO dashboard did not render its operating summary');
    }

    await page.waitForFunction(() => {
      const panel = document.getElementById('lab-readiness');
      return panel && panel.dataset.loaded === 'true' &&
        panel.querySelectorAll('[data-readiness-metric]').length === 5 &&
        panel.getAttribute('aria-busy') === 'false';
    }, undefined, { timeout: 15000 });
    const readinessEvidence = await page.evaluate(() => {
      const panel = document.getElementById('lab-readiness');
      const value = key => panel?.querySelector('[data-readiness-metric="' + key + '"]')?.dataset.value;
      return {
        equipment: Number(value('equipment')),
        activeExperiments: Number(value('active-experiments')),
        labels: panel?.innerText || '',
        actions: panel?.querySelectorAll('.lab-readiness__actions button').length || 0
      };
    });
    if (!Number.isFinite(readinessEvidence.equipment) ||
        !Number.isFinite(readinessEvidence.activeExperiments) ||
        readinessEvidence.actions !== 2 ||
        !readinessEvidence.labels.includes('设备与实验就绪度') ||
        !readinessEvidence.labels.includes('校准未就绪') ||
        !readinessEvidence.labels.includes('需要关注的设备')) {
      throw new Error('EKPO dashboard readiness panel did not expose its live operational metrics: ' +
        JSON.stringify(readinessEvidence));
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
      if (tab === 'maintenance') {
        await page.waitForFunction(() => document.querySelectorAll('#table-maintenance tbody tr').length > 0,
          undefined, { timeout: 10000 });
        const equipmentRows = await page.locator('#table-maintenance tbody tr').count();
        if (equipmentRows !== readinessEvidence.equipment) {
          throw new Error('Dashboard equipment total does not match the equipment register view: ' +
            JSON.stringify({ dashboard: readinessEvidence.equipment, registerRows: equipmentRows }));
        }
      }
      if (tab === 'experiments') {
        await page.waitForFunction(() => {
          const count = document.getElementById('experiment-count-active');
          return !!count && count.textContent.trim() !== '';
        }, undefined, { timeout: 10000 });
        const activeCount = Number((await page.locator('#experiment-count-active').innerText()).trim());
        if (activeCount !== readinessEvidence.activeExperiments) {
          throw new Error('Dashboard active-experiment metric does not match experiment lifecycle summary: ' +
            JSON.stringify({ dashboard: readinessEvidence.activeExperiments, experimentSummary: activeCount }));
        }
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
    await gasModal.locator('button[onclick="saveGas()"]').click();
    await page.waitForFunction(() => document.getElementById('toast')?.textContent.includes('不能为负数或非数字'));
    let labCache = await page.evaluate(() => JSON.parse(localStorage.getItem('lab_management_db_v9') || '{}'));
    if ((labCache.gases || []).some(row => row.batch === 'PW-GAS-001')) {
      throw new Error('Invalid negative gas cost was persisted to the laboratory ledger');
    }

    await gasModal.locator('#g-cost').fill('120');
    await gasModal.locator('button[onclick="saveGas()"]').click();
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

    // Exercise the calibration certificate workflow and append-only provenance ledger.
    await page.locator('.sidebar .nav-item[data-tab="maintenance"]').click();
    await page.waitForSelector('#page-maintenance:not(.hidden)');
    await page.locator('#tab-maint-calibration').click();
    await page.waitForFunction(() =>
      document.querySelector('#maint-calibration-view') &&
      !document.querySelector('#maint-calibration-view').classList.contains('hidden') &&
      document.querySelectorAll('#cal-asset option').length > 1
    , undefined, { timeout: 10000 });
    await page.locator('#cal-asset').selectOption({ index: 1 });
    await page.locator('#cal-date').fill('2026-10-22');
    await page.locator('#cal-valid-days').fill('365');
    await page.locator('#cal-certificate').fill('PW-CAL-001');
    await page.locator('#cal-organization').fill('Synthetic Calibration Lab');
    await page.locator('#cal-operator').fill('Playwright acceptance');
    await page.locator('#cal-result').selectOption('pass');
    await page.locator('#cal-notes').fill('Synthetic browser fixture; not a real calibration certificate');
    await page.locator('#maint-calibration-view button[onclick="saveCalibration()"]').click();
    await page.waitForFunction(() =>
      document.querySelector('#table-calibration tbody')?.textContent.includes('PW-CAL-001')
    , undefined, { timeout: 10000 });
    let calibrationDB = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('lab_management_db_v9') || '{}'));
    const calibrationRows = calibrationDB.calibrationLogs || [];
    const calibration = calibrationRows.find(row => row.certificateNo === 'PW-CAL-001');
    if (!calibration || calibration.result !== 'pass' ||
        calibration.validForDays !== 365 ||
        !String(calibration.assetId).trim() ||
        calibration.organization !== 'Synthetic Calibration Lab' ||
        calibration.operator !== 'Playwright acceptance') {
      throw new Error('Calibration evidence record was not persisted with its equipment identity, certificate, organization and operator');
    }

    // Re-submitting an identical equipment / organization / certificate tuple must be blocked.
    await page.locator('#cal-certificate').fill('PW-CAL-001');
    await page.locator('#cal-organization').fill('Synthetic Calibration Lab');
    await page.locator('#cal-operator').fill('Playwright acceptance');
    await page.locator('#maint-calibration-view button[onclick="saveCalibration()"]').click();
    await page.waitForFunction(() =>
      document.getElementById('toast')?.textContent.includes('相同机构与证书编号')
    , undefined, { timeout: 10000 });
    calibrationDB = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('lab_management_db_v9') || '{}'));
    if ((calibrationDB.calibrationLogs || []).filter(row => row.certificateNo === 'PW-CAL-001').length !== 1) {
      throw new Error('Duplicate calibration certificate was appended to the history ledger');
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
