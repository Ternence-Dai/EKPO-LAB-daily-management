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
    const seedResponse = await page.request.get('http://127.0.0.1:4173/assets/js/demo-seed-data.js?v=20261022-empty-ledger-v1');
    const seedSource = await seedResponse.text();
    if (!seedResponse.ok() || !seedSource.includes("dataProvenance: 'demo-seed'") ||
        seedSource.includes('戴煜') || seedSource.includes('Terrence') ||
        seedSource.includes('林德气体') || seedSource.includes('Moewald')) {
      throw new Error('EKPO sample records must not carry unverified people, suppliers or maintenance organizations');
    }

    const referenceStylesheet = page.locator('link[rel="stylesheet"][href*="reference-platform-v4.css"]');
    if (await referenceStylesheet.count() !== 1) throw new Error('LIMS operations console stylesheet is not linked');
    const referenceCssResponse = await page.request.get(await referenceStylesheet.evaluate(node => node.href));
    const referenceCssText = await referenceCssResponse.text();
    const labOperationsLayout = await page.locator('.sidebar').evaluate(node => ({
      position: getComputedStyle(node).position,
      width: getComputedStyle(node).width,
      flexBasis: getComputedStyle(node).flexBasis
    }));
    if (!referenceCssResponse.ok() || !referenceCssText.includes('--ref-line:#d5e3df') ||
        labOperationsLayout.position !== 'sticky' || labOperationsLayout.width !== '254px' ||
        labOperationsLayout.flexBasis !== '254px') {
      throw new Error('LIMS operations layout was not loaded/applied: ' + JSON.stringify(labOperationsLayout));
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    const wideLab = await page.evaluate(() => {
      const sidebar = document.querySelector('.sidebar');
      const main = document.querySelector('.main-content');
      const content = document.querySelector('.content-body');
      const rect = node => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      };
      return {
        sidebar: rect(sidebar), main: rect(main), content: rect(content),
        marginLeft: getComputedStyle(main).marginLeft
      };
    });
    if (wideLab.marginLeft !== '0px' ||
        wideLab.main.left < wideLab.sidebar.right - 1 ||
        wideLab.main.left > wideLab.sidebar.right + 2 ||
        wideLab.content.width < wideLab.main.width * 0.88) {
      throw new Error('EKPO operations content remains offset or constrained: ' + JSON.stringify(wideLab));
    }

    const skipLink = page.locator('a.skip-link[href="#main-content"]');
    if (await skipLink.count() !== 1) throw new Error('Keyboard skip-navigation link is missing');
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => document.activeElement?.classList.contains('skip-link')))) {
      throw new Error('Skip navigation is not the first keyboard focus target');
    }
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.id === 'main-content');
    const appScript = await page.locator('script[src*="assets/js/legacy-app.js"]').getAttribute('src');
    const workspaceScript = await page.locator('script[src*="assets/js/workspace-v5.js"]').getAttribute('src');
    if (!appScript || !appScript.includes('v=20261022-empty-ledger-v1') ||
        !workspaceScript || !workspaceScript.includes('v=20261019-v5') ||
        !(await page.locator('.sidebar .nav-item[data-tab="gases"]').count())) {
      throw new Error('EKPO active app, workspace and lifecycle navigation are not loaded');
    }
    const ledgerDisclosure = page.locator('#labos-data-note');
    if (!(await ledgerDisclosure.isVisible()) ||
        !(await ledgerDisclosure.locator('[data-provenance-note]').innerText()).includes('新建空台账')) {
      throw new Error('A new EKPO account must disclose that it starts with an empty, unverified ledger');
    }
    const firstRunLedger = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('lab_management_db_v9') || '{}');
      return {
        provenance: db.dataProvenance,
        gases: db.gases?.length ?? -1,
        maintenance: db.maintenance?.length ?? -1,
        maintenanceLogs: db.maintLogs?.length ?? -1,
        spares: db.spareParts?.length ?? -1,
        calibrations: db.calibrationLogs?.length ?? -1,
        experiments: db.experiments?.length ?? -1,
        diary: db.testDiary?.length ?? -1
      };
    });
    if (firstRunLedger.provenance !== 'empty-ledger' ||
        Object.entries(firstRunLedger).some(([key,value]) => key !== 'provenance' && value !== 0)) {
      throw new Error('A new EKPO installation must not seed synthetic operational records: ' + JSON.stringify(firstRunLedger));
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
    const dashboardPriority = await page.evaluate(() => {
      const root = document.querySelector('#page-dashboard');
      const panel = root?.querySelector('#lab-readiness');
      const metrics = root?.querySelector('.metrics-grid');
      const charts = root?.querySelector('.charts-row');
      const note = document.querySelector('#labos-data-note [data-provenance-note]')?.textContent || '';
      return {
        hasGenericLifecycleBoard: !!root?.querySelector('.labos-workflow-board'),
        readinessBeforeMetrics: !!panel && !!metrics && !!(panel.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING),
        readinessBeforeCharts: !!panel && !!charts && !!(panel.compareDocumentPosition(charts) & Node.DOCUMENT_POSITION_FOLLOWING),
        top: panel?.getBoundingClientRect().top ?? Infinity,
        metricsCount: panel?.querySelectorAll('[data-readiness-metric]').length ?? 0,
        provenanceNote: note
      };
    });
    if (dashboardPriority.hasGenericLifecycleBoard ||
        !dashboardPriority.readinessBeforeMetrics ||
        !dashboardPriority.readinessBeforeCharts ||
        dashboardPriority.metricsCount !== 5 ||
        dashboardPriority.top > 720 ||
        !dashboardPriority.provenanceNote.includes('新建空台账')) {
      throw new Error('EKPO dashboard must prioritize live readiness, remove duplicated static lifecycle cards, and disclose the demo ledger: ' +
        JSON.stringify(dashboardPriority));
    }
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
    if (readinessEvidence.equipment !== 0 ||
        readinessEvidence.activeExperiments !== 0 ||
        readinessEvidence.actions !== 2 ||
        !readinessEvidence.labels.includes('设备与实验就绪度') ||
        !readinessEvidence.labels.includes('校准覆盖') ||
        !readinessEvidence.labels.includes('尚未导入设备台账')) {
      throw new Error('An empty lab ledger must report readiness as unverified, not normal: ' +
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
      const expectedTitles = {
        gases: '气体使用记录', maintenance: '设备维保管理',
        spareParts: '备件库存管理', testDiary: '测试台运行日志',
        experiments: '实验计划与生命周期', yearly: '年度综合统计', system: '系统全量设置'
      };
      const title = (await page.locator('#pageTitle').innerText()).trim();
      if (title !== expectedTitles[tab]) {
        throw new Error('EKPO navigation title did not follow the selected operational ledger: ' +
          JSON.stringify({tab, title, expected:expectedTitles[tab]}));
      }
      const text = await page.locator('#page-' + tab).innerText();
      if (!text.trim() || text.includes('页面不存在')) {
        throw new Error('EKPO module failed to render: ' + tab);
      }
      if (tab === 'maintenance') {
        const equipmentRows = await page.locator('#table-maintenance tbody tr').count();
        if (equipmentRows !== readinessEvidence.equipment) {
          throw new Error('Empty dashboard equipment total must match the empty equipment register: ' +
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

    // Seed one synthetic asset only in this isolated Playwright browser so the
    // real calibration workflow can be exercised without fabricating live records.
    await page.locator('.sidebar .nav-item[data-tab="maintenance"]').click();
    await page.waitForSelector('#page-maintenance:not(.hidden)');
    await page.locator('#page-maintenance .action-bar button.btn-primary').click();
    const maintenanceModal = page.locator('#modal-maint');
    await maintenanceModal.waitFor({ state: 'visible' });
    await maintenanceModal.locator('#m-name').fill('PW Synthetic test bench');
    await maintenanceModal.locator('#m-category').fill('Acceptance fixture');
    await maintenanceModal.locator('#m-location').fill('Isolated browser context');
    await maintenanceModal.locator('#m-qty').fill('1');
    await maintenanceModal.locator('#m-cycle').selectOption({ label: '一级保养' });
    await maintenanceModal.locator('#m-freq').fill('年度');
    await maintenanceModal.locator('#m-last').fill('2026-01-01');
    await maintenanceModal.locator('#m-next').fill('2027-01-01');
    await maintenanceModal.locator('#m-responsible').fill('Playwright only');
    await maintenanceModal.locator('#m-record').fill('Synthetic fixture; not a live lab asset');
    await maintenanceModal.locator('button[onclick="saveMaint()"]').click();
    await page.waitForFunction(() => document.getElementById('modal-maint')?.style.display === 'none');
    await page.waitForFunction(() => {
      const db = JSON.parse(localStorage.getItem('lab_management_db_v9') || '{}');
      return (db.maintenance || []).some(row => row.name === 'PW Synthetic test bench');
    }, undefined, { timeout: 10000 });

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
