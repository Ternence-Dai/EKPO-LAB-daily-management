/* Reference shell v4: evidence-led lab readiness command board. */
(function () {
  'use strict';
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function mount() {
    const host = document.getElementById('page-dashboard');
    if (!host || host.querySelector('.lab-readiness')) return;
    if (typeof DB === 'undefined') return;
    const equipment = Array.isArray(DB.maintenance) ? DB.maintenance : [];
    const gas = Array.isArray(DB.gases) ? DB.gases : [];
    const spare = Array.isArray(DB.spareParts) ? DB.spareParts : [];
    const diary = Array.isArray(DB.testDiary) ? DB.testDiary : [];
    const calibration = Array.isArray(DB.calibrationLogs) ? DB.calibrationLogs : [];
    const activeEquipment = equipment.filter(row => row && row.name).length;
    const calibrationReady = equipment.filter(row => {
      const id = String(row.id ?? '');
      return calibration.some(log => String(log.eqId ?? log.assetId ?? '') === id && /valid|有效|通过|ok/i.test(String(log.status ?? log.result ?? '')));
    }).length;
    const gasAlerts = gas.filter(row => Number(row.return ?? row.balance ?? row.stock ?? 0) < 0).length;
    const spareAlerts = spare.filter(row => /Y|yes|是|低/i.test(String(row.replenish ?? row.status ?? ''))).length;
    const failedTests = diary.filter(row => String(row.error || '').trim()).length;
    const coverage = activeEquipment ? Math.round(calibrationReady / activeEquipment * 100) : 0;
    const board = document.createElement('section');
    board.className = 'lab-readiness';
    board.setAttribute('aria-label','实验室运行就绪度指挥台');
    board.innerHTML =
      '<div class="lab-readiness__head"><div><span class="eyebrow">LAB OPERATIONS / READINESS</span><h3>实验室运行就绪度</h3><p>以设备、校准、资源和测试日志为证据组织今日运营优先级；未知状态保持未知，不用演示数据冒充现场结论。</p></div>' +
      '<div class="lab-readiness__actions"><button type="button" onclick="switchTab(\'maintenance\',document.querySelector(\'[data-tab=maintenance]\'))">设备台账</button><button type="button" onclick="switchTab(\'testDiary\',document.querySelector(\'[data-tab=testDiary]\'))">测试日志</button><button type="button" onclick="switchTab(\'gases\',document.querySelector(\'[data-tab=gases]\'))">资源台账</button></div></div>' +
      '<div class="lab-readiness__metrics">' +
        '<div class="lab-readiness__metric"><span>设备条目</span><strong>'+activeEquipment+'</strong><small>当前本机设备台账</small></div>' +
        '<div class="lab-readiness__metric '+(coverage<100?'lab-readiness__metric--warning':'')+'"><span>校准覆盖</span><strong>'+coverage+'%</strong><small>'+calibrationReady+' / '+activeEquipment+' 有有效记录</small></div>' +
        '<div class="lab-readiness__metric '+(failedTests?'lab-readiness__metric--danger':'')+'"><span>测试故障记录</span><strong>'+failedTests+'</strong><small>按当前日志“error”字段计数</small></div>' +
        '<div class="lab-readiness__metric '+(gasAlerts?'lab-readiness__metric--warning':'')+'"><span>气体异常</span><strong>'+gasAlerts+'</strong><small>需要人工核验的异常条目</small></div>' +
        '<div class="lab-readiness__metric '+(spareAlerts?'lab-readiness__metric--warning':'')+'"><span>备件补充</span><strong>'+spareAlerts+'</strong><small>当前台账标记为需补充</small></div>' +
      '</div>' +
      '<div class="lab-readiness__lower"><section class="lab-readiness__attention"><div class="lab-readiness__section-title"><span>需要优先检查</span><small>来自当前本机台账</small></div>' +
        (failedTests || gasAlerts || spareAlerts ? 
          '<div class="lab-readiness__asset-status"><span class="lab-readiness__pill is-danger">测试故障 '+failedTests+'</span><span class="lab-readiness__pill is-warning">气体异常 '+gasAlerts+'</span><span class="lab-readiness__pill is-warning">备件补充 '+spareAlerts+'</span></div>' :
          '<div class="lab-readiness__empty"><strong>当前没有被数据标记为异常的条目</strong><span>这不是现场安全结论；仍需人工核对设备状态、校准证书和测试原始记录。</span></div>') +
      '</section><section class="lab-readiness__calibration"><span>校准覆盖</span><strong>'+coverage+'%</strong><div class="lab-readiness__coverage"><i style="width:'+coverage+'%"></i></div><small>只统计存在有效校准记录的设备，不推算缺失证书。</small></section></div>';
    host.insertBefore(board, host.firstChild);
  }
  window.addEventListener('load', () => window.setTimeout(mount, 350), { once: true });
})();