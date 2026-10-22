/* EKPO LabOS operations cockpit v3.
 * Replaces the legacy dashboard body while keeping all operational modules,
 * data tables, forms, migrations and local-ledger safeguards in legacy-app.js.
 */
(function () {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const rows = key => Array.isArray(DB && DB[key]) ? DB[key] : [];
  const today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  };
  const dateText = value => {
    const text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '日期未记录';
  };
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
  const count = value => Number(value || 0).toLocaleString('zh-CN');
  const openTab = key => {
    const item = document.querySelector('.sidebar .nav-item[data-tab="' + key + '"]');
    if (typeof switchTab === 'function') switchTab(key, item || null);
  };
  const provenanceInfo = provenance => {
    if (provenance === 'empty-ledger') return {
      label: '新建空台账', tone: 'empty',
      note: '新建空台账：没有现场记录；未录入的费用、库存、校准与运行状态保持未知。'
    };
    if (provenance === 'demo-seed') return {
      label: '演示样本', tone: 'demo',
      note: '当前包含程序内置示例；不得用于采购、结算、校准或安全判断。'
    };
    if (provenance === 'unknown') return {
      label: '来源待核验', tone: 'warning',
      note: '账本缺少来源标记；请核对原始凭证、导入批次、责任人和更新时间。'
    };
    return {
      label: '本机业务账本', tone: 'local',
      note: '数据保存在当前浏览器或绑定文件中；仍需以原始凭证核对记录真实性。'
    };
  };

  function render() {
    if (typeof DB === 'undefined') return;
    const host = $('#page-dashboard');
    if (!host) return;

    const gases = rows('gases');
    const equipment = rows('maintenance').filter(row => row && row.name);
    const maintenanceLogs = rows('maintLogs');
    const spares = rows('spareParts');
    const calibrations = rows('calibrationLogs');
    const experiments = rows('experiments');
    const diary = rows('testDiary');
    const provenance = DB.dataProvenance || DB.settings?.dataProvenance || 'unknown';
    const recoveryLocked = (typeof storageRecoveryRequired !== 'undefined' && storageRecoveryRequired) ||
      (typeof labStorageConflictDetected !== 'undefined' && labStorageConflictDetected);
    const source = recoveryLocked
      ? {label:'数据恢复保护',tone:'warning',note:'检测到无法确认的缓存或跨标签冲突。当前界面只读；请先导出恢复副本并核对原账本，不能把空白回退数据当作新账本。'}
      : provenanceInfo(provenance);
    const provenanceNote = $('#labos-data-note [data-provenance-note]');
    if (provenanceNote) provenanceNote.textContent = source.note;
    const validCalibrations = calibrations.filter(row =>
      /valid|有效|通过|ok/i.test(String(row.status || row.result || ''))
    );
    const calibratedIds = new Set(validCalibrations.map(row => String(row.eqId ?? row.assetId ?? '')));
    const calibratedEquipment = equipment.filter(row => calibratedIds.has(String(row.id))).length;
    const uncertifiedEquipment = equipment.filter(row => !calibratedIds.has(String(row.id)));
    const overdue = equipment.filter(row => validDate(row.next) && row.next < today());
    const failedTests = diary.filter(row => String(row.error || '').trim());
    const replenishment = spares.filter(row => /^(?:y|yes|是|低|replenish)$/i.test(String(row.replenish || row.status || '').trim()));
    const empty = !recoveryLocked && provenance === 'empty-ledger' &&
      !gases.length && !equipment.length && !maintenanceLogs.length &&
      !spares.length && !calibrations.length && !experiments.length && !diary.length;

    const attention = [];
    overdue.slice(0,4).forEach(row => attention.push({
      tone:'danger', title:row.name, detail:'下次保养日期 ' + row.next,
      action:'maintenance', actionLabel:'打开设备台账'
    }));
    failedTests.slice(0,4).forEach(row => attention.push({
      tone:'danger', title:row.unit || row.station || '测试记录异常',
      detail:String(row.error).slice(0,140), action:'testDiary', actionLabel:'检查测试日志'
    }));
    uncertifiedEquipment.slice(0,3).forEach(row => attention.push({
      tone:'warning', title:row.name, detail:'未找到标记为有效的校准记录；状态保持待核验。',
      action:'maintenance', actionLabel:'核对校准证据'
    }));
    replenishment.slice(0,3).forEach(row => attention.push({
      tone:'warning', title:row.desc || row.category || row.catalog || '备件条目',
      detail:'当前台账标记为需要补充。', action:'spareParts', actionLabel:'打开备件台账'
    }));

    const metrics = [
      {metric:'gas-records',label:'气体资源记录',value:count(gases.length),numeric:gases.length,foot:gases.length ? '本机已登记批次' : '尚未导入气体批次',icon:'H₂',key:'gases'},
      {metric:'equipment',label:'设备资产',value:count(equipment.length),numeric:equipment.length,foot:equipment.length ? '本机设备台账条目' : '尚未导入设备资产',icon:'EQ',key:'maintenance'},
      {metric:'calibration',label:'有效校准证据',value:equipment.length ? (calibratedEquipment + ' / ' + equipment.length) : '—',numeric:calibratedEquipment,foot:equipment.length ? '仅统计明确标记为有效的记录' : '设备和证书均未导入',icon:'QA',key:'maintenance'},
      {metric:'test-records',label:'测试运行日志',value:count(diary.length),numeric:diary.length,foot:diary.length ? (failedTests.length + ' 条含异常描述') : '尚无测试原始日志',icon:'RUN',key:'testDiary'},
      {metric:'active-experiments',label:'实验计划',value:count(experiments.length),numeric:experiments.length,foot:experiments.length ? '本机已登记实验任务' : '尚未登记实验计划',icon:'EXP',key:'experiments'}
    ];

    const metricHtml = metrics.map((item,index) =>
      '<button type="button" class="ekpo-oc-metric ekpo-oc-metric--' + index + '" data-ekpo-open="' + item.key + '" data-ekpo-metric="' + item.metric + '" data-value="' + item.numeric + '">' +
        '<span class="ekpo-oc-metric__top"><small>' + esc(item.label) + '</small><i>' + esc(item.icon) + '</i></span>' +
        '<strong>' + esc(item.value) + '</strong><span class="ekpo-oc-metric__foot">' + esc(item.foot) + '</span>' +
      '</button>'
    ).join('');

    const attentionHtml = attention.length ? attention.slice(0,8).map(item =>
      '<article class="ekpo-oc-attention ekpo-oc-attention--' + item.tone + '">' +
        '<i aria-hidden="true"></i><div><strong>' + esc(item.title) + '</strong><p>' + esc(item.detail) + '</p></div>' +
        '<button type="button" data-ekpo-open="' + item.action + '">' + esc(item.actionLabel) + ' ↗</button>' +
      '</article>'
    ).join('') :
      '<div class="ekpo-oc-empty"><strong>' + (empty ? '等待第一批现场记录' : '当前账本没有明确标记的异常') + '</strong>' +
      '<p>' + (empty
        ? '先导入设备铭牌、气体批次、校准证书或测试日志。空白不代表设备正常，也不会自动生成运行状态。'
        : '未发现被现有字段明确标记的异常；仍需按现场安全规程核对设备、校准和原始记录。') + '</p></div>';

    const equipmentHtml = equipment.length ? equipment.slice(0,6).map(row => {
      const isCalibrated = calibratedIds.has(String(row.id));
      return '<article class="ekpo-oc-equipment"><div><strong>' + esc(row.name) + '</strong>' +
        '<small>' + esc(row.category || '类别未记录') + ' · ' + esc(row.location || '位置未记录') + '</small></div>' +
        '<span class="ekpo-oc-status ' + (isCalibrated ? 'is-ok' : 'is-unknown') + '">' +
        (isCalibrated ? '校准记录标记有效' : '校准证据待核验') + '</span></article>';
    }).join('') :
      '<div class="ekpo-oc-empty"><strong>设备台账为空</strong><p>不预填设备名称、数量、负责人或保养日期。</p>' +
      '<button type="button" data-ekpo-open="maintenance">登记第一台设备 ↗</button></div>';

    const recentTests = diary.length ? diary.slice(-5).reverse().map(row => {
      const result = row.error && String(row.error).trim()
        ? '有异常描述：' + String(row.error).slice(0,100)
        : (row.result || '结果未记录');
      return '<article class="ekpo-oc-test"><span class="ekpo-oc-test__date">' +
        esc(dateText(row.start || row.date || row.end)) + '</span><div><strong>' +
        esc(row.unit || row.station || '未命名测试台') + '</strong><small>' +
        esc(row.operator || '操作人未记录') + '</small></div><span>' + esc(result) + '</span></article>';
    }).join('') :
      '<div class="ekpo-oc-empty"><strong>还没有测试日志</strong><p>导入或登记原始测试记录后，才显示执行历史。</p>' +
      '<button type="button" data-ekpo-open="testDiary">打开测试日志 ↗</button></div>';

    const gasRows = gases.length ? gases.slice(-5).reverse().map(row =>
      '<article class="ekpo-oc-resource"><span>' + esc(dateText(row.month ? row.month + '-01' : '')) + '</span>' +
      '<strong>' + esc(row.item || row.name || '气体条目') + '</strong><small>' +
      esc(row.spec || '规格未记录') + ' · ' + esc(row.supplier || '供应商未记录') + '</small>' +
      '<b>' + esc(Number.isFinite(Number(row.consumption)) ? count(row.consumption) : '—') +
      ' ' + esc(row.unit || '用量单位未记录') + '</b></article>'
    ).join('') : '<div class="ekpo-oc-empty"><strong>没有气体资源记录</strong><p>供应商、批次、规格和费用必须来自现场凭证。</p></div>';

    const inspectorNote = empty
      ? '新建空台账：所有运营指标保持空白，先导入原始凭证。'
      : source.note;
    const alertSummary = overdue.length + failedTests.length + uncertifiedEquipment.length + replenishment.length;

    host.innerHTML =
      '<section class="ekpo-operations-cockpit" aria-label="实验室运营控制台">' +
        '<header class="ekpo-oc-hero"><div><span class="ekpo-oc-eyebrow">EKPO LABOS / OPERATIONS CONTROL</span>' +
          '<h1>实验室运营控制台</h1><p>以设备、校准、资源和测试记录组织现场任务；数据缺失时明确显示待核验，不把空白解释为正常。</p>' +
          '<div class="ekpo-oc-hero__tags"><span>本机台账</span><span>来源可追溯</span><span>不生成虚构记录</span></div></div>' +
          '<div class="ekpo-oc-status ekpo-oc-status--' + source.tone + '"><i></i><strong>' + esc(source.label) + '</strong><small>' +
          (empty ? 'WAITING FOR VERIFIED RECORDS' : 'LOCAL DATA / SOURCE BOUNDARY') + '</small></div></header>' +
        '<div class="ekpo-oc-metrics">' + metricHtml + '</div>' +
        '<div class="ekpo-oc-layout"><div class="ekpo-oc-main">' +
          '<section class="ekpo-oc-workflow"><div class="ekpo-oc-section-head"><div><span class="ekpo-oc-eyebrow">OPERATING SEQUENCE</span>' +
            '<h2>运营任务流</h2><p>从资源入账到设备保障、校准核验与测试留痕。</p></div><span class="ekpo-oc-count">' +
            (empty ? '0 条现场记录' : count(gases.length + equipment.length + calibrations.length + diary.length) + ' 条本机记录') + '</span></div>' +
            '<div class="ekpo-oc-steps">' +
              '<button type="button" data-ekpo-open="gases"><i>01</i><strong>资源登记</strong><small>气体、批次、消耗与费用</small><b>打开资源台账 ↗</b></button>' +
              '<button type="button" data-ekpo-open="maintenance"><i>02</i><strong>设备保障</strong><small>资产、维保与位置记录</small><b>打开设备台账 ↗</b></button>' +
              '<button type="button" data-ekpo-open="maintenance"><i>03</i><strong>校准核验</strong><small>证书、机构、有效状态</small><b>查看校准记录 ↗</b></button>' +
              '<button type="button" data-ekpo-open="testDiary"><i>04</i><strong>测试执行</strong><small>台架、操作人、结果与异常</small><b>打开测试日志 ↗</b></button>' +
            '</div></section>' +
          '<div class="ekpo-oc-panels"><section class="ekpo-oc-panel"><div class="ekpo-oc-section-head"><div><span class="ekpo-oc-eyebrow">ATTENTION QUEUE</span>' +
            '<h2>需要核验的事项</h2><p>仅显示台账中已有证据的日期、状态和异常描述。</p></div><span class="ekpo-oc-count">' + count(alertSummary) + ' 项</span></div>' +
            '<div class="ekpo-oc-attention-list">' + attentionHtml + '</div></section>' +
          '<section class="ekpo-oc-panel"><div class="ekpo-oc-section-head"><div><span class="ekpo-oc-eyebrow">EQUIPMENT REGISTER</span>' +
            '<h2>设备与校准证据</h2><p>' + count(calibratedEquipment) + ' / ' + count(equipment.length) + ' 台设备有明确标记有效的校准记录。</p></div>' +
            '<button type="button" class="ekpo-oc-text-action" data-ekpo-open="maintenance">完整台账 ↗</button></div>' +
            '<div class="ekpo-oc-equipment-list">' + equipmentHtml + '</div></section></div>' +
          '<div class="ekpo-oc-panels"><section class="ekpo-oc-panel"><div class="ekpo-oc-section-head"><div><span class="ekpo-oc-eyebrow">TEST HISTORY</span>' +
            '<h2>近期测试记录</h2><p>显示现有日志字段；空字段不会被推断为通过。</p></div>' +
            '<button type="button" class="ekpo-oc-text-action" data-ekpo-open="testDiary">所有日志 ↗</button></div>' +
            '<div class="ekpo-oc-test-list">' + recentTests + '</div></section>' +
          '<section class="ekpo-oc-panel"><div class="ekpo-oc-section-head"><div><span class="ekpo-oc-eyebrow">RESOURCE REGISTER</span>' +
            '<h2>气体资源</h2><p>以本机登记批次为准，不自动补入市场或供应商数据。</p></div>' +
            '<button type="button" class="ekpo-oc-text-action" data-ekpo-open="gases">全部资源 ↗</button></div>' +
            '<div class="ekpo-oc-resource-list">' + gasRows + '</div></section></div>' +
          '</div><aside class="ekpo-oc-inspector">' +
            '<section class="ekpo-oc-inspector-card"><span class="ekpo-oc-eyebrow">DATA PROVENANCE</span><h2>数据来源与边界</h2>' +
              '<div class="ekpo-oc-source"><i></i><strong>' + esc(source.label) + '</strong></div><p>' + esc(inspectorNote) + '</p>' +
              '<ul><li>空白字段不等于零或正常。</li><li>校准有效性只按明确记录的状态计数。</li><li>费用与库存仅反映本机台账，不是外部实时数据。</li><li>实验室安全状态仍需现场检查和原始凭证。</li></ul></section>' +
            '<section class="ekpo-oc-inspector-card"><span class="ekpo-oc-eyebrow">QUICK ACTIONS</span><h2>快捷操作</h2>' +
              '<button type="button" class="ekpo-oc-action" data-ekpo-open="gases">＋ 登记气体批次 <b>↗</b></button>' +
              '<button type="button" class="ekpo-oc-action" data-ekpo-open="maintenance">＋ 登记设备 / 校准 <b>↗</b></button>' +
              '<button type="button" class="ekpo-oc-action" data-ekpo-open="spareParts">＋ 登记备件流水 <b>↗</b></button>' +
              '<button type="button" class="ekpo-oc-action" data-ekpo-open="testDiary">＋ 录入测试日志 <b>↗</b></button></section>' +
            '<section class="ekpo-oc-inspector-card ekpo-oc-inspector-card--note"><span class="ekpo-oc-eyebrow">SYSTEM MODE</span>' +
              '<h2>本机运营记录</h2><p>当前工作台不连接气体供应商、校准机构或测试台控制器。真实数据必须通过导入或手动登记并核对来源。</p>' +
              '<button type="button" data-ekpo-open="system">打开系统设置 ↗</button></section>' +
          '</aside></div></section>';

    host.querySelectorAll('[data-ekpo-open]').forEach(button => {
      button.addEventListener('click', () => openTab(button.dataset.ekpoOpen));
    });
  }

  window.renderEkpoOperationsCockpit = render;
  if (typeof renderDashboard === 'function') {
    const original = renderDashboard;
    window.renderDashboard = function () {
      render();
      return undefined;
    };
    // Keep a reference for diagnostics and explicit fallback restoration.
    window.renderEkpoLegacyDashboard = original;
  }
  window.addEventListener('load', () => window.setTimeout(render, 80), { once:true });
})();