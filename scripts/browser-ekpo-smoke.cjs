'use strict';

const { chromium } = require('playwright');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 30000 });
    const seedResponse = await page.request.get('http://127.0.0.1:4173/assets/js/demo-seed-data.js?v=20261022-demo-migration-v2');
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

    const cockpitStylesheet = page.locator('link[rel="stylesheet"][href*="ekpo-operations-cockpit-v3.css"]');
    const cockpitScript = page.locator('script[src*="ekpo-operations-cockpit-v3.js"]');
    if (await cockpitStylesheet.count() !== 1 || await cockpitScript.count() !== 1) {
      throw new Error('EKPO reference operations cockpit assets are not linked');
    }
    const cockpitCssResponse = await page.request.get(await cockpitStylesheet.evaluate(node => node.href));
    const cockpitCss = await cockpitCssResponse.text();
    if (!cockpitCssResponse.ok() || !cockpitCss.includes('--ekpo-bg:#071321') ||
        !(await page.locator('#page-dashboard .ekpo-operations-cockpit').count())) {
      throw new Error('EKPO reference cockpit did not load or mount');
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
    if (!appScript || !appScript.includes('v=20261022-demo-migration-v2') ||
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

    const dashboardPriority = await page.evaluate(() => {
      const root = document.querySelector('#page-dashboard');
      const cockpit = root?.querySelector('.ekpo-operations-cockpit');
      const note = document.querySelector('#labos-data-note [data-provenance-note]')?.textContent || '';
      return {
        cockpit: !!cockpit,
        metrics: cockpit?.querySelectorAll('.ekpo-oc-metric').length || 0,
        metricColumns:cockpit ? getComputedStyle(cockpit.querySelector('.ekpo-oc-metrics')).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
        metricTopOffsets:[...(cockpit?.querySelectorAll('.ekpo-oc-metric') || [])].map(node => node.getBoundingClientRect().top),
        workflowSteps: cockpit?.querySelectorAll('.ekpo-oc-steps button').length || 0,
        inspector: !!cockpit?.querySelector('.ekpo-oc-inspector'),
        oldMetrics: !!root?.querySelector('.metrics-grid'),
        oldCharts: !!root?.querySelector('.charts-row'),
        oldLaunchpad: !!root?.querySelector('.labos-launchpad'),
        oldReadinessBoard: !!root?.querySelector('.lab-readiness'),
        provenanceNote: note
      };
    });
    if (!dashboardPriority.cockpit || dashboardPriority.metrics !== 5 ||
        dashboardPriority.metricColumns !== 5 ||
        dashboardPriority.metricTopOffsets.some(value => Math.abs(value - dashboardPriority.metricTopOffsets[0]) > 2) ||
        dashboardPriority.workflowSteps !== 4 || !dashboardPriority.inspector ||
        dashboardPriority.oldMetrics || dashboardPriority.oldCharts ||
        dashboardPriority.oldLaunchpad || dashboardPriority.oldReadinessBoard ||
        !dashboardPriority.provenanceNote.includes('没有现场记录')) {
      throw new Error('EKPO dashboard still contains replaced legacy summary/chart blocks or lacks the reference cockpit: ' +
        JSON.stringify(dashboardPriority));
    }

    fs.mkdirSync('artifacts', { recursive:true });
    await page.locator('#page-dashboard .ekpo-oc-metrics').screenshot({
      path:'artifacts/ekpo-dashboard-five-kpi-desktop.png'
    });
    await page.setViewportSize({ width:1024, height:900 });
    const tabletMetricColumns = await page.locator('#page-dashboard .ekpo-oc-metrics').evaluate(node =>
      getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length
    );
    if (tabletMetricColumns !== 3) {
      throw new Error('EKPO tablet KPI grid must use three columns: ' + tabletMetricColumns);
    }
    await page.setViewportSize({ width:1440, height:960 });

    const readinessEvidence = await page.evaluate(() => {
      const root = document.querySelector('#page-dashboard .ekpo-operations-cockpit');
      const value = key => Number(root?.querySelector('[data-ekpo-metric="' + key + '"]')?.dataset.value);
      return {
        equipment: value('equipment'),
        activeExperiments: value('active-experiments'),
        labels: root?.innerText || '',
        actions: root?.querySelectorAll('.ekpo-oc-action').length || 0
      };
    });
    if (readinessEvidence.equipment !== 0 || readinessEvidence.activeExperiments !== 0 ||
        readinessEvidence.actions !== 4 ||
        !readinessEvidence.labels.includes('实验室运营控制台') ||
        !readinessEvidence.labels.includes('有效校准证据') ||
        !readinessEvidence.labels.includes('等待第一批现场记录')) {
      throw new Error('An empty lab ledger must render an actionable unverified cockpit, not fabricated status: ' +
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

    // Isolated synthetic asset with overdue maintenance and no calibration certificate.
    const dateWindow = await page.evaluate(() => {
      const base = new Date(); base.setUTCHours(0,0,0,0);
      const yesterday = new Date(base); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const tomorrow = new Date(base); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      return { yesterday:yesterday.toISOString().slice(0,10), tomorrow:tomorrow.toISOString().slice(0,10) };
    });
    await page.locator('.sidebar .nav-item[data-tab="maintenance"]').click();
    await page.waitForSelector('#page-maintenance:not(.hidden)');
    await page.locator('#page-maintenance .action-bar button.btn-primary').click();
    const overdueModal = page.locator('#modal-maint');
    await overdueModal.waitFor({ state: 'visible' });
    await overdueModal.locator('#m-name').fill('PW Overdue synthetic bench');
    await overdueModal.locator('#m-category').fill('Acceptance fixture');
    await overdueModal.locator('#m-location').fill('Isolated browser context');
    await overdueModal.locator('#m-qty').fill('1');
    await overdueModal.locator('#m-cycle').selectOption({ label: '一级保养' });
    await overdueModal.locator('#m-freq').fill('年度');
    await overdueModal.locator('#m-last').fill('2025-01-01');
    await overdueModal.locator('#m-next').fill(dateWindow.yesterday);
    await overdueModal.locator('#m-responsible').fill('Playwright only');
    await overdueModal.locator('#m-record').fill('Synthetic overdue asset fixture; not a live lab asset');
    await overdueModal.locator('button[onclick="saveMaint()"]').click();
    await page.waitForFunction(() => document.getElementById('modal-maint')?.style.display === 'none');
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('lab_management_db_v9') || '{}').maintenance || [])
      .some(row => row.name === 'PW Overdue synthetic bench'), undefined, { timeout:10000 });

    await page.locator('.sidebar .nav-item[data-tab="experiments"]').click();
    await page.waitForSelector('#page-experiments:not(.hidden)');
    await page.waitForFunction(() => {
      const labels = [...(document.querySelector('#experiment-asset')?.options || [])].map(option => option.textContent);
      return labels.some(label => label.includes('PW Synthetic test bench')) &&
        labels.some(label => label.includes('PW Overdue synthetic bench'));
    }, undefined, { timeout:10000 });
    const equipmentIds = await page.locator('#experiment-asset').evaluate(select => ({
      calibrated:[...select.options].find(option => option.textContent.includes('PW Synthetic test bench'))?.value || '',
      overdue:[...select.options].find(option => option.textContent.includes('PW Overdue synthetic bench'))?.value || ''
    }));
    if (!equipmentIds.calibrated || !equipmentIds.overdue) {
      throw new Error('Synthetic preflight assets are missing from the experiment selector: ' + JSON.stringify(equipmentIds));
    }
    const fillPlan = async (title, assetId) => {
      await page.locator('#experiment-title').fill(title);
      await page.locator('#experiment-asset').selectOption(assetId);
      await page.locator('#experiment-planned-date').fill(dateWindow.tomorrow);
      await page.locator('#experiment-owner').fill('Playwright acceptance');
      await page.locator('#experiment-creator').fill('Playwright acceptance');
      await page.locator('#experiment-purpose').fill('Synthetic browser preflight fixture; no measurements were performed.');
    };
    await fillPlan('PW Preflight ready plan', equipmentIds.calibrated);
    await page.waitForFunction(() => document.querySelector('#experiment-preflight-preview .ekpo-preflight-preview__state.is-ready'),
      undefined, { timeout:10000 });
    await page.locator('#experiment-create-button').click();
    await page.waitForFunction(title => (JSON.parse(localStorage.getItem('lab_management_db_v9') || '{}').experiments || [])
      .some(record => record.title === title), 'PW Preflight ready plan', { timeout:10000 });

    await fillPlan('PW Preflight blocked plan', equipmentIds.overdue);
    await page.waitForFunction(() => {
      const preview = document.querySelector('#experiment-preflight-preview .ekpo-preflight-preview__state');
      return !!preview && preview.classList.contains('is-blocked') && preview.textContent.includes('维护已逾期');
    }, undefined, { timeout:10000 });
    await page.locator('#experiment-create-button').click();
    await page.waitForFunction(title => (JSON.parse(localStorage.getItem('lab_management_db_v9') || '{}').experiments || [])
      .some(record => record.title === title), 'PW Preflight blocked plan', { timeout:10000 });

    const preflightEvidence = await page.evaluate(() => {
      const panel = document.querySelector('.ekpo-preflight');
      const cards = [...(panel?.querySelectorAll('.ekpo-preflight-card') || [])];
      const ready = cards.find(card => card.querySelector('.ekpo-preflight-card__top strong')?.textContent === 'PW Preflight ready plan');
      const blocked = cards.find(card => card.querySelector('.ekpo-preflight-card__top strong')?.textContent === 'PW Preflight blocked plan');
      const rows = [...document.querySelectorAll('#experiments-table tbody tr')];
      const readyRow = rows.find(row => row.innerText.includes('PW Preflight ready plan'));
      const blockedRow = rows.find(row => row.innerText.includes('PW Preflight blocked plan'));
      return {
        present:!!panel,readyText:ready?.innerText || '',blockedText:blocked?.innerText || '',
        readyStartDisabled:!!readyRow?.querySelector('[data-experiment-action="start"]')?.disabled,
        blockedStartDisabled:!!blockedRow?.querySelector('[data-experiment-action="start"]')?.disabled,
        metrics:[...(panel?.querySelectorAll('.ekpo-preflight__metrics strong') || [])].map(node=>node.textContent),
        boundary:panel?.querySelector('.ekpo-preflight__limits')?.textContent || ''
      };
    });
    if (!preflightEvidence.present ||
        !preflightEvidence.readyText.includes('设备条件通过') ||
        !preflightEvidence.blockedText.includes('阻止启动') ||
        !preflightEvidence.blockedText.includes('维护已逾期') ||
        preflightEvidence.readyStartDisabled || !preflightEvidence.blockedStartDisabled ||
        preflightEvidence.metrics.slice(0,3).join(',') !== '2,1,1' ||
        !preflightEvidence.boundary.includes('未关联结构化耗材需求')) {
      throw new Error('Experiment preflight failed to distinguish ready/blocked equipment and disclose the consumables boundary: ' +
        JSON.stringify(preflightEvidence));
    }
    fs.mkdirSync('artifacts', { recursive:true });
    await page.locator('.ekpo-preflight').screenshot({ path:'artifacts/ekpo-experiment-preflight-desktop.png' });

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
    const mobileMetricColumns = await page.locator('#page-dashboard .ekpo-oc-metrics').evaluate(node =>
      getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length
    );
    if (mobileMetricColumns !== 2) {
      throw new Error('EKPO mobile KPI grid must use two columns: ' + mobileMetricColumns);
    }
    await page.locator('#page-dashboard .ekpo-oc-metrics').screenshot({
      path:'artifacts/ekpo-dashboard-five-kpi-mobile.png'
    });
    await page.locator('#mobileNav button[data-tab="experiments"]').click();
    await page.waitForFunction(() =>
      document.querySelector('#page-experiments:not(.hidden)') &&
      document.querySelector('#mobileNav button.active')?.dataset.tab === 'experiments');
    const mobilePreflight = await page.locator('.ekpo-preflight').evaluate(node => {
      const rect = node.getBoundingClientRect();
      const cards = node.querySelector('.ekpo-preflight__cards');
      return {
        left:rect.left,right:rect.right,width:rect.width,
        contentWidth:document.querySelector('.main-content')?.getBoundingClientRect().width,
        columns:cards ? getComputedStyle(cards).gridTemplateColumns.split(' ').filter(Boolean).length : 0
      };
    });
    if (!mobilePreflight.width || mobilePreflight.width < 340 ||
        mobilePreflight.left < 0 || mobilePreflight.right > 391 ||
        !mobilePreflight.contentWidth || mobilePreflight.contentWidth < 360 ||
        mobilePreflight.columns !== 1) {
      throw new Error('Mobile experiment preflight is clipped or not a single-column readiness list: ' +
        JSON.stringify(mobilePreflight));
    }
    await page.evaluate(() => document.activeElement?.blur());
    const cleanPreflightEvidence = await page.addStyleTag({
      content: '.topbar,#mobileNav,.bottomnav,.sidebar,#toastRoot,.toast,.toast-container{display:none!important}'
    });
    await page.evaluate(() => {
      document.querySelector('.ekpo-preflight')?.scrollIntoView({block:'start',behavior:'instant'});
    });
    await page.waitForFunction(() => {
      const rect = document.querySelector('.ekpo-preflight')?.getBoundingClientRect();
      return !!rect && rect.top >= 0 && rect.top < 100 && rect.height > 200;
    }, undefined, { timeout:5000 });
    const preflightClip = await page.locator('.ekpo-preflight').evaluate(node => {
      const rect = node.getBoundingClientRect();
      return {x:Math.max(0,rect.x),y:Math.max(0,rect.y),
        width:Math.min(rect.width,innerWidth-Math.max(0,rect.x)),
        height:Math.min(rect.height,innerHeight-Math.max(0,rect.y))};
    });
    if (preflightClip.width < 340 || preflightClip.height < 200 ||
        preflightClip.x < 0 || preflightClip.y < 0 ||
        preflightClip.x + preflightClip.width > 391 ||
        preflightClip.y + preflightClip.height > 1201) {
      throw new Error('Mobile experiment preflight crop is outside the viewport: ' + JSON.stringify(preflightClip));
    }
    await page.screenshot({path:'artifacts/ekpo-experiment-preflight-mobile.png',clip:preflightClip,animations:'disabled'});
    await cleanPreflightEvidence.evaluate(node => node.remove());
    await page.setViewportSize({ width:1440, height:960 });
    await page.locator('#experiment-action-actor').fill('Playwright acceptance');
    await page.locator('#experiments-table tbody tr').filter({hasText:'PW Preflight ready plan'})
      .locator('[data-experiment-action="start"]').click();
    await page.waitForFunction(() => {
      const db = JSON.parse(localStorage.getItem('lab_management_db_v9') || '{}');
      return (db.experiments || []).some(record =>
        record.title === 'PW Preflight ready plan' && record.status === 'in-progress' && record.audit?.length === 2
      );
    }, undefined, { timeout:10000 });
    if (pageErrors.length) throw new Error('EKPO browser runtime errors: ' + pageErrors.join(' | '));
    console.log('EKPO LabOS browser acceptance passed: dashboard, seven modules, calibration ledger, maintenance-aware experiment preflight, blocked start and responsive visual evidence passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
