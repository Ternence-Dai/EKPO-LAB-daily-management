
        // Escape untrusted local/imported text before inserting it into HTML.
        const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g,
            char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
        // Keep foreign-key joins stable across imported numeric and string IDs.
        function labIdKey(value) {
            if (typeof value === 'string') return value.trim();
            return Number.isSafeInteger(value) ? String(value) : '';
        }
        function sameLabId(a, b) {
            const left = labIdKey(a);
            return left !== '' && left === labIdKey(b);
        }
        // HTML-escape a JSON string literal for safe use as an inline handler argument.
        function labInlineId(value) { return esc(JSON.stringify(String(value))); }
        // ==================== 1. 数据层（兼容升级） ====================
        // Guard browser storage access: a blocked/corrupt cache must not prevent the lab app from opening.
        let DB;
        let storageWarning = false;
        // Never let fallback demo records overwrite an unreadable or malformed user cache.
        let storageRecoveryRequired = false;
        let cachedLabRaw = null;
        // Best-effort stale-tab detection only; localStorage has no atomic compare-and-swap.
        let lastKnownLabStorageValue = null;
        let labStorageConflictDetected = false;
        try {
            cachedLabRaw = localStorage.getItem('lab_management_db_v9');
            lastKnownLabStorageValue = cachedLabRaw;
            DB = cachedLabRaw ? JSON.parse(cachedLabRaw) : createEmptyLabLedger();
            if (!DB || !Array.isArray(DB.gases) || !Array.isArray(DB.maintenance) ||
                !Array.isArray(DB.spareParts) || !Array.isArray(DB.testDiary) ||
                (DB.calibrationLogs !== undefined && !Array.isArray(DB.calibrationLogs)) ||
                (DB.experiments !== undefined && !Array.isArray(DB.experiments))) {
                throw new Error('缓存数据结构不完整');
            }
        } catch (storageError) {
            if (cachedLabRaw) {
                try {
                    const recoveryKey = 'lab_management_db_v9_recovery_' + Date.now();
                    localStorage.setItem(recoveryKey, cachedLabRaw);
                    console.warn('已保留无法识别的实验室缓存恢复副本：' + recoveryKey);
                } catch (backupError) {
                    console.error('实验室缓存恢复副本创建失败。', backupError);
                }
            }
            console.warn('本地缓存不可用或结构异常，已载入内置演示数据。请检查浏览器存储并恢复备份。', storageError);
            DB = createEmptyLabLedger();
            storageWarning = true;
            storageRecoveryRequired = true;
        }
        
        // 兼容旧版本数据升级
        if (!cachedLabRaw) {
            try {
                const initialLedgerValue = JSON.stringify(DB);
                localStorage.setItem('lab_management_db_v9', initialLedgerValue);
                lastKnownLabStorageValue = initialLedgerValue;
            } catch (initializationError) {
                console.warn('新建空台账无法写入浏览器缓存；继续以当前内存账本运行。', initializationError);
            }
        }
        if (!DB.maintLogs) DB.maintLogs = [];
        if (!DB.spareLogs) DB.spareLogs = [];
        // Legacy caches predate the calibration ledger. Add an empty table;
        // never synthesize certificates or calibration results.
        if (!Array.isArray(DB.calibrationLogs)) DB.calibrationLogs = [];
        // Legacy backups predate experiment lifecycle records; migrate to an empty ledger without inventing plans or runs.
        if (!Array.isArray(DB.experiments)) DB.experiments = [];
        // 如果存在旧格式的 gases（没有 year），进行转换
        DB.gases.forEach(g => {
            if (!g.year && g.month) {
                g.year = parseInt(g.month.split('-')[0]);
                g.monthNum = parseInt(g.month.split('-')[1]);
            }
        });

        // Remove only byte-for-byte unchanged built-in demo rows from an old demo-seed ledger.
        // User-edited or user-added rows are retained. The original cache is archived first.
        let demoSeedMigrationNotice = '';
        function migrateUnmodifiedDemoRows() {
            if (storageRecoveryRequired || !cachedLabRaw || !DB || DB.dataProvenance !== 'demo-seed') return;
            const tableKeys = ['gases','maintenance','maintLogs','spareParts','spareLogs','calibrationLogs','experiments','testDiary'];
            const migrated = JSON.parse(JSON.stringify(DB));
            let removed = 0;
            for (const key of tableKeys) {
                const seedRows = new Set((Array.isArray(defaultData[key]) ? defaultData[key] : []).map(row => JSON.stringify(row)));
                migrated[key] = (Array.isArray(migrated[key]) ? migrated[key] : []).filter(row => {
                    const fingerprint = JSON.stringify(row);
                    if (!seedRows.has(fingerprint)) return true;
                    seedRows.delete(fingerprint);
                    removed += 1;
                    return false;
                });
            }
            if (!removed) return;
            const noOperationalRows = tableKeys.every(key => migrated[key].length === 0);
            if (noOperationalRows) migrated.dataProvenance = 'empty-ledger';
            const recoveryKey = 'lab_management_db_v9_demo_archive_' + Date.now();
            try {
                if (localStorage.getItem('lab_management_db_v9') !== cachedLabRaw) {
                    labStorageConflictDetected = true;
                    console.warn('演示样本清理前检测到缓存已变化；保留最新账本，不执行迁移。');
                    return;
                }
                localStorage.setItem(recoveryKey, cachedLabRaw);
                const nextRaw = JSON.stringify(migrated);
                localStorage.setItem('lab_management_db_v9', nextRaw);
                DB = migrated;
                cachedLabRaw = nextRaw;
                lastKnownLabStorageValue = nextRaw;
                demoSeedMigrationNotice = recoveryKey;
                console.info('已清理 ' + removed + ' 条未修改的内置演示记录；原始样本已归档：' + recoveryKey);
            } catch (migrationError) {
                storageWarning = true;
                storageRecoveryRequired = true;
                console.error('演示样本迁移失败；已保留内存中的原账本并锁定写入。', migrationError);
            }
        }
        migrateUnmodifiedDemoRows();

        let fileHandle = null;

        window.addEventListener('storage', event => {
            if (event.key !== 'lab_management_db_v9') return;
            labStorageConflictDetected = true;
            showToast('检测到其他标签页已修改实验室数据。本页已暂停保存，请先导出未保存更改并重新载入最新数据。', 'error');
        });

        async function saveToLocal() {
            if (storageRecoveryRequired) {
                storageWarning = true;
                showToast('检测到原实验室缓存异常，已阻止演示数据覆盖；请先导入有效 JSON 备份。', 'error');
                const status = document.getElementById('saveText');
                if (status) status.innerText = '缓存待恢复 · 自动保存已锁定';
                return false;
            }
            if (labStorageConflictDetected) {
                showToast('实验室数据存在跨标签页冲突，已阻止覆盖最新缓存。请先导出未保存更改，再重新载入。', 'error');
                return false;
            }
            let localSaved = false;
            let fileSaved = false;
            try {
                const currentLabStorageValue = localStorage.getItem('lab_management_db_v9');
                if (currentLabStorageValue !== lastKnownLabStorageValue) {
                    labStorageConflictDetected = true;
                    showToast('实验室缓存已被其他标签页或进程更新，已阻止本次保存。请先导出未保存更改，再重新载入。', 'error');
                    return false;
                }
                const nextLabStorageValue = JSON.stringify(DB);
                localStorage.setItem('lab_management_db_v9', nextLabStorageValue);
                lastKnownLabStorageValue = nextLabStorageValue;
                storageWarning = false;
                localSaved = true;
            } catch (storageError) {
                storageWarning = true;
                storageRecoveryRequired = true;
                console.error('浏览器缓存保存失败；已锁定后续写入，防止内存与持久化副本分叉。', storageError);
                showToast('浏览器缓存不可用，已暂停写入并撤销本次修改；请先导出可用备份或恢复存储。', 'error');
                const status = document.getElementById('saveText');
                if (status) status.innerText = '浏览器缓存保存失败 · 自动保存已锁定';
                return false;
            }
            if (fileHandle) {
                let writable = null;
                try {
                    writable = await fileHandle.createWritable();
                    await writable.write(JSON.stringify(DB, null, 2));
                    await writable.close();
                    writable = null;
                    fileSaved = true;
                    document.getElementById('saveText').innerText = localSaved
                        ? '本地硬盘实时保存中...'
                        : '本地文件已保存 · 浏览器缓存仍失败';
                } catch (err) {
                    if (writable && typeof writable.abort === 'function') {
                        try { await writable.abort(); }
                        catch (abortError) { console.warn('文件自动保存失败后的写入回滚也失败。', abortError); }
                    }
                    console.error(err);
                    document.getElementById('saveText').innerText = '写入本地文件失败';
                }
            } else if (localSaved) {
                document.getElementById('saveText').innerText = '浏览器缓存自动保存中...';
            } else {
                document.getElementById('saveText').innerText = '浏览器缓存保存失败 · 请导出备份';
            }
            return localSaved || fileSaved;
        }

        function snapshotLabDB() {
            return JSON.parse(JSON.stringify(DB));
        }

        async function commitLabMutation(previousDB, failureMessage) {
            let saved = false;
            try { saved = await saveToLocal(); }
            catch (error) { console.error('实验室数据保存失败', error); }
            if (saved) return true;
            DB = previousDB;
            showToast(failureMessage || '数据保存失败，本次修改已撤销；请检查浏览器存储并重试', 'error');
            return false;
        }

        function getToday() {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            return y + '-' + m + '-' + d;
        }
        function showToast(msg, type = 'success') { let t = document.getElementById('toast'); t.className = `toast toast-${type} show`; t.innerText = msg; setTimeout(() => t.classList.remove('show'), 3000); }
        function openModal(id) { document.getElementById(id).style.display = 'flex'; }
        function closeModal(id) { document.getElementById(id).style.display = 'none'; }
        function initChart(domId) {
            let dom = document.getElementById(domId);
            if (!dom) return null;
            // Charts are an enhancement: the laboratory ledgers remain usable if the CDN is unavailable.
            if (typeof echarts === 'undefined') {
                dom.textContent = '图表组件暂不可用，请检查网络连接后刷新页面；台账数据仍可正常使用。';
                dom.setAttribute('role', 'status');
                return null;
            }
            let chart = echarts.getInstanceByDom(dom);
            if (!chart) chart = echarts.init(dom);
            return chart;
        }

        // ==================== 2. 动态年份生成 ====================
        function generateYearOptions(selectId) {
            var yearSelect = document.getElementById(selectId);
            if (!yearSelect) return;
            yearSelect.innerHTML = '';
            for (var year = 2000; year <= new Date().getFullYear() + 30; year++) {
                var option = document.createElement('option');
                option.value = year;
                option.textContent = year + '年';
                yearSelect.appendChild(option);
            }
            yearSelect.value = new Date().getFullYear();
        }
        function generateMonthOptions(selectId) {
            var monthSelect = document.getElementById(selectId);
            if (!monthSelect) return;
            monthSelect.innerHTML = '';
            for (var month = 1; month <= 12; month++) {
                var option = document.createElement('option');
                option.value = month;
                option.textContent = month + '月';
                monthSelect.appendChild(option);
            }
            monthSelect.value = new Date().getMonth() + 1;
        }

        // ==================== 3. 页面导航与子选项卡 ====================
        function switchTab(tabId, element) {
            document.querySelectorAll('.content-body > section').forEach(el => el.classList.add('hidden'));
            document.getElementById(`page-${tabId}`).classList.remove('hidden');
            document.querySelectorAll('.nav-item').forEach(el => {
                const active = el.dataset.tab === tabId;
                el.classList.toggle('active', active);
            });
            document.querySelectorAll('.mobile-nav button').forEach(el => {
                const active = el.dataset.tab === tabId;
                el.classList.toggle('active', active);
                if (active) el.setAttribute('aria-current', 'page');
                else el.removeAttribute('aria-current');
            });

            const titles = { dashboard: "总览仪表盘", gases: "气体使用记录", maintenance: "设备维保管理", spareParts: "备件库存管理", testDiary: "测试台运行日志", experiments: "实验计划与生命周期", yearly: "年度综合统计", system: "系统全量设置" };
            document.getElementById('pageTitle').innerText = titles[tabId];
            
            setTimeout(() => {
                if (tabId === 'dashboard') renderDashboard();
                if (tabId === 'gases') { generateYearOptions('g-year'); generateMonthOptions('g-month'); renderYearFilter(); renderGases(); }
                if (tabId === 'maintenance') { generateYearOptions('ml-year'); renderMaintenance(); }
                if (tabId === 'spareParts') { renderSpareParts(); }
                if (tabId === 'testDiary') renderTestDiary();
                if (tabId === 'experiments') renderExperiments();
                if (tabId === 'experiments') bindExperimentActions();
                if (tabId === 'yearly') { renderYearlyFilter(); renderYearly(); }
                if (tabId === 'system') renderSystem();
            }, 50);
        }

        function switchSubTab(parent, sub) {
            if (parent === 'maint') {
                document.getElementById('maint-eq-view').classList.add('hidden');
                document.getElementById('maint-log-view').classList.add('hidden');
                document.getElementById('maint-calibration-view').classList.add('hidden');
                document.getElementById('tab-maint-eq').classList.remove('active');
                document.getElementById('tab-maint-log').classList.remove('active');
                document.getElementById('tab-maint-calibration').classList.remove('active');
                if (sub === 'eq') { document.getElementById('maint-eq-view').classList.remove('hidden'); document.getElementById('tab-maint-eq').classList.add('active'); renderMaintenance(); }
                if (sub === 'log') { document.getElementById('maint-log-view').classList.remove('hidden'); document.getElementById('tab-maint-log').classList.add('active'); renderMaintLogs(); }
                if (sub === 'calibration') { document.getElementById('maint-calibration-view').classList.remove('hidden'); document.getElementById('tab-maint-calibration').classList.add('active'); renderCalibrationLogs(); }
            }
            if (parent === 'spare') {
                document.getElementById('spare-eq-view').classList.add('hidden');
                document.getElementById('spare-log-view').classList.add('hidden');
                document.getElementById('tab-spare-eq').classList.remove('active');
                document.getElementById('tab-spare-log').classList.remove('active');
                if (sub === 'eq') { document.getElementById('spare-eq-view').classList.remove('hidden'); document.getElementById('tab-spare-eq').classList.add('active'); renderSpareParts(); }
                if (sub === 'log') { document.getElementById('spare-log-view').classList.remove('hidden'); document.getElementById('tab-spare-log').classList.add('active'); renderSpareLogs(); }
            }
        }

        // ==================== 4. 本地实时保存 ====================
        async function enableLocalRealTimeSave() {
            if (storageRecoveryRequired) {
                showToast('原缓存尚未恢复，已阻止将演示数据写入新文件；请先导入有效备份。', 'error');
                return;
            }
            if (!window.showSaveFilePicker) { showToast('请使用Edge或Chrome浏览器', 'error'); return; }
            try {
                // Do not advertise or retain a live file handle until the initial
                // snapshot has been written and closed successfully.
                const candidateHandle = await window.showSaveFilePicker({
                    suggestedName: `燃料电池实验室数据_${getToday()}.json`,
                    types: [{ description: 'JSON 数据文件', accept: { 'application/json': ['.json'] } }],
                });
                if (!candidateHandle || typeof candidateHandle.createWritable !== 'function') {
                    throw new Error('未获得有效的本地文件写入句柄');
                }
                const writable = await candidateHandle.createWritable();
                try {
                    await writable.write(JSON.stringify(DB, null, 2));
                    await writable.close();
                } catch (writeError) {
                    if (writable && typeof writable.abort === 'function') {
                        try { await writable.abort(); }
                        catch (abortError) { console.warn('初始文件写入失败后的临时文件回滚也失败。', abortError); }
                    }
                    throw writeError;
                }
                fileHandle = candidateHandle;
                document.getElementById('saveDot').classList.add('active');
                document.getElementById('saveText').innerText = '本地硬盘实时保存已开启！';
                showToast('本地实时保存已开启！');
            } catch (err) {
                if (err.name !== 'AbortError') showToast('开启失败: ' + err.message, 'error');
            }
        }

        // ==================== 5. 仪表盘渲染 ====================
        function renderDashboard() {
            const provenance = DB.dataProvenance || DB.settings?.dataProvenance || 'unknown';
            const provenanceNote = document.querySelector('#labos-data-note [data-provenance-note]');
            let totalGasCost = DB.gases.reduce((sum, g) => sum + (Number(g.cost) || 0) + (Number(g.rent) || 0) + (Number(g.freight) || 0), 0);
            let totalMaintCost = DB.maintLogs.reduce((sum, m) => sum + (Number(m.cost) || 0), 0);
            let totalSpareCost = DB.spareParts.reduce((sum, s) => sum + ((Number(s.qty) || 0) * (Number(s.price) || 0)), 0);
            let testErrors = DB.testDiary.filter(t => t.error && t.error.trim() !== '').length;
            const hasGasRecords = DB.gases.length > 0;
            const hasMaintenanceRecords = DB.maintLogs.length > 0;
            const hasSpareRecords = DB.spareParts.length > 0;
            const hasTestRecords = DB.testDiary.length > 0;
            const emptyLedger = !storageRecoveryRequired && !labStorageConflictDetected &&
                !hasGasRecords && DB.maintenance.length === 0 && !hasMaintenanceRecords &&
                !hasSpareRecords && DB.calibrationLogs.length === 0 && DB.experiments.length === 0 && !hasTestRecords;

            if (provenanceNote) {
                provenanceNote.textContent = provenance === 'demo-seed'
                    ? '当前显示程序内置演示样本，不代表现场台账。气体费用、设备、备件和测试记录不可用于采购、财务结算或安全判断。'
                    : emptyLedger && provenance === 'empty-ledger'
                        ? '当前为新建空台账。尚未导入现场气体批次、设备资产、备件、校准或测试记录；所有费用与趋势保持空白，不会用虚构数字填充。'
                        : provenance === 'unknown'
                            ? '当前账本来源未标记。请核对导入来源、责任人和更新时间；未经核验的数据不视为真实现场记录。'
                            : '当前显示本机账本记录（来源标记：' + String(provenance) + '）。请核对原始凭证、更新时间和记录责任人；本应用不会把本机数据冒充外部实时数据。';
            }

            document.getElementById('dash-gas').innerText = hasGasRecords ? '¥' + totalGasCost.toLocaleString() : '—';
            document.getElementById('dash-maint-cost').innerText = hasMaintenanceRecords ? '¥' + totalMaintCost.toLocaleString() : '—';
            document.getElementById('dash-spare-cost').innerText = hasSpareRecords ? '¥' + totalSpareCost.toLocaleString() : '—';
            document.getElementById('dash-test').innerText = hasTestRecords ? testErrors + ' 次' : '—';

            const dashboard = document.getElementById('page-dashboard');
            let firstRun = document.getElementById('labos-first-run');
            if (emptyLedger) {
                if (!firstRun) {
                    firstRun = document.createElement('section');
                    firstRun.id = 'labos-first-run';
                    firstRun.className = 'labos-first-run';
                    firstRun.setAttribute('aria-label', '新建实验室台账');
                    const metrics = dashboard.querySelector('.metrics-grid');
                    if (metrics) metrics.insertAdjacentElement('beforebegin', firstRun);
                    else dashboard.appendChild(firstRun);
                }
                firstRun.innerHTML = '<div><span class="eyebrow">NEW LAB / VERIFIED RECORDS ONLY</span><h3>建立第一份现场台账</h3>' +
                    '<p>当前没有已导入记录。请从现场原始凭证、设备铭牌、校准证书与测试日志开始登记；未填写的费用、批次和设备不会被虚构。</p></div>' +
                    '<div class="labos-first-run__actions">' +
                    '<button type="button" onclick="switchTab(\'gases\')">登记气体批次</button>' +
                    '<button type="button" onclick="switchTab(\'maintenance\')">登记设备与校准</button>' +
                    '<button type="button" onclick="switchTab(\'testDiary\')">录入测试日志</button></div>';
            } else if (firstRun) {
                firstRun.remove();
            }
            const lifecycleCounts = {
                gases: Array.isArray(DB.gases) ? DB.gases.length : 0,
                maintenance: Array.isArray(DB.maintenance) ? DB.maintenance.length : 0,
                experiments: Array.isArray(DB.experiments) ? DB.experiments.length : 0,
                testDiary: Array.isArray(DB.testDiary) ? DB.testDiary.length : 0
            };
            document.querySelectorAll('[data-labos-count]').forEach(node => {
                const key = node.dataset.labosCount;
                node.textContent = Object.prototype.hasOwnProperty.call(lifecycleCounts,key) ? lifecycleCounts[key] : '—';
            });

            let treemapChart = initChart('chart-dash-treemap');
            if(treemapChart) {
                treemapChart.setOption({
                    tooltip: { formatter: '{b}: ¥{c}' },
                    series: [{
                        type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false },
                        data: [
                            { name: '气体费用', value: totalGasCost },
                            { name: '维保费用', value: totalMaintCost }
                        ],
                        label: { formatter: '{b}\n¥{c}' },
                        itemStyle: { borderColor: '#fff' }
                    }]
                });
            }

            let gasChart = initChart('chart-dash-gas');
            if(gasChart) {
                let sortedGases = [...DB.gases].sort((a,b) => (a.month||'').localeCompare(b.month||''));
                let months = [...new Set(sortedGases.map(g => g.month))];
                let hydrogenData = months.map(m => { let found = sortedGases.find(g => g.item === 'Hydrogen' && g.month === m); return found ? found.consumption : 0; });
                let nitrogenData = months.map(m => { let found = sortedGases.find(g => g.item === 'Nitrogen' && g.month === m); return found ? found.consumption : 0; });
                gasChart.setOption({
                    tooltip: { trigger: 'axis' }, legend: { data: ['氢气', '氮气'] },
                    xAxis: { type: 'category', data: months },
                    yAxis: { type: 'value', name: '余量 (m³)' },
                    series: [
                        { name: '氢气', type: 'line', data: hydrogenData, smooth: true, itemStyle: { color: '#3b82f6' } },
                        { name: '氮气', type: 'line', data: nitrogenData, smooth: true, itemStyle: { color: '#10b981' } }
                    ]
                });
            }
            
            let alerts = [];
            let maintAlerts = DB.maintenance.filter(m => isOverdueDateOnly(m.next)).length;
            let spareAlerts = DB.spareParts.filter(s => s.replenish === 'Y').length;
            if (maintAlerts > 0) alerts.push(`⚙️ 有 ${maintAlerts} 项设备维保已逾期！`);
            if (spareAlerts > 0) alerts.push(`📦 有 ${spareAlerts} 项备件需要补货！`);
            if (testErrors > 0) alerts.push(`📅 测试台运行日志中存在 ${testErrors} 次故障记录`);
            let alertList = document.getElementById('alert-list');
            alertList.innerHTML = emptyLedger
                ? '<li>当前尚无导入的现场业务记录，待处理事项暂不可判定。</li>'
                : alerts.length === 0 ? '<li>✅ 当前账本中未发现已登记的待处理事项</li>' : alerts.map(a => `<li>${esc(a)}</li>`).join('');
            renderLabReadiness().catch(error => {
                console.error('实验室设备与实验就绪度汇总失败。', error);
                const panel = document.getElementById('lab-readiness');
                if (panel) {
                    panel.dataset.loaded = 'false';
                    panel.setAttribute('aria-busy', 'false');
                    panel.innerHTML = '<div class="lab-readiness__unavailable"><strong>设备与实验就绪度暂不可用</strong><span>未能核验设备或校准状态。本面板不会推断设备正常；请刷新页面或进入设备维保模块检查。</span></div>';
                }
            });
        }

        async function renderLabReadiness() {
            const page = document.getElementById('page-dashboard');
            if (!page) return;
            let panel = document.getElementById('lab-readiness');
            if (!panel) {
                panel = document.createElement('section');
                panel.id = 'lab-readiness';
                panel.className = 'lab-readiness';
                panel.setAttribute('aria-label', '设备与实验就绪度');
                const firstOperationalMetric = page.querySelector('.metrics-grid') || page.querySelector('.charts-row');
                if (firstOperationalMetric) page.insertBefore(panel, firstOperationalMetric);
                else page.appendChild(panel);
            }
            panel.setAttribute('aria-busy', 'true');
            panel.dataset.loaded = 'false';

            const domain = await import('../../src/domain/index.js?v=20261019-ekpo-readiness-v2');
            if (page.classList.contains('hidden')) return;

            const now = new Date();
            const assets = Array.isArray(DB.maintenance) ? DB.maintenance : [];
            const calibrationRecords = Array.isArray(DB.calibrationLogs) ? DB.calibrationLogs : [];
            const experiments = Array.isArray(DB.experiments) ? DB.experiments : [];
            const readinessRows = assets.map(asset => {
                let schedule;
                let readiness;
                try {
                    schedule = domain.getMaintenanceScheduleStatus(asset.next || '', now, 30);
                } catch (error) {
                    schedule = { status: 'invalid', daysUntil: null, nextDate: '' };
                    console.warn('设备维保日期需要核对：' + (asset.name || asset.id), error);
                }
                try {
                    readiness = domain.getExperimentEquipmentReadiness({
                        assetId: asset.id,
                        equipment: assets,
                        calibrationRecords,
                        at: now
                    });
                } catch (error) {
                    readiness = {
                        ready: false,
                        status: 'invalid',
                        label: '校准状态待核验',
                        message: '设备或校准记录存在格式问题'
                    };
                    console.warn('设备校准状态需要核对：' + (asset.name || asset.id), error);
                }
                return { asset, schedule, readiness };
            });

            const overdue = readinessRows.filter(row => row.schedule.status === 'overdue').length;
            const dueSoon = readinessRows.filter(row => row.schedule.status === 'due-soon').length;
            const calibrationBlocked = readinessRows.filter(row => !row.readiness.ready).length;
            const calibrated = readinessRows.filter(row => row.readiness.ready).length;
            const activeExperiments = experiments.filter(row => row.status === 'in-progress').length;
            const plannedExperiments = experiments.filter(row => row.status === 'planned').length;
            const priority = { overdue: 0, invalid: 1, 'due-soon': 2, unscheduled: 3, scheduled: 4 };
            const attention = readinessRows.filter(row =>
                row.schedule.status !== 'scheduled' || !row.readiness.ready
            ).sort((a, b) =>
                (priority[a.schedule.status] ?? 5) - (priority[b.schedule.status] ?? 5)
            ).slice(0, 6);

            const metrics = [
                { key: 'equipment', label: '在册设备', value: assets.length, note: '来自设备主台账', tone: 'neutral' },
                { key: 'overdue', label: '维保已逾期', value: overdue, note: '需要安排维护', tone: overdue ? 'danger' : 'neutral' },
                { key: 'due-soon', label: '30 天内维保到期', value: dueSoon, note: '提前安排窗口', tone: dueSoon ? 'warning' : 'neutral' },
                { key: 'calibration', label: '校准未就绪', value: calibrationBlocked, note: '未记录 / 过期 / 不合格 / 待核验', tone: calibrationBlocked ? 'warning' : 'neutral' },
                { key: 'active-experiments', label: '进行中实验', value: activeExperiments, note: plannedExperiments + ' 项计划待执行', tone: 'neutral' }
            ];
            const metricHtml = metrics.map(metric =>
                '<article class="lab-readiness__metric lab-readiness__metric--' + metric.tone +
                    '" data-readiness-metric="' + metric.key + '" data-value="' + metric.value + '">' +
                    '<span>' + esc(metric.label) + '</span><strong>' + metric.value + '</strong>' +
                    '<small>' + esc(metric.note) + '</small></article>'
            ).join('');

            const scheduleLabel = row => {
                if (row.schedule.status === 'overdue') return '维保逾期 ' + Math.abs(row.schedule.daysUntil) + ' 天';
                if (row.schedule.status === 'due-soon') return '维保 ' + row.schedule.daysUntil + ' 天后到期';
                if (row.schedule.status === 'unscheduled') return '维保日期未设置';
                if (row.schedule.status === 'invalid') return '维保日期异常';
                return '维保计划正常';
            };
            const rowsHtml = attention.length ? attention.map(row =>
                '<article class="lab-readiness__asset">' +
                    '<div class="lab-readiness__asset-main"><strong>' + esc(row.asset.name || '未命名设备') +
                    '</strong><small>' + esc(row.asset.category || '未分类') + ' · ' +
                    esc(row.asset.location || '位置未填写') + '</small></div>' +
                    '<div class="lab-readiness__asset-status">' +
                    '<span class="lab-readiness__pill ' +
                    (row.schedule.status === 'overdue' || row.schedule.status === 'invalid' ? 'is-danger' :
                     row.schedule.status === 'scheduled' ? 'is-ok' : 'is-warning') + '">' +
                    esc(scheduleLabel(row)) + '</span>' +
                    '<span class="lab-readiness__pill ' + (row.readiness.ready ? 'is-ok' : 'is-warning') + '">' +
                    esc(row.readiness.label) + '</span></div></article>'
            ).join('') : assets.length === 0
                ? '<div class="lab-readiness__empty is-unverified"><strong>尚未导入设备台账，当前无法判断设备或校准是否就绪</strong>' +
                  '<span>先登记带资产编号的现场设备，并录入有效校准证书；无记录不代表设备正常。</span></div>'
                : '<div class="lab-readiness__empty"><strong>当前设备台账中未发现已登记的逾期维保或校准阻断</strong>' +
                  '<span>仍须以现场设备状态和有效证书复核；未设置维护日期不会被视为已完成。</span></div>';

            panel.innerHTML =
                '<div class="lab-readiness__head"><div><span class="eyebrow">ASSET & EXPERIMENT READINESS</span>' +
                '<h3>设备与实验就绪度</h3><p>从在册设备、维护计划和校准记录计算实验室准备状态；缺少证据时明确显示待核验。</p></div>' +
                '<div class="lab-readiness__actions"><button type="button" onclick="switchTab(\'maintenance\', document.querySelector(\'.sidebar .nav-item[data-tab=maintenance]\'))">设备 / 校准台账 ↗</button>' +
                '<button type="button" onclick="switchTab(\'experiments\', document.querySelector(\'.sidebar .nav-item[data-tab=experiments]\'))">实验计划 ↗</button></div></div>' +
                '<div class="lab-readiness__metrics">' + metricHtml + '</div>' +
                '<div class="lab-readiness__lower"><div class="lab-readiness__attention"><div class="lab-readiness__section-title">需要关注的设备 <small>最多显示 6 项 · 完整记录见设备台账</small></div>' +
                rowsHtml + '</div><aside class="lab-readiness__calibration"><span>校准覆盖</span><strong>' + calibrated + ' / ' + assets.length + '</strong>' +
                '<small>' + (assets.length ? '有效校准设备 / 在册设备' : '尚无在册设备 · 覆盖率无法计算') + '</small><div class="lab-readiness__coverage"><i style="width:' +
                (assets.length ? (calibrated / assets.length * 100).toFixed(1) : 0) + '%"></i></div>' +
                '<p>' + (assets.length ? calibrationBlocked + ' 台设备当前无法确认校准有效；未记录不等于合格。' : '请先导入设备与证书记录；当前不作设备已校准或已就绪的判断。') + '</p></aside></div>';
            panel.dataset.loaded = 'true';
            panel.dataset.equipmentCount = String(assets.length);
            panel.dataset.activeExperimentCount = String(activeExperiments);
            panel.setAttribute('aria-busy', 'false');
        }

        // ==================== 6. 气体记录 ====================
        function renderYearFilter() {
            let select = document.getElementById('filter-gas-year');
            if (select.options.length <= 1) {
                let years = [...new Set(DB.gases.map(g => g.year || new Date(g.month).getFullYear()))].sort((a,b) => b - a);
                years.forEach(y => {
                    let opt = document.createElement('option'); opt.value = y; opt.innerText = y + '年'; select.appendChild(opt);
                });
            }
        }

        function renderGases() {
            let filterYear = document.getElementById('filter-gas-year').value;
            let search = document.getElementById('search-gas').value.toLowerCase();
            let tbody = document.querySelector('#table-gases tbody'); tbody.innerHTML = '';
            
            let filtered = DB.gases.filter(g => {
                let matchSearch = (g.item||'').toLowerCase().includes(search) || (g.month||'').toLowerCase().includes(search);
                let matchYear = filterYear === 'all' || (g.year == filterYear);
                return matchSearch && matchYear;
            });

            filtered.forEach(g => {
                let total = (Number(g.cost) || 0) + (Number(g.rent) || 0) + (Number(g.freight) || 0);
                tbody.innerHTML += `<tr>
                    <td>${esc(g.year || '-')}</td><td>${esc(g.monthNum || '-')}月</td><td><strong>${esc(g.item||'')}</strong></td><td>${esc(g.spec||'-')}</td><td>${esc(g.supplier||'-')}</td>
                    <td>${g.delivery||0}</td><td>${g.return||0}</td><td>${g.consumption||0}</td>
                    <td>${g.cost ? '¥'+g.cost.toLocaleString() : '-'}</td><td>${g.rent ? '¥'+g.rent.toLocaleString() : '-'}</td><td>${g.freight ? '¥'+g.freight.toLocaleString() : '-'}</td>
                    <td><strong>¥${total.toLocaleString()}</strong></td>
                    <td><button class="btn btn-outline btn-sm" onclick="editGas(${Number(g.id)})">编辑</button><button class="btn btn-danger btn-sm" onclick="deleteItem('gases', ${Number(g.id)})">删除</button></td>
                </tr>`;
            });

            let treemapChart = initChart('chart-gas-treemap');
            if(treemapChart) {
                let gasCosts = {};
                filtered.forEach(g => {
                    let total = (Number(g.cost) || 0) + (Number(g.rent) || 0) + (Number(g.freight) || 0);
                    gasCosts[g.item] = (gasCosts[g.item] || 0) + total;
                });
                treemapChart.setOption({
                    tooltip: { formatter: '{b}: ¥{c}' },
                    series: [{ type: 'treemap', data: Object.keys(gasCosts).map(k => ({ name: k, value: gasCosts[k] || 1 })) }]
                });
            }
            
            let timeChart = initChart('chart-gas-timeline');
            if(timeChart && filtered.length > 0) {
                let sorted = [...filtered].sort((a,b) => (a.month||'').localeCompare(b.month||''));
                timeChart.setOption({
                    tooltip: { trigger: 'axis' }, legend: { data: ['当前余量', '总费用'] },
                    xAxis: { type: 'category', data: sorted.map(g => g.month) },
                    yAxis: [{ type: 'value', name: '余量 (m³)' }, { type: 'value', name: '费用 (¥)' }],
                    series: [
                        { name: '当前余量', type: 'bar', data: sorted.map(g => g.consumption), itemStyle: { color: '#3b82f6' } },
                        { name: '总费用', type: 'line', yAxisIndex: 1, data: sorted.map(g => (g.cost||0)+(g.rent||0)+(g.freight||0)), itemStyle: { color: '#ef4444' } }
                    ]
                });
            }
        }
        function editGas(id) { let g = DB.gases.find(x => x.id === id); document.getElementById('g-id').value=g.id; document.getElementById('g-item').value=g.item||'Hydrogen'; document.getElementById('g-spec').value=g.spec||''; document.getElementById('g-supplier').value=g.supplier||''; document.getElementById('g-batch').value=g.batch||''; document.getElementById('g-year').value=g.year||new Date().getFullYear(); document.getElementById('g-month').value=g.monthNum||(new Date().getMonth()+1); document.getElementById('g-delivery').value=g.delivery||0; document.getElementById('g-return').value=g.return||0; document.getElementById('g-consumption').value=g.consumption||0; document.getElementById('g-cost').value=g.cost||0; document.getElementById('g-rent').value=g.rent||0; document.getElementById('g-freight').value=g.freight||0; openModal('modal-gas'); }
        async function saveGas() {
            const id = document.getElementById('g-id').value;
            const year = Number(document.getElementById('g-year').value);
            const monthNum = Number(document.getElementById('g-month').value);
            const item = document.getElementById('g-item').value.trim();
            if (!item) { showToast('请填写气体名称', 'error'); return; }
            if (!Number.isInteger(year) || year < 1900 || year > 2200 || !Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
                showToast('年份或月份无效', 'error'); return;
            }
            const values = {};
            for (const key of ['delivery','return','consumption','cost','rent','freight']) {
                const raw = document.getElementById('g-' + key).value;
                const value = raw === '' ? 0 : Number(raw);
                if (!Number.isFinite(value) || value < 0) { showToast('气体数量和费用不能为负数或非数字', 'error'); return; }
                values[key] = value;
            }
            const data = { item, spec:document.getElementById('g-spec').value, supplier:document.getElementById('g-supplier').value,
                batch:document.getElementById('g-batch').value, year, monthNum,
                month:year + '-' + String(monthNum).padStart(2, '0'), ...values };
            const previousDB = snapshotLabDB();
            if (id) {
                const i = DB.gases.findIndex(x => String(x.id) === String(id));
                if (i < 0) { showToast('原气体记录已不存在，请刷新后重试', 'error'); return; }
                DB.gases[i] = { ...DB.gases[i], ...data };
            } else {
                data.id = Date.now();
                if (DB.gases.some(x => String(x.id) === String(data.id))) {
                    showToast('记录编号冲突，请重试保存', 'error'); return;
                }
                DB.gases.push(data);
            }
            if (!await commitLabMutation(previousDB, '气体记录保存失败，本次修改已撤销')) return;
            closeModal('modal-gas');
            renderGases();
        }

        function isValidDateOnly(value) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
            const [year, month, day] = value.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
        }
        function isOverdueDateOnly(value, today = getToday()) {
            return isValidDateOnly(value) && value < today;
        }
        function maintenanceIntervalMonths(freq) {
            const value = String(freq || '').trim();
            if (/季度/.test(value)) return 3;
            if (/半年/.test(value)) return 6;
            const yearMatch = value.match(/(\d+)\s*年/);
            if (yearMatch) return Number(yearMatch[1]) > 0 ? Number(yearMatch[1]) * 12 : null;
            if (/年度|每年|年/.test(value)) return 12;
            if (/月度|每月/.test(value)) return 1;
            const monthMatch = value.match(/(\d+)\s*个?月/);
            return monthMatch && Number(monthMatch[1]) > 0 ? Number(monthMatch[1]) : null;
        }
        function addCalendarMonths(dateValue, months) {
            if (!isValidDateOnly(dateValue) || !Number.isInteger(months) || months < 1) return '';
            const [year, month, day] = dateValue.split('-').map(Number);
            const first = new Date(year, month - 1 + months, 1);
            const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
            const result = new Date(first.getFullYear(), first.getMonth(), Math.min(day, lastDay));
            return result.getFullYear() + '-' +
                String(result.getMonth() + 1).padStart(2, '0') + '-' +
                String(result.getDate()).padStart(2, '0');
        }
        function syncMaintenanceSchedule(eqId) {
            const eq = DB.maintenance.find(item => sameLabId(item.id, eqId));
            if (!eq) return false;
            const logs = DB.maintLogs.filter(log => sameLabId(log.eqId, eqId) && isValidDateOnly(log.date));
            if (!logs.length) return false;
            logs.sort((a, b) => a.date.localeCompare(b.date));
            const latest = logs[logs.length - 1];
            eq.last = latest.date;
            const months = maintenanceIntervalMonths(eq.freq);
            // Unknown/custom frequencies must be scheduled manually; never assume annual.
            eq.next = months ? addCalendarMonths(latest.date, months) : '';
            return true;
        }

        async function renderMaintenance() {
            let search = document.getElementById('search-maint').value.toLowerCase();
            let tbody = document.querySelector('#table-maintenance tbody'); tbody.innerHTML = '';
            let filtered = DB.maintenance.filter(m => (m.name||'').toLowerCase().includes(search) || (m.category||'').toLowerCase().includes(search));
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            let calibrationDomain = null;
            try {
                calibrationDomain = await import('../../src/domain/index.js?v=20261019-ekpo-readiness-v2');
            } catch (error) {
                console.error('设备校准状态模块不可用。', error);
            }
            const latestCalibrationByAsset = new Map();
            (DB.calibrationLogs || []).forEach(record => {
                const key = String(record.assetId).trim();
                const current = latestCalibrationByAsset.get(key);
                if (!current || String(record.calibratedAt) > String(current.calibratedAt)) {
                    latestCalibrationByAsset.set(key, record);
                }
            });
            filtered.forEach(m => {
                let totalCost = DB.maintLogs.filter(l => sameLabId(l.eqId, m.id)).reduce((sum, l) => sum + (Number(l.cost) || 0), 0);
                let schedule = null;
                if (calibrationDomain && typeof calibrationDomain.getMaintenanceScheduleStatus === 'function') {
                    try {
                        schedule = calibrationDomain.getMaintenanceScheduleStatus(m.next || '', new Date(), 30);
                    } catch (error) {
                        schedule = { status: 'invalid', daysUntil: null };
                        console.warn('设备保养日期无效：' + (m.name || m.id), error);
                    }
                }
                const days = schedule ? schedule.daysUntil : null;
                const scheduleBadge = {
                    unscheduled: '<span class="badge badge-normal">未设置日期</span>',
                    overdue: '<span class="badge badge-danger">已逾期</span>',
                    'due-soon': '<span class="badge badge-warning">即将到期</span>',
                    scheduled: '<span class="badge badge-success">正常</span>',
                    invalid: '<span class="badge badge-danger">日期异常</span>'
                };
                const badge = schedule ? (scheduleBadge[schedule.status] || scheduleBadge.invalid)
                    : '<span class="badge badge-normal">规则不可用</span>';
                const calibration = latestCalibrationByAsset.get(String(m.id).trim());
                let calibrationLabel = '规则不可用';
                let calibrationBadge = 'badge-normal';
                if (calibrationDomain) {
                    if (!calibration) {
                        calibrationLabel = '未记录';
                        calibrationBadge = 'badge-warning';
                    } else if (calibration.result === 'fail') {
                        calibrationLabel = '校准不合格';
                        calibrationBadge = 'badge-danger';
                    } else if (calibrationDomain.isCalibrationCurrent(calibration)) {
                        calibrationLabel = '有效';
                        calibrationBadge = 'badge-success';
                    } else {
                        calibrationLabel = '已过期';
                        calibrationBadge = 'badge-warning';
                    }
                }
                const calibrationBadgeHtml = `<span class="badge ${calibrationBadge}">${calibrationLabel}</span>`;
                tbody.innerHTML += `<tr>
                    <td><strong>${esc(m.name||'')}</strong></td><td>${esc(m.category||'')}</td><td>${esc(m.location||'')}</td><td>${esc(m.qty||0)}</td><td>${esc(m.cycle||'')}</td><td>${esc(m.freq||'')}</td>
                    <td>${esc(m.last || '-')}</td><td>${esc(m.next || '-')} ${badge}</td><td>${calibrationBadgeHtml}</td><td><strong>¥${totalCost.toLocaleString()}</strong></td><td>${esc(m.responsible||'')}</td>
                    <td><button class="btn btn-outline btn-sm" onclick="editMaint(${labInlineId(m.id)})">编辑</button><button class="btn btn-danger btn-sm" onclick="deleteItem('maintenance', ${labInlineId(m.id)})">删除</button></td>
                </tr>`;
            });

            let treemapChart = initChart('chart-maint-treemap');
            if(treemapChart) {
                let deviceCosts = {};
                DB.maintenance.forEach(m => {
                    let total = DB.maintLogs.filter(l => l.eqId === m.id).reduce((sum, l) => sum + (Number(l.cost) || 0), 0);
                    if (total > 0) deviceCosts[m.name] = total;
                });
                treemapChart.setOption({
                    tooltip: { formatter: '{b}: ¥{c}' },
                    series: [{ type: 'treemap', data: Object.keys(deviceCosts).map(k => ({ name: k, value: deviceCosts[k] })) }]
                });
            }

            let timelineChart = initChart('chart-maint-timeline');
            if(timelineChart && filtered.length > 0) {
                let data = filtered.map((m, index) => {
                    const last = m.last ? new Date(m.last + 'T00:00:00').getTime() : NaN;
                    const next = m.next ? new Date(m.next + 'T00:00:00').getTime() : NaN;
                    if (!Number.isFinite(last) || !Number.isFinite(next) || next < last) return null;
                    // ECharts custom renderItem expects [categoryIndex, start, end].
                    return { name: m.name, value: [index, last, next], itemStyle: { color: '#3b82f6' } };
                }).filter(Boolean);
                if (!data.length) { timelineChart.clear(); return; }
                timelineChart.setOption({
                    tooltip: { formatter: p => `${p.name}<br/>上次: ${new Date(p.value[0]).toLocaleDateString()}<br/>下次: ${new Date(p.value[1]).toLocaleDateString()}` },
                    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                    xAxis: { type: 'time', boundaryGap: false, axisLabel: { formatter: '{yyyy}-{MM}-{dd}', rotate: 45 }, minInterval: 3600 * 24 * 1000 },
                    yAxis: { type: 'category', data: filtered.map(m => m.name) },
                    series: [{ type: 'custom', renderItem: function (params, api) {
                        var catIdx = api.value(0); var start = api.coord([api.value(1), catIdx]); var end = api.coord([api.value(2), catIdx]);
                        var h = api.size([0, 1])[1] * 0.6; var rect = echarts.graphic.clipRectByRect({ x: start[0], y: start[1] - h / 2, width: end[0] - start[0], height: h }, { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height });
                        return rect && { type: 'rect', transition: ['shape'], shape: rect, style: api.style() };
                    }, data: data }]
                });
            }
        }

        function renderMaintLogs() {
            let tbody = document.querySelector('#table-maint-logs tbody'); tbody.innerHTML = '';
            DB.maintLogs.sort((a,b) => (b.date||'').localeCompare(a.date||'')).forEach(l => {
                let eq = DB.maintenance.find(m => sameLabId(m.id, l.eqId));
                tbody.innerHTML += `<tr>
                    <td>${esc(l.date)}</td><td><strong>${esc(eq ? eq.name : '未知设备')}</strong></td><td>${esc(l.checker||'')}</td><td>${esc(l.operator||'')}</td><td>¥${(l.cost||0).toLocaleString()}</td><td>${esc(l.record||'')}</td>
                    <td><button class="btn btn-outline btn-sm" onclick="editMaintLog(${labInlineId(l.id)})">编辑</button><button class="btn btn-danger btn-sm" onclick="deleteItem('maintLogs', ${labInlineId(l.id)})">删除</button></td>
                </tr>`;
            });
        }

        function editMaint(id) { let m = DB.maintenance.find(x => sameLabId(x.id, id)); if(!m){showToast('设备记录不存在或已被删除，请刷新后重试','error');return;} document.getElementById('m-id').value=m.id; document.getElementById('m-name').value=m.name||''; document.getElementById('m-category').value=m.category||''; document.getElementById('m-location').value=m.location||''; document.getElementById('m-qty').value=m.qty||0; document.getElementById('m-cycle').value=m.cycle||'一级保养'; document.getElementById('m-freq').value=m.freq||''; document.getElementById('m-last').value=m.last||''; document.getElementById('m-next').value=m.next||''; document.getElementById('m-responsible').value=m.responsible||''; document.getElementById('m-record').value=m.record||''; openModal('modal-maint'); }
        async function saveMaint() {
            const id = document.getElementById('m-id').value;
            const data = {
                name: document.getElementById('m-name').value,
                category: document.getElementById('m-category').value,
                location: document.getElementById('m-location').value,
                qty: Number(document.getElementById('m-qty').value),
                cycle: document.getElementById('m-cycle').value,
                freq: document.getElementById('m-freq').value,
                last: document.getElementById('m-last').value,
                next: document.getElementById('m-next').value,
                responsible: document.getElementById('m-responsible').value,
                record: document.getElementById('m-record').value
            };
            let validated;
            try {
                const domain = await import('../../src/domain/index.js?v=20261019-ekpo-readiness-v2');
                validated = domain.validateMaintenanceAsset(data);
            } catch (error) {
                showToast('设备台账未保存：' + (error && error.message ? error.message : '字段校验失败'), 'error');
                return;
            }

            let existingIndex = -1;
            let previous = null;
            let newRecordId = null;
            if (id) {
                existingIndex = DB.maintenance.findIndex(item => sameLabId(item.id, id));
                if (existingIndex < 0) {
                    showToast('原设备记录已不存在，请刷新后重试', 'error');
                    return;
                }
                previous = DB.maintenance[existingIndex];
                DB.maintenance[existingIndex] = { ...previous, ...validated };
            } else {
                newRecordId = Date.now();
                if (DB.maintenance.some(item => sameLabId(item && item.id, newRecordId))) {
                    showToast('设备编号冲突，请重试保存', 'error');
                    return;
                }
                DB.maintenance.push({ ...validated, id: newRecordId });
            }

            const saved = await saveToLocal();
            if (!saved) {
                if (existingIndex >= 0) DB.maintenance[existingIndex] = previous;
                else DB.maintenance = DB.maintenance.filter(item => !sameLabId(item.id, newRecordId));
                showToast('设备台账保存失败，已撤销本次修改；请检查存储后重试', 'error');
                return;
            }
            showToast(id ? '已更新' : '已新增');
            closeModal('modal-maint');
            renderMaintenance();
        }
        function editMaintLog(id) {
            let l = DB.maintLogs.find(x => sameLabId(x.id, id));
            if (!l) { showToast('维保记录不存在或已被删除，请刷新后重试', 'error'); return; }
            // 动态生成设备下拉框
            let eqSelect = document.getElementById('ml-eq');
            eqSelect.innerHTML = DB.maintenance.map(m => `<option value="${esc(labIdKey(m.id))}">${esc(m.name)}</option>`).join('');
            document.getElementById('ml-id').value = l.id;
            document.getElementById('ml-eq').value = labIdKey(l.eqId);
            document.getElementById('ml-date').value = l.date;
            document.getElementById('ml-checker').value = l.checker;
            document.getElementById('ml-operator').value = l.operator;
            document.getElementById('ml-cost').value = l.cost;
            document.getElementById('ml-record').value = l.record;
            openModal('modal-maint-log');
        }
        async function saveMaintLog() {
            const id = document.getElementById('ml-id').value;
            const eqIdInput = document.getElementById('ml-eq').value;
            const selectedEquipment = DB.maintenance.find(item => sameLabId(item.id, eqIdInput));
            if (!selectedEquipment) { showToast('请选择有效的设备台账记录', 'error'); return; }
            const eqId = selectedEquipment.id;
            const date = document.getElementById('ml-date').value;
            const costRaw = document.getElementById('ml-cost').value;
            const cost = costRaw === '' ? 0 : Number(costRaw);
            if (!isValidDateOnly(date)) { showToast('维保日期无效', 'error'); return; }
            if (!Number.isFinite(cost) || cost < 0) { showToast('维保费用必须是大于或等于 0 的有效数字', 'error'); return; }
            const data = { eqId: selectedEquipment.id, date, checker: document.getElementById('ml-checker').value,
                operator: document.getElementById('ml-operator').value, cost,
                record: document.getElementById('ml-record').value };
            const previousDB = snapshotLabDB();
            let previousEqId = null;
            if (id) {
                const i = DB.maintLogs.findIndex(x => sameLabId(x.id, id));
                if (i < 0) { showToast('原维保记录已不存在，请刷新后重试', 'error'); return; }
                previousEqId = DB.maintLogs[i].eqId;
                DB.maintLogs[i] = { ...DB.maintLogs[i], ...data };
            } else {
                data.id = Date.now();
                if (DB.maintLogs.some(x => String(x.id) === String(data.id))) {
                    showToast('维保记录编号冲突，请重试保存', 'error'); return;
                }
                DB.maintLogs.push(data);
            }
            if (previousEqId !== null && !sameLabId(previousEqId, eqId)) syncMaintenanceSchedule(previousEqId);
            syncMaintenanceSchedule(eqId);
            if (!await commitLabMutation(previousDB, '维保记录保存失败，本次修改已撤销')) return;
            closeModal('modal-maint-log');
            renderMaintenance();
            renderMaintLogs();
        }

                function calibrationDateToIso(value) {
            if (!isValidDateOnly(value)) throw new TypeError('校准日期无效');
            // The date input is a calendar date, not a local-time instant.
            // Anchor it at UTC midnight so users in every timezone keep the
            // exact selected YYYY-MM-DD when the record is stored and shown.
            return value + 'T00:00:00.000Z';
        }

        async function renderCalibrationLogs() {
            const select = document.getElementById('cal-asset');
            const tbody = document.querySelector('#table-calibration tbody');
            if (!select || !tbody) return;
            if (storageRecoveryRequired) {
                tbody.innerHTML = '<tr><td colspan="8">原始缓存待恢复，校准记录暂不可读取或更改；请先导出恢复包并完成数据恢复。</td></tr>';
                return;
            }
            const selected = select.value;
            const dateInput = document.getElementById('cal-date');
            if (dateInput && !dateInput.value) dateInput.value = getToday();
            select.innerHTML = '<option value="">请选择在册设备</option>' +
                DB.maintenance.map(asset =>
                    `<option value="${esc(asset.id)}">${esc(asset.name)} · ${esc(asset.category || '未分类')}</option>`
                ).join('');
            if (DB.maintenance.some(asset => String(asset.id) === selected)) select.value = selected;
            tbody.innerHTML = '';
            let domain;
            try {
                domain = await import('../../src/domain/index.js?v=20261019-ekpo-readiness-v2');
            } catch (error) {
                tbody.innerHTML = '<tr><td colspan="8">校准规则模块不可用，当前无法计算有效期状态。</td></tr>';
                showToast('校准规则模块加载失败，请刷新页面后重试', 'error');
                return;
            }
            const rows = [...(DB.calibrationLogs || [])].sort((a, b) =>
                String(b.calibratedAt).localeCompare(String(a.calibratedAt)));
            if (!rows.length) {
                tbody.innerHTML = '<tr><td colspan="8">暂无校准记录。请仅录入有证书或报告支持的真实校准结果。</td></tr>';
                return;
            }
            rows.forEach(record => {
                const asset = DB.maintenance.find(item => sameLabId(item.id, record.assetId));
                let status = record.result === 'fail' ? '校准不合格' :
                    domain.isCalibrationCurrent(record) ? '有效' : '已过期';
                const badge = record.result === 'fail' ? 'badge-danger' :
                    status === '有效' ? 'badge-success' : 'badge-warning';
                tbody.innerHTML += `<tr>
                    <td><strong>${esc(asset ? asset.name : '已退役/未知设备')}</strong></td>
                    <td>${esc(String(record.calibratedAt).slice(0, 10))}</td>
                    <td>${esc(record.certificateNo)}</td>
                    <td>${esc(record.organization)}</td>
                    <td>${esc(record.operator)}</td>
                    <td>${esc(record.validForDays)} 天</td>
                    <td><span class="badge ${badge}">${status}</span></td>
                    <td>${esc(record.notes || '')}</td>
                </tr>`;
            });
        }

        async function saveCalibration() {
            if (storageRecoveryRequired) {
                showToast('原始缓存尚未恢复，已阻止新增校准记录；请先恢复有效备份', 'error');
                return;
            }
            const assetId = String(document.getElementById('cal-asset').value || '').trim();
            const asset = DB.maintenance.find(item => sameLabId(item.id, assetId));
            if (!asset) { showToast('请选择有效的在册设备', 'error'); return; }
            const validForDays = Number(document.getElementById('cal-valid-days').value);
            const certificateNo = document.getElementById('cal-certificate').value.trim();
            const organization = document.getElementById('cal-organization').value.trim();
            const operator = document.getElementById('cal-operator').value.trim();
            const result = document.getElementById('cal-result').value;
            const notes = document.getElementById('cal-notes').value;
            let calibratedAt;
            try {
                calibratedAt = calibrationDateToIso(document.getElementById('cal-date').value);
                const domain = await import('../../src/domain/index.js?v=20261019-ekpo-readiness-v2');
                const duplicate = DB.calibrationLogs.some(row =>
                    sameLabId(row.assetId, assetId) &&
                    row.certificateNo === certificateNo &&
                    row.organization === organization);
                if (duplicate) {
                    showToast('该设备已存在相同机构与证书编号的校准记录', 'error');
                    return;
                }
                let id = Date.now();
                while (DB.calibrationLogs.some(row => String(row.id) === String(id))) id++;
                const record = domain.createCalibrationRecord({
                    id, assetId, calibratedAt, validForDays, certificateNo,
                    organization, operator, result, notes
                });
                const previousDB = snapshotLabDB();
                DB.calibrationLogs.unshift(record);
                if (!await commitLabMutation(previousDB, '校准记录保存失败，本次新增已撤销')) return;
                document.getElementById('cal-certificate').value = '';
                document.getElementById('cal-notes').value = '';
                showToast('校准记录已保存；历史记录保持不变');
                renderCalibrationLogs();
            } catch (error) {
                showToast('校准记录未保存：' + (error && error.message ? error.message : '字段校验失败'), 'error');
            }
        }

// ==================== 8. 备件管理 ====================
        function renderSpareParts() {
            let search = document.getElementById('search-spare').value.toLowerCase();
            let tbody = document.querySelector('#table-spareParts tbody'); tbody.innerHTML = '';
            let filtered = DB.spareParts.filter(s => (s.desc||'').toLowerCase().includes(search) || (s.catalog||'').toLowerCase().includes(search));
            filtered.forEach(s => {
                let totalPrice = (Number(s.qty) || 0) * (Number(s.price) || 0);
                tbody.innerHTML += `<tr>
                    <td>${esc(s.category||'')}</td><td><strong>${esc(s.desc||'')}</strong></td><td>${esc(s.catalog||'-')}</td><td>${esc(s.purpose||'')}</td><td>${esc(s.brand||'')}</td>
                    <td>${s.qty||0}</td><td>¥${(s.price||0).toLocaleString()}</td><td><strong>¥${totalPrice.toLocaleString()}</strong></td><td>${esc(s.location||'')}</td><td>${esc(s.update || '-')}</td>
                    <td><button class="btn btn-outline btn-sm" onclick="editSpare(${labInlineId(s.id)})">编辑</button><button class="btn btn-danger btn-sm" onclick="deleteItem('spareParts', ${labInlineId(s.id)})">删除</button></td>
                </tr>`;
            });

            let treemapChart = initChart('chart-spare-treemap');
            if(treemapChart) {
                let catData = {};
                filtered.forEach(s => { catData[s.category] = (catData[s.category] || 0) + ((s.qty||0) * (s.price||0)); });
                treemapChart.setOption({
                    tooltip: { formatter: '{b}: ¥{c}' },
                    series: [{ type: 'treemap', data: Object.keys(catData).map(k => ({ name: k, value: catData[k] || 1 })) }]
                });
            }
            
            let timeChart = initChart('chart-spare-timeline');
            if(timeChart && filtered.length > 0) {
                let sorted = [...filtered].sort((a,b) => (a.update||'').localeCompare(b.update||''));
                timeChart.setOption({
                    tooltip: { trigger: 'axis' },
                    xAxis: { type: 'category', data: sorted.map(s => s.update || '未知'), axisLabel: { rotate: 45 } },
                    yAxis: { type: 'value', name: '库存量' },
                    series: [{ type: 'line', data: sorted.map(s => s.qty), smooth: true, itemStyle: { color: '#10b981' }, areaStyle: { color: 'rgba(16,185,129,0.1)' } }]
                });
            }
        }

        function renderSpareLogs() {
            let tbody = document.querySelector('#table-spare-logs tbody'); tbody.innerHTML = '';
            DB.spareLogs.sort((a,b) => (b.date||'').localeCompare(a.date||'')).forEach(l => {
                let part = DB.spareParts.find(p => sameLabId(p.id, l.partId));
                let badge = l.action === '入库' ? '<span class="badge badge-success">入库</span>' : '<span class="badge badge-danger">出库</span>';
                tbody.innerHTML += `<tr>
                    <td>${esc(l.date)}</td><td><strong>${esc(part ? part.desc : '未知备件')}</strong></td><td>${badge}</td><td>${esc(l.qty)}</td><td>${esc(l.operator||'')}</td><td>${esc(l.note||'')}</td>
                    <td><button class="btn btn-danger btn-sm" onclick="deleteItem('spareLogs', ${labInlineId(l.id)})">删除</button></td>
                </tr>`;
            });
        }

        function editSpare(id) { let s = DB.spareParts.find(x => sameLabId(x.id, id)); if(!s){showToast('备件记录不存在或已被删除，请刷新后重试','error');return;} document.getElementById('s-id').value=s.id; document.getElementById('s-category').value=s.category||''; document.getElementById('s-desc').value=s.desc||''; document.getElementById('s-catalog').value=s.catalog||''; document.getElementById('s-purpose').value=s.purpose||''; document.getElementById('s-qty').value=s.qty||0; document.getElementById('s-brand').value=s.brand||''; document.getElementById('s-price').value=s.price||0; document.getElementById('s-location').value=s.location||''; document.getElementById('s-update').value=s.update||''; openModal('modal-spare'); }
        async function saveSpare() {
            const id = document.getElementById('s-id').value;
            const update = document.getElementById('s-update').value || getToday();
            const data = {
                category: document.getElementById('s-category').value.trim(),
                desc: document.getElementById('s-desc').value.trim(),
                catalog: document.getElementById('s-catalog').value.trim(),
                purpose: document.getElementById('s-purpose').value.trim(),
                qty: Number(document.getElementById('s-qty').value),
                brand: document.getElementById('s-brand').value.trim(),
                price: Number(document.getElementById('s-price').value),
                location: document.getElementById('s-location').value.trim(),
                update
            };
            if (!data.desc || !data.catalog) { showToast('备件名称和物料编码为必填项', 'error'); return; }
            if (!Number.isFinite(data.qty) || data.qty < 0 || !Number.isFinite(data.price) || data.price < 0) {
                showToast('备件库存和单价必须是大于或等于 0 的有效数字', 'error'); return;
            }
            if (!isValidDateOnly(update)) { showToast('备件日期无效', 'error'); return; }
            const duplicateCatalog = DB.spareParts.find(item =>
                String(item.catalog || '').trim().toLowerCase() === data.catalog.toLowerCase() &&
                !sameLabId(item.id, id));
            if (duplicateCatalog) {
                showToast('物料编码已存在，请使用唯一编码', 'error');
                return;
            }
            const previousDB = snapshotLabDB();
            if (id) {
                const i = DB.spareParts.findIndex(x => sameLabId(x.id, id));
                if (i < 0) { showToast('原备件记录已不存在，请刷新后重试', 'error'); return; }
                const previous = DB.spareParts[i];
                const hasHistory = DB.spareLogs.some(item => sameLabId(item.partId, id));
                if (hasHistory && Number(previous.qty) !== data.qty) {
                    showToast('该备件已有出入库流水，库存数量不可直接修改；请通过新增入库/出库流水调整', 'error');
                    return;
                }
                if (hasHistory && String(previous.catalog || '').trim().toLowerCase() !== data.catalog.toLowerCase()) {
                    showToast('该备件已有出入库流水，物料编码不可修改，以免历史流水失去关联', 'error');
                    return;
                }
                DB.spareParts[i] = { ...previous, ...data };
            } else {
                data.id = Date.now();
                if (DB.spareParts.some(x => String(x.id) === String(data.id))) {
                    showToast('备件记录编号冲突，请重试保存', 'error'); return;
                }
                DB.spareParts.push(data);
            }
            if (!await commitLabMutation(previousDB, '备件台账保存失败，本次修改已撤销')) return;
            closeModal('modal-spare');
            renderSpareParts();
        }

        async function saveSpareLog() {
            const partIdInput = document.getElementById('sl-part').value;
            const action = document.getElementById('sl-action').value;
            const qtyRaw = document.getElementById('sl-qty').value;
            const qty = qtyRaw === '' ? NaN : Number(qtyRaw);
            const date = document.getElementById('sl-date').value;
            const part = DB.spareParts.find(p => sameLabId(p.id, partIdInput));
            if (!part) { showToast('请选择有效的备件记录', 'error'); return; }
            if (!['入库', '出库'].includes(action)) { showToast('请选择有效的出入库类型', 'error'); return; }
            if (!Number.isFinite(qty) || qty <= 0) { showToast('出入库数量必须是大于 0 的有效数字', 'error'); return; }
            if (!isValidDateOnly(date)) { showToast('出入库日期无效', 'error'); return; }
            const currentQty = Number(part.qty);
            if (!Number.isFinite(currentQty) || currentQty < 0) { showToast('当前库存数据异常，请先核对库存台账', 'error'); return; }
            if (action === '出库' && qty > currentQty) {
                showToast('出库数量超过当前库存，已阻止本次出库', 'error'); return;
            }
            const nextQty = action === '入库' ? currentQty + qty : currentQty - qty;
            if (!Number.isFinite(nextQty) || nextQty < 0) { showToast('出入库后库存无效', 'error'); return; }
            const data = { partId: part.id, date, action, qty, operator: document.getElementById('sl-operator').value,
                note: document.getElementById('sl-note').value, id: Date.now() };
            if (DB.spareLogs.some(item => String(item.id) === String(data.id))) {
                showToast('出入库流水编号冲突，请重试保存', 'error'); return;
            }
            const previousDB = snapshotLabDB();
            part.qty = nextQty;
            part.update = date;
            DB.spareLogs.push(data);
            if (!await commitLabMutation(previousDB, '出入库流水保存失败；库存与流水已撤销')) return;
            closeModal('modal-spare-log');
            renderSpareParts();
            const spareLogView = document.getElementById('spare-log-view');
            if (spareLogView && !spareLogView.classList.contains('hidden')) renderSpareLogs();
            showToast('流水已保存，库存已更新');
        }

        // ==================== 9. 测试台日志 ====================
        function diaryTimestamp(value) {
            const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
            if (match) {
                const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
                const date = new Date(year, month - 1, day);
                if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return NaN;
                return date.getTime();
            }
            return new Date(value).getTime();
        }
        function diaryYear(value) {
            const timestamp = diaryTimestamp(value);
            return Number.isFinite(timestamp) ? new Date(timestamp).getFullYear() : NaN;
        }

        function renderTestDiary() {
            let search = document.getElementById('search-testDiary').value.toLowerCase();
            let tbody = document.querySelector('#table-testDiary tbody'); tbody.innerHTML = '';
            let filtered = DB.testDiary.filter(t => (t.unit||'').toLowerCase().includes(search) || (t.operator||'').toLowerCase().includes(search) || (t.error||'').toLowerCase().includes(search));
            filtered.forEach(t => {
                tbody.innerHTML += `<tr>
                    <td>${esc(t.start||'')}</td><td>${esc(t.end||'')}</td><td>${esc(t.duration||0)}</td><td><strong>${esc(t.unit||'')}</strong></td><td>${esc(t.operator||'')}</td><td>${esc(t.sap||'')}</td><td>${esc(t.result||'')}</td><td>${esc(t.cycle||'')}</td><td>${esc(t.error || '-')}</td><td>${esc(t.errorDesc || '-')}</td>
                    <td><button class="btn btn-outline btn-sm" onclick="editTestDiary(${Number(t.id)})">编辑</button><button class="btn btn-danger btn-sm" onclick="deleteItem('testDiary', ${Number(t.id)})">删除</button></td>
                </tr>`;
            });

            let treemapChart = initChart('chart-testDiary-treemap');
            if(treemapChart) {
                let errData = {};
                filtered.forEach(t => {
                    if(t.error && t.error.trim() !== '') {
                        errData[t.error] = (errData[t.error] || 0) + 1;
                    }
                });
                if (Object.keys(errData).length === 0) errData["无故障记录"] = 1;
                treemapChart.setOption({
                    tooltip: { formatter: '{b}: {c} 次' },
                    series: [{ type: 'treemap', data: Object.keys(errData).map(k => ({ name: k, value: errData[k] })) }]
                });
            }

            let timeChart = initChart('chart-testDiary-timeline');
            if(timeChart && filtered.length > 0) {
                let data = filtered.map((t, index) => {
                    const start = diaryTimestamp(t.start);
                    const end = diaryTimestamp(t.end);
                    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
                    // Keep the category index as the first value for the custom series.
                    return { name: t.unit + '-' + t.start, value: [index, start, end], itemStyle: { color: '#f59e0b' } };
                }).filter(Boolean);
                if (!data.length) { timeChart.clear(); return; }
                timeChart.setOption({
                    tooltip: { formatter: p => `${p.name}<br/>开始: ${new Date(p.value[1]).toLocaleString()}<br/>结束: ${new Date(p.value[2]).toLocaleString()}` },
                    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                    xAxis: { type: 'time', boundaryGap: false, axisLabel: { formatter: '{yyyy}-{MM}-{dd}', rotate: 45 }, minInterval: 3600 * 24 * 1000 },
                    yAxis: { type: 'category', data: filtered.map(t => t.unit) },
                    series: [{ type: 'custom', renderItem: function (params, api) {
                        var catIdx = api.value(0); var start = api.coord([api.value(1), catIdx]); var end = api.coord([api.value(2), catIdx]);
                        var h = api.size([0, 1])[1] * 0.6; var rect = echarts.graphic.clipRectByRect({ x: start[0], y: start[1] - h / 2, width: end[0] - start[0], height: h }, { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height });
                        return rect && { type: 'rect', transition: ['shape'], shape: rect, style: api.style() };
                    }, data: data }]
                });
            }
        }
        function editTestDiary(id) { let t = DB.testDiary.find(x => x.id === id); if(!t){showToast('测试记录不存在，请刷新后重试','error');return;} document.getElementById('t-id').value=t.id; document.getElementById('t-start').value=t.start||''; document.getElementById('t-end').value=t.end||''; document.getElementById('t-duration').value=t.duration||0; document.getElementById('t-unit').value=t.unit||''; document.getElementById('t-operator').value=t.operator||''; document.getElementById('t-sap').value=t.sap||''; document.getElementById('t-result').value=t.result||''; document.getElementById('t-cycle').value=t.cycle||''; document.getElementById('t-error').value=t.error||''; document.getElementById('t-errorDesc').value=t.errorDesc||''; openModal('modal-testDiary'); }
        async function saveTestDiary() {
            const id = document.getElementById('t-id').value;
            const data = {
                start: document.getElementById('t-start').value,
                end: document.getElementById('t-end').value,
                duration: Number(document.getElementById('t-duration').value),
                unit: document.getElementById('t-unit').value,
                operator: document.getElementById('t-operator').value,
                sap: document.getElementById('t-sap').value,
                result: document.getElementById('t-result').value,
                cycle: document.getElementById('t-cycle').value,
                error: document.getElementById('t-error').value,
                errorDesc: document.getElementById('t-errorDesc').value
            };
            try {
                const domain = await import('../../src/domain/index.js?v=20261019-ekpo-readiness-v2');
                Object.assign(data, domain.validateTestDiaryEntry(data));
            } catch (error) {
                showToast('测试记录未保存：' + error.message, 'error');
                return;
            }
            const previousDB = snapshotLabDB();
            if (id) {
                const i = DB.testDiary.findIndex(x => String(x.id) === String(id));
                if (i < 0) { showToast('测试记录不存在，未保存', 'error'); return; }
                DB.testDiary[i] = { ...DB.testDiary[i], ...data };
            } else {
                data.id = Date.now();
                if (DB.testDiary.some(x => String(x.id) === String(data.id))) {
                    showToast('测试记录编号冲突，请重试保存', 'error'); return;
                }
                DB.testDiary.push(data);
            }
            if (!await commitLabMutation(previousDB, '测试记录保存失败，本次修改已撤销')) return;
            closeModal('modal-testDiary');
            renderTestDiary();
        }

        // ==================== 10. 年度综合统计 ====================
        // ==================== 10. 实验计划与生命周期 ====================
        let experimentMutationPending = false;
        const experimentStatusLabels = {
            planned: '计划中',
            'in-progress': '进行中',
            completed: '已完成',
            cancelled: '已取消'
        };

        let experimentRenderSequence = 0;
        async function renderExperiments() {
            const renderSequence = ++experimentRenderSequence;
            const container = document.getElementById('experiments-table');
            let domain;
            try {
                domain = await import('../../src/domain/index.js?v=20261019-ekpo-readiness-v2');
            } catch (error) {
                if (container) container.innerHTML = '<div class="experiment-empty"><strong>校准状态模块不可用</strong><span>为避免在无法核验设备状态时错误安排实验，当前设备就绪情况暂不可用；请刷新页面后重试。</span></div>';
                showToast('设备校准状态模块加载失败，请刷新页面后重试', 'error');
                return;
            }
            if (renderSequence !== experimentRenderSequence) return;
            if (!Array.isArray(DB.experiments)) DB.experiments = [];
            if (!Array.isArray(DB.calibrationLogs)) DB.calibrationLogs = [];
            const plannedDateInput = document.getElementById('experiment-planned-date');
            if (plannedDateInput && !plannedDateInput.value) plannedDateInput.value = getToday();
            const now = new Date();
            const assetReadiness = new Map();
            const assetSelect = document.getElementById('experiment-asset');
            if (assetSelect) {
                const selected = assetSelect.value;
                assetSelect.innerHTML = '<option value="">请选择在册设备</option>' +
                    DB.maintenance.map(asset => {
                        const readiness = domain.getExperimentEquipmentReadiness({
                            assetId: asset.id,
                            equipment: DB.maintenance,
                            calibrationRecords: DB.calibrationLogs,
                            at: now
                        });
                        assetReadiness.set(String(asset.id).trim(), readiness);
                        return '<option value="' + esc(asset.id) + '">' +
                            esc(asset.name) + '（' + esc(asset.category || '未分类') + ' · ' +
                            esc(asset.location || '未填写位置') + ' · ' + esc(readiness.label) + '）</option>';
                    }).join('');
                if (DB.maintenance.some(asset => String(asset.id).trim() === String(selected).trim())) {
                    assetSelect.value = selected;
                }
            }

            const counts = { planned: 0, 'in-progress': 0, completed: 0, cancelled: 0 };
            DB.experiments.forEach(record => { if (Object.hasOwn(counts, record.status)) counts[record.status] += 1; });
            document.getElementById('experiment-count-planned').textContent = counts.planned;
            document.getElementById('experiment-count-active').textContent = counts['in-progress'];
            document.getElementById('experiment-count-completed').textContent = counts.completed;
            document.getElementById('experiment-count-cancelled').textContent = counts.cancelled;

            const search = (document.getElementById('search-experiments')?.value || '').trim().toLowerCase();
            const records = DB.experiments.filter(record => {
                const asset = DB.maintenance.find(item => String(item.id).trim() === String(record.assetId).trim());
                const haystack = [record.id, record.title, record.owner, record.purpose, asset?.name || ''].join(' ').toLowerCase();
                return !search || haystack.includes(search);
            }).slice().sort((a, b) => {
                const dateOrder = String(a.plannedDate || '').localeCompare(String(b.plannedDate || ''));
                return dateOrder || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
            });
            if (!container) return;
            if (!records.length) {
                container.innerHTML = '<div class="experiment-empty"><strong>当前没有匹配的实验计划</strong><span>创建计划后，开始、完成或取消操作都会留下不可直接编辑的审计记录。设备校准状态会在安排和启动前核验。</span></div>';
                return;
            }

            const auditLabel = event => {
                if (event.from === 'new' && event.to === 'planned') return '创建计划';
                return (experimentStatusLabels[event.from] || event.from) + ' → ' + (experimentStatusLabels[event.to] || event.to);
            };
            const rows = records.map(record => {
                const asset = DB.maintenance.find(item => String(item.id).trim() === String(record.assetId).trim());
                const readiness = domain.getExperimentEquipmentReadiness({
                    assetId: record.assetId,
                    equipment: DB.maintenance,
                    calibrationRecords: DB.calibrationLogs,
                    at: now
                });
                const status = experimentStatusLabels[record.status] || '状态异常';
                const readinessClass = readiness.ready ? 'experiment-calibration-ready' : 'experiment-calibration-blocked';
                let actions = '';
                if (record.status === 'planned') {
                    actions = '<button type="button" class="btn btn-primary btn-sm" data-experiment-action="start" data-experiment-id="' + esc(record.id) + '"' +
                        (readiness.ready ? '' : ' disabled aria-disabled="true" title="' + esc(readiness.message) + '，当前仅可保留计划或取消计划"') +
                        '>开始实验</button> ' +
                        '<button type="button" class="btn btn-outline btn-sm" data-experiment-action="cancel" data-experiment-id="' + esc(record.id) + '">取消计划</button>';
                } else if (record.status === 'in-progress') {
                    actions = '<button type="button" class="btn btn-primary btn-sm" data-experiment-action="complete" data-experiment-id="' + esc(record.id) + '">完成实验</button> ' +
                        '<button type="button" class="btn btn-outline btn-sm" data-experiment-action="cancel" data-experiment-id="' + esc(record.id) + '">取消实验</button>';
                } else {
                    actions = '<span class="experiment-terminal">终态 · 不可继续变更</span>';
                }
                const audit = record.audit.map(event =>
                    '<li><span>' + esc(auditLabel(event)) + '</span><b>' + esc(event.actor) + '</b><time>' + esc(event.at) + '</time></li>'
                ).join('');
                return '<tr>' +
                    '<td><strong>' + esc(record.title) + '</strong><small>' + esc(record.id) + '</small><details class="experiment-purpose"><summary>查看目的与说明</summary><p>' + esc(record.purpose) + '</p></details></td>' +
                    '<td><strong>' + esc(asset?.name || ('设备编号 ' + record.assetId)) + '</strong><small class="' + readinessClass + '">' + esc(readiness.label) + ' · ' + esc(readiness.message) + '</small></td>' +
                    '<td>' + esc(record.plannedDate) + '</td>' +
                    '<td>' + esc(record.owner) + '</td>' +
                    '<td><span class="experiment-status status-' + esc(record.status) + '">' + esc(status) + '</span></td>' +
                    '<td><details class="experiment-audit"><summary>审计记录（' + record.audit.length + '）</summary><ol>' + audit + '</ol></details></td>' +
                    '<td class="experiment-actions">' + actions + '</td>' +
                    '</tr>';
            }).join('');
            container.innerHTML = '<div class="table-scroll"><table class="experiment-table"><thead><tr>' +
                '<th>实验计划</th><th>设备 / 校准就绪</th><th>计划日期</th><th>负责人</th><th>当前状态</th><th>审计历史</th><th>允许操作</th>' +
                '</tr></thead><tbody>' + rows + '</tbody></table></div>';
        }

        async function createLabExperiment() {
            if (experimentMutationPending) return;
            if (storageRecoveryRequired) {
                showToast('恢复保护已启用：请先恢复有效备份，再创建实验计划。', 'error');
                return;
            }
            const form = document.getElementById('experiment-create-form');
            const button = document.getElementById('experiment-create-button');
            if (button) button.disabled = true;
            if (!form.checkValidity()) {
                form.reportValidity();
                if (button) button.disabled = false;
                return;
            }
            experimentMutationPending = true;
            try {
                const assetId = document.getElementById('experiment-asset').value;
                if (!DB.maintenance.some(asset => String(asset.id) === String(assetId))) {
                    throw new Error('请选择当前设备台账中的有效设备');
                }
                const domain = await import('../../src/domain/index.js?v=20261019-ekpo-readiness-v2');
                const record = domain.createExperimentRecord({
                    id: 'EXP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                    title: document.getElementById('experiment-title').value,
                    assetId,
                    plannedDate: document.getElementById('experiment-planned-date').value,
                    owner: document.getElementById('experiment-owner').value,
                    purpose: document.getElementById('experiment-purpose').value,
                    actor: document.getElementById('experiment-creator').value,
                    createdAt: new Date().toISOString()
                });
                if (DB.experiments.some(item => item.id === record.id)) throw new Error('实验编号已存在，请重试');
                const previousDB = snapshotLabDB();
                DB.experiments.push(record);
                if (!await commitLabMutation(previousDB, '实验计划保存失败；已撤销本次创建')) return;
                form.reset();
                document.getElementById('experiment-planned-date').value = getToday();
                renderExperiments();
                showToast('实验计划已保存；当前记录仅代表计划，不代表已完成测试。');
            } catch (error) {
                showToast('无法创建实验计划：' + error.message, 'error');
            } finally {
                experimentMutationPending = false;
                if (button) button.disabled = false;
            }
        }

        async function transitionLabExperiment(id, nextStatus) {
            if (experimentMutationPending) return;
            if (storageRecoveryRequired) {
                showToast('恢复保护已启用：实验状态未变更。', 'error');
                return;
            }
            experimentMutationPending = true;
            const actor = document.getElementById('experiment-action-actor').value.trim();
            if (!actor) {
                experimentMutationPending = false;
                showToast('请先填写本次状态变更的操作人；系统不会代填身份。', 'error');
                return;
            }
            if ((nextStatus === 'completed' || nextStatus === 'cancelled') &&
                !confirm(nextStatus === 'completed'
                    ? '确认将实验标记为已完成？该操作会追加审计记录且不能回退；它不代表测量结果已经审核。'
                    : '确认取消此实验？取消后将进入终态并保留完整审计记录。')) {
                experimentMutationPending = false;
                return;
            }
            const index = DB.experiments.findIndex(record => record.id === id);
            if (index < 0) {
                experimentMutationPending = false;
                showToast('找不到对应实验计划，数据未变更。', 'error');
                renderExperiments();
                return;
            }
            try {
                const domain = await import('../../src/domain/index.js?v=20261019-ekpo-readiness-v2');
                const current = domain.validateExperimentRecord(DB.experiments[index]);
                if (nextStatus === 'in-progress') {
                    const readiness = domain.getExperimentEquipmentReadiness({
                        assetId: current.assetId,
                        equipment: DB.maintenance,
                        calibrationRecords: DB.calibrationLogs || [],
                        at: new Date()
                    });
                    if (!readiness.ready) {
                        throw new Error(readiness.message + '，不能启动实验');
                    }
                }
                const updated = domain.transitionExperiment(current, nextStatus, actor, new Date().toISOString());
                domain.validateExperimentRecord(updated);
                const previousDB = snapshotLabDB();
                DB.experiments[index] = updated;
                if (!await commitLabMutation(previousDB, '实验状态保存失败；已回滚状态和审计历史')) return;
                renderExperiments();
                showToast('实验状态已更新，操作人和时间已写入审计历史。');
            } catch (error) {
                showToast('状态变更未执行：' + error.message, 'error');
            } finally {
                experimentMutationPending = false;
            }
        }

        function bindExperimentActions() {
            const container = document.getElementById('experiments-table');
            if (!container || container.dataset.bound === 'true') return;
            container.dataset.bound = 'true';
            container.addEventListener('click', event => {
                const button = event.target.closest('[data-experiment-action]');
                if (!button) return;
                const action = button.dataset.experimentAction;
                const next = action === 'start' ? 'in-progress' :
                    action === 'complete' ? 'completed' :
                    action === 'cancel' ? 'cancelled' : '';
                if (next) transitionLabExperiment(button.dataset.experimentId, next);
            });
        }

        function renderYearlyFilter() {
            let select = document.getElementById('filter-yearly-year');
            if (select.options.length <= 1) {
                let years = new Set();
                DB.gases.forEach(g => years.add(g.year));
                DB.maintLogs.forEach(l => years.add(new Date(l.date).getFullYear()));
                DB.spareLogs.forEach(l => years.add(new Date(l.date).getFullYear()));
                DB.testDiary.forEach(t => years.add(diaryYear(t.start)));
                let sortedYears = [...years].sort((a,b) => b - a);
                sortedYears.forEach(y => {
                    let opt = document.createElement('option'); opt.value = y; opt.innerText = y + '年'; select.appendChild(opt);
                });
            }
        }

        function renderYearly() {
            let filterYear = document.getElementById('filter-yearly-year').value;
            let isAll = filterYear === 'all';
            let yearFilter = (itemYear) => isAll || itemYear == filterYear;

            let totalGasCost = DB.gases.filter(g => yearFilter(g.year)).reduce((sum, g) => sum + (Number(g.cost) || 0) + (Number(g.rent) || 0) + (Number(g.freight) || 0), 0);
            let totalMaintCost = DB.maintLogs.filter(l => yearFilter(new Date(l.date).getFullYear())).reduce((sum, l) => sum + (Number(l.cost) || 0), 0);
            let totalSpareCost = DB.spareParts.filter(s => yearFilter(new Date(s.update || getToday()).getFullYear())).reduce((sum, s) => sum + ((Number(s.qty) || 0) * (Number(s.price) || 0)), 0);
            let totalHours = DB.testDiary.filter(t => yearFilter(diaryYear(t.start))).reduce((sum, t) => sum + (Number(t.duration) || 0), 0);
            let totalCost = totalGasCost + totalMaintCost;
            
            document.getElementById('year-total-cost').innerText = '¥' + totalCost.toLocaleString();
            document.getElementById('year-maint-count').innerText = DB.maintenance.length + ' 台';
            document.getElementById('year-spare-cost').innerText = '¥' + totalSpareCost.toLocaleString();
            document.getElementById('year-test-hours').innerText = totalHours + ' h';

            let treemapChart = initChart('chart-yearly-treemap');
            if(treemapChart) {
                treemapChart.setOption({
                    tooltip: { formatter: '{b}: ¥{c}' },
                    series: [{
                        type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false },
                        data: [
                            { name: '气体费用', value: totalGasCost || 1 },
                            { name: '维保费用', value: totalMaintCost || 1 },
                            { name: '备件总值', value: totalSpareCost || 1 }
                        ],
                        label: { formatter: '{b}\n¥{c}' },
                        itemStyle: { borderColor: '#fff' }
                    }]
                });
            }

            let gasTrendChart = initChart('chart-yearly-gas-trend');
            if(gasTrendChart) {
                let sortedGases = DB.gases.filter(g => yearFilter(g.year)).sort((a,b) => (a.month||'').localeCompare(b.month||''));
                let months = [...new Set(sortedGases.map(g => g.month))];
                let totalConsump = months.map(m => sortedGases.filter(g => g.month === m).reduce((sum, g) => sum + (Number(g.consumption) || 0), 0));
                let totalCosts = months.map(m => sortedGases.filter(g => g.month === m).reduce((sum, g) => sum + (Number(g.cost)||0)+(Number(g.rent)||0)+(Number(g.freight)||0), 0));
                gasTrendChart.setOption({
                    tooltip: { trigger: 'axis' }, legend: { data: ['总余量', '气体总费用'] },
                    xAxis: { type: 'category', data: months },
                    yAxis: [{ type: 'value', name: '余量 (m³)' }, { type: 'value', name: '费用 (¥)' }],
                    series: [
                        { name: '总余量', type: 'bar', data: totalConsump, itemStyle: { color: '#3b82f6' } },
                        { name: '气体总费用', type: 'line', yAxisIndex: 1, data: totalCosts, smooth: true, itemStyle: { color: '#ef4444' } }
                    ]
                });
            }

            let container = document.getElementById('yearly-summary-table');
            container.innerHTML = `<table><thead><tr><th>类别</th><th>关键指标</th><th>数量/费用</th></tr></thead><tbody>
                <tr><td>气体使用</td><td>总费用</td><td>¥${totalGasCost.toLocaleString()}</td></tr>
                <tr><td>设备维保</td><td>维保次数 / 总费用</td><td>${DB.maintLogs.filter(l => yearFilter(new Date(l.date).getFullYear())).length} 次 / ¥${totalMaintCost.toLocaleString()}</td></tr>
                <tr><td>备件库存</td><td>所选年度更新记录的当前库存估值（非年度采购额）</td><td>¥${totalSpareCost.toLocaleString()}</td></tr>
                <tr><td>测试台日志</td><td>总运行时长 / 故障次数</td><td>${totalHours} h / ${DB.testDiary.filter(t => yearFilter(diaryYear(t.start)) && t.error).length} 次</td></tr>
            </tbody></table>`;
        }

        // ==================== 11. 系统全量设置 ====================
        function renderSystem() { let table = document.getElementById('sys-table-select').value; renderSystemTable(table); }
        function renderSystemTable(table) {
            let container = document.getElementById('sys-table-container');
            let data = DB[table];
            if (!data || data.length === 0) { container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">暂无数据，请点击上方按钮新增</p>'; return; }
            let keys = Object.keys(data[0]);
            let html = '<table><thead><tr>' + keys.map(k => `<th>${esc(k)}</th>`).join('') + '<th>操作</th></tr></thead><tbody>';
            data.forEach(row => {
                html += '<tr>' + keys.map(k => `<td>${esc(row[k] !== undefined ? row[k] : '')}</td>`).join('');
                html += `<td><button class="btn btn-outline btn-sm" onclick="systemEdit('${table}', ${Number(row.id)})">编辑</button><button class="btn btn-danger btn-sm" onclick="deleteItem('${table}', ${row.id}); renderSystemTable('${table}');">删除</button></td></tr>`;
            });
            html += '</tbody></table>';
            container.innerHTML = html;
        }
        function systemEdit(table, id) { 
            if (table === 'gases') editGas(id); 
            if (table === 'maintenance') editMaint(id); 
            if (table === 'maintLogs') editMaintLog(id);
            if (table === 'spareParts') editSpare(id); 
            if (table === 'spareLogs') { showToast('流水记录请直接删除或新增'); }
            if (table === 'testDiary') editTestDiary(id); 
        }
        function systemAddNew() { 
            let table = document.getElementById('sys-table-select').value; 
            if (table === 'gases') { generateYearOptions('g-year'); generateMonthOptions('g-month'); openModal('modal-gas'); } 
            if (table === 'maintenance') openModal('modal-maint'); 
            if (table === 'maintLogs') { 
                let eqSelect = document.getElementById('ml-eq');
                eqSelect.innerHTML = DB.maintenance.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
                openModal('modal-maint-log'); 
            }
            if (table === 'spareParts') openModal('modal-spare'); 
            if (table === 'spareLogs') {
                let partSelect = document.getElementById('sl-part');
                partSelect.innerHTML = DB.spareParts.map(p => `<option value="${esc(labIdKey(p.id))}">${esc(p.desc)}</option>`).join('');
                openModal('modal-spare-log');
            }
            if (table === 'testDiary') openModal('modal-testDiary'); 
        }

        // ==================== 12. 导出与删除 ====================
        async function deleteItem(table, id) {
            if (!confirm('确认删除这条记录吗？')) return;
            if (storageRecoveryRequired) { showToast('缓存待恢复，已阻止删除', 'error'); return; }
            const rows = DB[table];
            if (!Array.isArray(rows)) { showToast('数据表不存在，无法删除', 'error'); return; }
            const target = rows.find(item => sameLabId(item.id, id));
            if (!target) { showToast('记录不存在或已被删除', 'error'); return; }
            if (table === 'maintenance' && DB.maintLogs.some(item => sameLabId(item.eqId, id))) {
                showToast('该设备仍有关联维保历史，请先处理历史记录后再删除', 'error'); return;
            }
            if (table === 'maintenance' && DB.experiments.some(item => sameLabId(item.assetId, id))) {
                showToast('该设备仍被实验计划引用；当前没有安全归档/解除引用流程，不能删除设备台账', 'error'); return;
            }
            if (table === 'maintenance' && (DB.calibrationLogs || []).some(item => sameLabId(item.assetId, id))) {
                showToast('该设备仍有关联校准证书与历史记录；当前没有安全归档/解除引用流程，不能删除设备台账', 'error'); return;
            }
            if (table === 'spareParts' && DB.spareLogs.some(item => sameLabId(item.partId, id))) {
                showToast('该备件仍有关联出入库流水，请先处理流水后再删除', 'error'); return;
            }
            if (table === 'spareLogs') {
                const part = DB.spareParts.find(item => sameLabId(item.id, target.partId));
                const qty = Number(target.qty);
                const currentQty = part ? Number(part.qty) : NaN;
                if (!part || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(currentQty)) {
                    showToast('流水关联的备件或数量异常，未删除记录', 'error'); return;
                }
                const nextQty = target.action === '入库' ? currentQty - qty
                    : target.action === '出库' ? currentQty + qty : NaN;
                if (!Number.isFinite(nextQty) || nextQty < 0) {
                    showToast('无法撤销该入库流水：当前库存不足，请先核对库存与后续流水', 'error'); return;
                }
            }
            const previousDB = snapshotLabDB();
            if (table === 'spareLogs') {
                const part = DB.spareParts.find(item => sameLabId(item.id, target.partId));
                const qty = Number(target.qty);
                const currentQty = Number(part.qty);
                part.qty = target.action === '入库' ? currentQty - qty : currentQty + qty;
                part.update = target.date;
            }
            const affectedMaintenanceIds = table === 'maintLogs'
                ? [...new Set(DB.maintLogs.filter(item => sameLabId(item.id, id)).map(item => item.eqId))] : [];
            DB[table] = rows.filter(item => !sameLabId(item.id, id));
            if (table === 'maintLogs') affectedMaintenanceIds.forEach(syncMaintenanceSchedule);
            if (!await commitLabMutation(previousDB, '删除未能保存，本次操作已撤销')) return;
            if (table === 'gases') renderGases();
            if (table === 'maintLogs') { renderMaintenance(); renderMaintLogs(); }
            if (table === 'maintenance') renderMaintenance();
            if (table === 'spareParts') renderSpareParts();
            if (table === 'spareLogs') { renderSpareParts(); renderSpareLogs(); }
            if (table === 'testDiary') renderTestDiary();
            showToast('删除成功');
        }

        function exportAllToJSON() {
            if (storageRecoveryRequired) {
                try {
                    const recoveryPrefix = 'lab_management_db_v9_recovery_';
                    const originalRaw = cachedLabRaw !== null
                        ? cachedLabRaw : localStorage.getItem('lab_management_db_v9');
                    const recoveryCopies = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.indexOf(recoveryPrefix) === 0) {
                            recoveryCopies.push({ key, raw: localStorage.getItem(key) });
                        }
                    }
                    if (originalRaw === null && recoveryCopies.length === 0) {
                        throw new Error('没有找到可导出的原始缓存或恢复副本');
                    }
                    const payload = {
                        schemaVersion: 1,
                        exportedAt: new Date().toISOString(),
                        storage: 'lab-browser-cache-recovery',
                        originalRaw,
                        recoveryCopies
                    };
                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = '实验室原始缓存恢复包_' + getToday() + '.json';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    showToast('已导出原始缓存恢复包；其中可能包含敏感实验室数据，请妥善保管。');
                } catch (error) {
                    showToast('原始缓存恢复包导出失败：' + error.message, 'error');
                }
                return;
            }
            if (!isValidLabBackup(DB)) {
                showToast('当前数据未通过备份结构校验，已阻止导出；请先修复数据问题。', 'error');
                return;
            }
            const isDemoSeed = DB.dataProvenance === 'demo-seed';
            const dataStr = JSON.stringify(DB, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (isDemoSeed ? '演示样例_需核验_' : '来源未核验_数据迁移副本_') + getToday() + '.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showToast(isDemoSeed
                ? '已导出演示种子数据；其中示例记录未经业务核验，不可作为真实实验室备份。'
                : '数据已通过结构校验并导出，但来源未核验；文件内的来源字段不能替代独立业务核验，此文件仅为迁移副本。');
        }

        function exportAllToExcel() {
            if (typeof XLSX === 'undefined') {
                showToast('Excel组件加载失败，暂时无法导出Excel；请检查网络连接后刷新页面。JSON备份功能不受影响。', 'error');
                return;
            }
            if (storageRecoveryRequired) {
                showToast('原始缓存尚未恢复；为避免将演示数据误导出为备份，已阻止 Excel 导出。请先导出原始 JSON 恢复包。', 'error');
                return;
            }
            let wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.gases), "气体使用记录");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.maintenance), "设备维保台账");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.maintLogs), "维保历史记录");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.calibrationLogs || []), "设备校准记录");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.spareParts), "备件库存台账");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.spareLogs), "备件出入库流水");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.testDiary), "测试台运行日志");
            const experimentPlans = (DB.experiments || []).map(({ audit, ...record }) => record);
            const experimentAudit = (DB.experiments || []).flatMap(record =>
                (record.audit || []).map(event => ({
                    experimentId: record.id,
                    experimentTitle: record.title,
                    assetId: record.assetId,
                    status: record.status,
                    from: event.from,
                    to: event.to,
                    actor: event.actor,
                    at: event.at
                }))
            );
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(experimentPlans), "实验计划");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(experimentAudit), "实验状态审计");
            XLSX.writeFile(wb, `燃料电池实验室数据报表_${getToday()}.xlsx`);
            showToast('Excel报表已导出！');
        }
        function isValidLabBackup(value) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
            const required = ['gases', 'maintenance', 'spareParts', 'testDiary'];
            if (!required.every(key => Array.isArray(value[key]))) return false;
            if (value.maintLogs !== undefined && !Array.isArray(value.maintLogs)) return false;
            if (value.spareLogs !== undefined && !Array.isArray(value.spareLogs)) return false;
            if (value.calibrationLogs !== undefined && !Array.isArray(value.calibrationLogs)) return false;
            if (value.experiments !== undefined && !Array.isArray(value.experiments)) return false;
            const tables = [...required, 'maintLogs', 'spareLogs', 'calibrationLogs', 'experiments'];
            for (const key of tables) {
                const rows = value[key] || [];
                const ids = new Set();
                for (const row of rows) {
                    if (!row || typeof row !== 'object' || Array.isArray(row) ||
                        !((typeof row.id === 'string' && row.id.trim()) || Number.isSafeInteger(row.id))) return false;
                    const id = labIdKey(row.id);
                    if (ids.has(id)) return false;
                    ids.add(id);
                }
            }
            const maintenanceIds = new Set(value.maintenance.map(row => labIdKey(row.id)));
            if ((value.maintLogs || []).some(row =>
                !maintenanceIds.has(labIdKey(row.eqId)) ||
                !isValidDateOnly(row.date) || !Number.isFinite(Number(row.cost)) || Number(row.cost) < 0)) return false;
            const calibrationReferences = new Set();
            if ((value.calibrationLogs || []).some(row => {
                const reference = JSON.stringify([labIdKey(row.assetId), String(row.organization || '').trim(), String(row.certificateNo || '').trim()]);
                if (calibrationReferences.has(reference)) return true;
                calibrationReferences.add(reference);
                const match = typeof row.calibratedAt === 'string'
                    ? /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(row.calibratedAt)
                    : null;
                let validTimestamp = Boolean(match);
                let timestamp = NaN;
                if (match) {
                    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
                    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
                    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
                    const calendar = new Date(0);
                    calendar.setUTCFullYear(year, month - 1, day);
                    calendar.setUTCHours(0, 0, 0, 0);
                    const zone = match[8];
                    const invalidOffset = zone !== 'Z' &&
                        (Number(match[9]) > 14 || (Number(match[9]) === 14 && Number(match[10]) !== 0));
                    timestamp = Date.parse(row.calibratedAt);
                    const utcYear = Number.isFinite(timestamp) ? new Date(timestamp).getUTCFullYear() : -1;
                    validTimestamp = month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] &&
                        calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 &&
                        calendar.getUTCDate() === day && !invalidOffset && Number.isFinite(timestamp) &&
                        utcYear >= 0 && utcYear <= 9999;
                }
                const expiry = timestamp + Number(row.validForDays) * 86400000;
                return !maintenanceIds.has(labIdKey(row.assetId)) || !validTimestamp ||
                    !Number.isSafeInteger(row.validForDays) || row.validForDays < 1 ||
                    !Number.isFinite(expiry) || Math.abs(expiry) > 8.64e15 ||
                    typeof row.certificateNo !== 'string' || !row.certificateNo.trim() ||
                    typeof row.organization !== 'string' || !row.organization.trim() ||
                    typeof row.operator !== 'string' || !row.operator.trim() ||
                    !['pass', 'fail'].includes(row.result) ||
                    (row.notes !== undefined && typeof row.notes !== 'string');
            })) return false;
            const sparePartIds = new Set(value.spareParts.map(row => String(row.id)));
            if (value.spareParts.some(row =>
                typeof row.desc !== 'string' || !row.desc.trim() ||
                typeof row.catalog !== 'string' || !row.catalog.trim() ||
                !Number.isFinite(Number(row.qty)) || Number(row.qty) < 0 ||
                !Number.isFinite(Number(row.price)) || Number(row.price) < 0)) return false;
            if ((value.spareLogs || []).some(row =>
                !sparePartIds.has(String(row.partId)) ||
                !['入库', '出库'].includes(row.action) ||
                !Number.isFinite(Number(row.qty)) || Number(row.qty) <= 0 ||
                !isValidDateOnly(row.date))) return false;
            return true;
        }

        function importFromLocal(event) {
            const file = event && event.target && event.target.files && event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function(e) {
                const previousDB = snapshotLabDB();
                const previousRecoveryRequired = storageRecoveryRequired;
                try {
                    const imported = JSON.parse(e.target.result);
                    if (!isValidLabBackup(imported)) {
                        throw new Error('备份结构无效，或包含重复编号、孤立维保/备件流水、非法日期或库存数值');
                    }
                    if (!imported.maintLogs) imported.maintLogs = [];
                    if (!imported.spareLogs) imported.spareLogs = [];
                    if (!imported.calibrationLogs) imported.calibrationLogs = [];
                    if (!imported.experiments) imported.experiments = [];
                    const domain = await import('../../src/domain/index.js?v=20261019-ekpo-readiness-v2');
                    // Backup restoration is a write boundary too: normalize and
                    // validate every equipment master before it can replace live data.
                    imported.maintenance = imported.maintenance.map(asset => ({
                        ...asset,
                        ...domain.validateMaintenanceAsset(asset)
                    }));
                    imported.calibrationLogs = imported.calibrationLogs.map(row => domain.createCalibrationRecord(row));
                    const importedAssetIds = new Set(imported.maintenance.map(asset => labIdKey(asset.id)));
                    imported.experiments = imported.experiments.map(row => {
                        const record = domain.validateExperimentRecord(row);
                        if (!importedAssetIds.has(labIdKey(record.assetId))) {
                            throw new Error('实验计划引用了不存在的设备台账: ' + record.id);
                        }
                        return record;
                    });
                    DB = imported;
                    storageRecoveryRequired = false;
                    if (!await commitLabMutation(previousDB, '备份写入失败；已恢复导入前的数据状态')) {
                        // A failed persistence commit must not unlock a cache
                        // that was already in recovery mode before this import.
                        storageRecoveryRequired = previousRecoveryRequired || storageRecoveryRequired;
                        if (storageRecoveryRequired) storageWarning = true;
                        showToast('备份未完成恢复：浏览器存储仍不可用，原始缓存恢复保护已重新启用。', 'error');
                        return;
                    }
                    switchTab('dashboard', document.querySelector('.nav-item'));
                    showToast('备份数据已验证并成功保存');
                } catch (err) {
                    showToast('导入失败：' + err.message + '；原数据未更改', 'error');
                } finally {
                    event.target.value = '';
                }
            };
            reader.onerror = () => showToast('无法读取所选备份文件；原数据未更改', 'error');
            reader.readAsText(file);
        }

        // ==================== 初始化 ====================
        window.onload = async () => {
            if (!storageRecoveryRequired && Array.isArray(DB.calibrationLogs) && DB.calibrationLogs.length) {
                try {
                    const domain = await import('../../src/domain/index.js?v=20261019-ekpo-readiness-v2');
                    const assetIds = new Set(DB.maintenance.map(asset => labIdKey(asset.id)));
                    const validated = DB.calibrationLogs.map(row => domain.createCalibrationRecord(row));
                    if (validated.some(row => !assetIds.has(labIdKey(row.assetId)))) {
                        throw new Error('校准记录引用了不存在的设备台账');
                    }
                    const certificateReferences = new Set();
                    for (const record of validated) {
                        const reference = JSON.stringify([
                            String(record.assetId), record.organization, record.certificateNo
                        ]);
                        if (certificateReferences.has(reference)) {
                            throw new Error('校准台账包含重复的设备/机构/证书编号组合');
                        }
                        certificateReferences.add(reference);
                    }
                    DB.calibrationLogs = validated;
                } catch (error) {
                    if (cachedLabRaw !== null) {
                        try {
                            localStorage.setItem('lab_management_db_v9_recovery_' + Date.now(), cachedLabRaw);
                        } catch (backupError) {
                            console.error('无法另存损坏校准记录的原始缓存。', backupError);
                        }
                    }
                    storageWarning = true;
                    storageRecoveryRequired = true;
                    showToast('校准台账校验失败，已锁定写入以保护原始数据', 'error');
                    console.error('校准台账无法安全读取。', error);
                }
            }
            if (!storageRecoveryRequired && Array.isArray(DB.experiments) && DB.experiments.length) {
                try {
                    const domain = await import('../../src/domain/index.js?v=20261019-ekpo-readiness-v2');
                    const assetIds = new Set(DB.maintenance.map(asset => String(asset.id)));
                    const experimentIds = new Set();
                    DB.experiments = DB.experiments.map(record => {
                        const validated = domain.validateExperimentRecord(record);
                        if (!assetIds.has(String(validated.assetId))) {
                            throw new Error('实验计划引用了不存在的设备台账: ' + validated.id);
                        }
                        if (experimentIds.has(validated.id)) {
                            throw new Error('实验台账包含重复实验编号: ' + validated.id);
                        }
                        experimentIds.add(validated.id);
                        return validated;
                    });
                } catch (error) {
                    if (cachedLabRaw !== null) {
                        try {
                            localStorage.setItem('lab_management_db_v9_recovery_' + Date.now(), cachedLabRaw);
                        } catch (backupError) {
                            console.error('无法另存损坏实验记录的原始缓存。', backupError);
                        }
                    }
                    storageWarning = true;
                    storageRecoveryRequired = true;
                    DB.experiments = [];
                    showToast('实验生命周期或审计记录校验失败，已锁定写入以保护原始数据', 'error');
                    console.error('实验台账无法安全读取。', error);
                }
            }
            renderDashboard();
            if (demoSeedMigrationNotice) {
                showToast('旧版未修改的内置演示记录已清理；原数据已另存恢复备份。请导入经核验的现场台账。');
            }
            if (storageWarning) showToast('本地缓存损坏或不可用，当前为演示数据；请勿覆盖原始备份', 'error');
        };
    