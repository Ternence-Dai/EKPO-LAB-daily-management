
        // Escape untrusted local/imported text before inserting it into HTML.
        const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g,
            char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
        // ==================== 1. 数据层（兼容升级） ====================
        const defaultData = {
            gases: [
                { id: 1, item: "Hydrogen", spec: "99.999%", supplier: "林德气体", batch: "H2-20260101", month: "2026-01", year: 2026, monthNum: 1, delivery: 182, return: 76, consumption: 106, cost: 9354.70, rent: 19827.58, freight: 3000 },
                { id: 2, item: "Nitrogen", spec: "99.999%", supplier: "林德气体", batch: "N2-20260301", month: "2026-03", year: 2026, monthNum: 3, delivery: 48, return: 12, consumption: 36, cost: 2110.50, rent: 0, freight: 0 },
                { id: 3, item: "Coolant", spec: "乙二醇型", supplier: "3M", batch: "CL-20260501", month: "2026-05", year: 2026, monthNum: 5, delivery: 20, return: 0, consumption: 20, cost: 3000, rent: 0, freight: 500 }
            ],
            maintenance: [
                { id: 1, name: "压力传感器", category: "传感器", location: "氮气房", qty: 17, cycle: "一级保养", freq: "季度", last: "2026-01-01", next: "2026-04-01", responsible: "戴煜", record: "" },
                { id: 2, name: "燃料电池测试台架", category: "实验设备", location: "实验室", qty: 1, cycle: "二级保养", freq: "年度", last: "2026-01-01", next: "2027-01-01", responsible: "戴煜", record: "WAGO模块IO错误" }
            ],
            maintLogs: [
                { id: 1, eqId: 1, date: "2026-01-01", checker: "苏州计量所", operator: "张工", cost: 5000, record: "季度校验，更换密封圈" },
                { id: 2, eqId: 2, date: "2026-01-01", checker: "Moewald", operator: "李工", cost: 20000, record: "年度维保，WAGO模块IO错误修复" }
            ],
            spareParts: [
                { id: 1, category: "PWM Box", desc: "Pulse regulator", catalog: "PWM-001", purpose: "Stack testing", qty: 1, brand: "N", price: 0, location: "cabinet", update: "2026-01-15" },
                { id: 2, category: "Blower", desc: "recirculation", catalog: "BLW-002", purpose: "Stack testing", qty: 2, brand: "Pierburg", price: 160000, location: "cabinet", update: "2026-01-10" }
            ],
            spareLogs: [
                { id: 1, partId: 1, date: "2026-01-15", action: "入库", qty: 1, operator: "戴煜", note: "新购备件入库" }
            ],
            testDiary: [
                { id: 1, start: "2026-01-11", end: "2026-01-12", duration: 2, unit: "NM12-245-359", operator: "Terrence", sap: "Ok", result: "Ok", cycle: "210923_PHT_V07.04", error: "DP Air inlet&outlet too low", errorDesc: "气动阀组故障" }
            ]
        };

        // Guard browser storage access: a blocked/corrupt cache must not prevent the lab app from opening.
        let DB;
        let storageWarning = false;
        // Never let fallback demo records overwrite an unreadable or malformed user cache.
        let storageRecoveryRequired = false;
        let cachedLabRaw = null;
        try {
            cachedLabRaw = localStorage.getItem('lab_management_db_v9');
            DB = cachedLabRaw ? JSON.parse(cachedLabRaw) : JSON.parse(JSON.stringify(defaultData));
            if (!DB || !Array.isArray(DB.gases) || !Array.isArray(DB.maintenance) ||
                !Array.isArray(DB.spareParts) || !Array.isArray(DB.testDiary)) {
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
            DB = JSON.parse(JSON.stringify(defaultData));
            storageWarning = true;
            storageRecoveryRequired = true;
        }
        
        // 兼容旧版本数据升级
        if (!DB.maintLogs) DB.maintLogs = [];
        if (!DB.spareLogs) DB.spareLogs = [];
        // 如果存在旧格式的 gases（没有 year），进行转换
        DB.gases.forEach(g => {
            if (!g.year && g.month) {
                g.year = parseInt(g.month.split('-')[0]);
                g.monthNum = parseInt(g.month.split('-')[1]);
            }
        });

        let fileHandle = null;

        async function saveToLocal() {
            if (storageRecoveryRequired) {
                storageWarning = true;
                showToast('检测到原实验室缓存异常，已阻止演示数据覆盖；请先导入有效 JSON 备份。', 'error');
                const status = document.getElementById('saveText');
                if (status) status.innerText = '缓存待恢复 · 自动保存已锁定';
                return false;
            }
            let localSaved = false;
            try {
                localStorage.setItem('lab_management_db_v9', JSON.stringify(DB));
                storageWarning = false;
                localSaved = true;
            } catch (storageError) {
                storageWarning = true;
                console.error('浏览器缓存保存失败；请立即导出 JSON 备份。', storageError);
                showToast('浏览器缓存不可用，修改尚未可靠保存；请立即导出备份。', 'error');
                const status = document.getElementById('saveText');
                if (status) status.innerText = '浏览器缓存保存失败 · 请导出备份';
            }
            if (fileHandle) {
                try {
                    const writable = await fileHandle.createWritable();
                    await writable.write(JSON.stringify(DB, null, 2));
                    await writable.close();
                    document.getElementById('saveText').innerText = localSaved
                        ? '本地硬盘实时保存中...'
                        : '本地文件已保存 · 浏览器缓存仍失败';
                } catch (err) {
                    console.error(err);
                    document.getElementById('saveText').innerText = '写入本地文件失败';
                }
            } else if (localSaved) {
                document.getElementById('saveText').innerText = '浏览器缓存自动保存中...';
            } else {
                document.getElementById('saveText').innerText = '浏览器缓存保存失败 · 请导出备份';
            }
            return localSaved;
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
        function initChart(domId) { let dom = document.getElementById(domId); if (!dom) return null; let chart = echarts.getInstanceByDom(dom); if (!chart) chart = echarts.init(dom); return chart; }

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
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            if (element) element.classList.add('active');
            
            const titles = { dashboard: "总览仪表盘", gases: "气体使用记录", maintenance: "设备维保管理", spareParts: "备件库存管理", testDiary: "测试台运行日志", yearly: "年度综合统计", system: "系统全量设置" };
            document.getElementById('pageTitle').innerText = titles[tabId];
            
            setTimeout(() => {
                if (tabId === 'dashboard') renderDashboard();
                if (tabId === 'gases') { generateYearOptions('g-year'); generateMonthOptions('g-month'); renderYearFilter(); renderGases(); }
                if (tabId === 'maintenance') { generateYearOptions('ml-year'); renderMaintenance(); }
                if (tabId === 'spareParts') { renderSpareParts(); }
                if (tabId === 'testDiary') renderTestDiary();
                if (tabId === 'yearly') { renderYearlyFilter(); renderYearly(); }
                if (tabId === 'system') renderSystem();
            }, 50);
        }

        function switchSubTab(parent, sub) {
            if (parent === 'maint') {
                document.getElementById('maint-eq-view').classList.add('hidden');
                document.getElementById('maint-log-view').classList.add('hidden');
                document.getElementById('tab-maint-eq').classList.remove('active');
                document.getElementById('tab-maint-log').classList.remove('active');
                if (sub === 'eq') { document.getElementById('maint-eq-view').classList.remove('hidden'); document.getElementById('tab-maint-eq').classList.add('active'); renderMaintenance(); }
                if (sub === 'log') { document.getElementById('maint-log-view').classList.remove('hidden'); document.getElementById('tab-maint-log').classList.add('active'); renderMaintLogs(); }
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
                fileHandle = await window.showSaveFilePicker({
                    suggestedName: `燃料电池实验室数据_${getToday()}.json`,
                    types: [{ description: 'JSON 数据文件', accept: { 'application/json': ['.json'] } }],
                });
                document.getElementById('saveDot').classList.add('active');
                document.getElementById('saveText').innerText = '本地硬盘实时保存已开启！';
                showToast('本地实时保存已开启！');
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(DB, null, 2));
                await writable.close();
            } catch (err) { if (err.name !== 'AbortError') showToast('开启失败: ' + err.message, 'error'); }
        }

        // ==================== 5. 仪表盘渲染 ====================
        function renderDashboard() {
            let totalGasCost = DB.gases.reduce((sum, g) => sum + (Number(g.cost) || 0) + (Number(g.rent) || 0) + (Number(g.freight) || 0), 0);
            let totalMaintCost = DB.maintLogs.reduce((sum, m) => sum + (Number(m.cost) || 0), 0);
            let totalSpareCost = DB.spareParts.reduce((sum, s) => sum + ((Number(s.qty) || 0) * (Number(s.price) || 0)), 0);
            let testErrors = DB.testDiary.filter(t => t.error && t.error.trim() !== '').length;

            document.getElementById('dash-gas').innerText = '¥' + totalGasCost.toLocaleString();
            document.getElementById('dash-maint-cost').innerText = '¥' + totalMaintCost.toLocaleString();
            document.getElementById('dash-spare-cost').innerText = '¥' + totalSpareCost.toLocaleString();
            document.getElementById('dash-test').innerText = testErrors + ' 次';

            let treemapChart = initChart('chart-dash-treemap');
            if(treemapChart) {
                treemapChart.setOption({
                    tooltip: { formatter: '{b}: ¥{c}' },
                    series: [{
                        type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false },
                        data: [
                            { name: '气体费用', value: totalGasCost || 1 },
                            { name: '维保费用', value: totalMaintCost || 1 },
                            
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
            alertList.innerHTML = alerts.length === 0 ? '<li>✅ 当前无待处理事项</li>' : alerts.map(a => `<li>${esc(a)}</li>`).join('');
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
        function saveGas() {
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
            if (id) {
                const i = DB.gases.findIndex(x => String(x.id) === String(id));
                if (i < 0) { showToast('原气体记录已不存在，请刷新后重试', 'error'); return; }
                DB.gases[i] = { ...DB.gases[i], ...data }; showToast('已更新');
            } else { data.id = Date.now(); DB.gases.push(data); showToast('已新增'); }
            saveToLocal(); closeModal('modal-gas'); renderGases();
        }

        // ==================== 7. 维保管理 ====================
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
            const eq = DB.maintenance.find(item => item.id === eqId);
            if (!eq) return false;
            const logs = DB.maintLogs.filter(log => log.eqId === eqId && isValidDateOnly(log.date));
            if (!logs.length) return false;
            logs.sort((a, b) => a.date.localeCompare(b.date));
            const latest = logs[logs.length - 1];
            eq.last = latest.date;
            const months = maintenanceIntervalMonths(eq.freq);
            // Unknown/custom frequencies must be scheduled manually; never assume annual.
            eq.next = months ? addCalendarMonths(latest.date, months) : '';
            return true;
        }

        function renderMaintenance() {
            let search = document.getElementById('search-maint').value.toLowerCase();
            let tbody = document.querySelector('#table-maintenance tbody'); tbody.innerHTML = '';
            let filtered = DB.maintenance.filter(m => (m.name||'').toLowerCase().includes(search) || (m.category||'').toLowerCase().includes(search));
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            filtered.forEach(m => {
                let totalCost = DB.maintLogs.filter(l => l.eqId === m.id).reduce((sum, l) => sum + (Number(l.cost) || 0), 0);
                const dueDate = m.next ? new Date(m.next + 'T00:00:00') : null;
                const days = dueDate && Number.isFinite(dueDate.getTime())
                    ? Math.round((dueDate - today) / 86400000) : null;
                let badge = days === null ? '<span class="badge badge-normal">未设置日期</span>'
                    : days < 0 ? '<span class="badge badge-danger">已逾期</span>'
                    : days <= 30 ? '<span class="badge badge-warning">即将到期</span>'
                    : '<span class="badge badge-success">正常</span>';
                tbody.innerHTML += `<tr>
                    <td><strong>${esc(m.name||'')}</strong></td><td>${esc(m.category||'')}</td><td>${esc(m.location||'')}</td><td>${esc(m.qty||0)}</td><td>${esc(m.cycle||'')}</td><td>${esc(m.freq||'')}</td>
                    <td>${esc(m.last || '-')}</td><td>${esc(m.next || '-')} ${badge}</td><td><strong>¥${totalCost.toLocaleString()}</strong></td><td>${esc(m.responsible||'')}</td>
                    <td><button class="btn btn-outline btn-sm" onclick="editMaint(${Number(m.id)})">编辑</button><button class="btn btn-danger btn-sm" onclick="deleteItem('maintenance', ${Number(m.id)})">删除</button></td>
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
                let eq = DB.maintenance.find(m => m.id === l.eqId);
                tbody.innerHTML += `<tr>
                    <td>${esc(l.date)}</td><td><strong>${esc(eq ? eq.name : '未知设备')}</strong></td><td>${esc(l.checker||'')}</td><td>${esc(l.operator||'')}</td><td>¥${(l.cost||0).toLocaleString()}</td><td>${esc(l.record||'')}</td>
                    <td><button class="btn btn-outline btn-sm" onclick="editMaintLog(${Number(l.id)})">编辑</button><button class="btn btn-danger btn-sm" onclick="deleteItem('maintLogs', ${Number(l.id)})">删除</button></td>
                </tr>`;
            });
        }

        function editMaint(id) { let m = DB.maintenance.find(x => x.id === id); document.getElementById('m-id').value=m.id; document.getElementById('m-name').value=m.name||''; document.getElementById('m-category').value=m.category||''; document.getElementById('m-location').value=m.location||''; document.getElementById('m-qty').value=m.qty||0; document.getElementById('m-cycle').value=m.cycle||'一级保养'; document.getElementById('m-freq').value=m.freq||''; document.getElementById('m-last').value=m.last||''; document.getElementById('m-next').value=m.next||''; document.getElementById('m-responsible').value=m.responsible||''; document.getElementById('m-record').value=m.record||''; openModal('modal-maint'); }
        function saveMaint() { let id=document.getElementById('m-id').value; let data={name:document.getElementById('m-name').value, category:document.getElementById('m-category').value, location:document.getElementById('m-location').value, qty:+document.getElementById('m-qty').value, cycle:document.getElementById('m-cycle').value, freq:document.getElementById('m-freq').value, last:document.getElementById('m-last').value, next:document.getElementById('m-next').value, responsible:document.getElementById('m-responsible').value, record:document.getElementById('m-record').value}; if(id){let i=DB.maintenance.findIndex(x=>x.id==id); DB.maintenance[i]={...DB.maintenance[i],...data}; showToast('已更新');}else{data.id=Date.now(); DB.maintenance.push(data); showToast('已新增');} saveToLocal(); closeModal('modal-maint'); renderMaintenance(); }

        function editMaintLog(id) {
            let l = DB.maintLogs.find(x => x.id === id);
            // 动态生成设备下拉框
            let eqSelect = document.getElementById('ml-eq');
            eqSelect.innerHTML = DB.maintenance.map(m => `<option value="${Number(m.id)}">${esc(m.name)}</option>`).join('');
            document.getElementById('ml-id').value = l.id;
            document.getElementById('ml-eq').value = l.eqId;
            document.getElementById('ml-date').value = l.date;
            document.getElementById('ml-checker').value = l.checker;
            document.getElementById('ml-operator').value = l.operator;
            document.getElementById('ml-cost').value = l.cost;
            document.getElementById('ml-record').value = l.record;
            openModal('modal-maint-log');
        }
        function saveMaintLog() {
            const id = document.getElementById('ml-id').value;
            const eqId = Number(document.getElementById('ml-eq').value);
            const date = document.getElementById('ml-date').value;
            const costRaw = document.getElementById('ml-cost').value;
            const cost = costRaw === '' ? 0 : Number(costRaw);
            if (!DB.maintenance.some(item => item.id === eqId)) {
                showToast('请选择有效的设备台账记录', 'error'); return;
            }
            if (!isValidDateOnly(date)) { showToast('维保日期无效', 'error'); return; }
            if (!Number.isFinite(cost) || cost < 0) { showToast('维保费用必须是大于或等于 0 的有效数字', 'error'); return; }
            const data = { eqId, date, checker: document.getElementById('ml-checker').value,
                operator: document.getElementById('ml-operator').value, cost,
                record: document.getElementById('ml-record').value };
            let previousEqId = null;
            if (id) {
                const i = DB.maintLogs.findIndex(x => String(x.id) === String(id));
                if (i < 0) { showToast('原维保记录已不存在，请刷新后重试', 'error'); return; }
                previousEqId = DB.maintLogs[i].eqId;
                DB.maintLogs[i] = { ...DB.maintLogs[i], ...data };
                showToast('维保记录已更新');
            } else {
                data.id = Date.now(); DB.maintLogs.push(data); showToast('维保记录已新增');
            }
            if (previousEqId !== null && previousEqId !== eqId) syncMaintenanceSchedule(previousEqId);
            syncMaintenanceSchedule(eqId);
            saveToLocal(); closeModal('modal-maint-log'); renderMaintenance(); renderMaintLogs();
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
                    <td><button class="btn btn-outline btn-sm" onclick="editSpare(${Number(s.id)})">编辑</button><button class="btn btn-danger btn-sm" onclick="deleteItem('spareParts', ${Number(s.id)})">删除</button></td>
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
                let part = DB.spareParts.find(p => p.id === l.partId);
                let badge = l.action === '入库' ? '<span class="badge badge-success">入库</span>' : '<span class="badge badge-danger">出库</span>';
                tbody.innerHTML += `<tr>
                    <td>${esc(l.date)}</td><td><strong>${esc(part ? part.desc : '未知备件')}</strong></td><td>${badge}</td><td>${esc(l.qty)}</td><td>${esc(l.operator||'')}</td><td>${esc(l.note||'')}</td>
                    <td><button class="btn btn-danger btn-sm" onclick="deleteItem('spareLogs', ${Number(l.id)})">删除</button></td>
                </tr>`;
            });
        }

        function editSpare(id) { let s = DB.spareParts.find(x => x.id === id); document.getElementById('s-id').value=s.id; document.getElementById('s-category').value=s.category||''; document.getElementById('s-desc').value=s.desc||''; document.getElementById('s-catalog').value=s.catalog||''; document.getElementById('s-purpose').value=s.purpose||''; document.getElementById('s-qty').value=s.qty||0; document.getElementById('s-brand').value=s.brand||''; document.getElementById('s-price').value=s.price||0; document.getElementById('s-location').value=s.location||''; document.getElementById('s-update').value=s.update||''; openModal('modal-spare'); }
        function saveSpare() { let id=document.getElementById('s-id').value; let update=document.getElementById('s-update').value || getToday(); let data={category:document.getElementById('s-category').value, desc:document.getElementById('s-desc').value, catalog:document.getElementById('s-catalog').value, purpose:document.getElementById('s-purpose').value, qty:+document.getElementById('s-qty').value, brand:document.getElementById('s-brand').value, price:+document.getElementById('s-price').value, location:document.getElementById('s-location').value, update:update}; if(id){let i=DB.spareParts.findIndex(x=>x.id==id); DB.spareParts[i]={...DB.spareParts[i],...data}; showToast('已更新');}else{data.id=Date.now(); DB.spareParts.push(data); showToast('已新增');} saveToLocal(); closeModal('modal-spare'); renderSpareParts(); }

        function saveSpareLog() {
            const partId = Number(document.getElementById('sl-part').value);
            const action = document.getElementById('sl-action').value;
            const qtyRaw = document.getElementById('sl-qty').value;
            const qty = qtyRaw === '' ? NaN : Number(qtyRaw);
            const date = document.getElementById('sl-date').value;
            const part = DB.spareParts.find(p => p.id === partId);
            if (!part) { showToast('请选择有效的备件记录', 'error'); return; }
            if (!['入库', '出库'].includes(action)) { showToast('请选择有效的出入库类型', 'error'); return; }
            if (!Number.isFinite(qty) || qty <= 0) { showToast('出入库数量必须是大于 0 的有效数字', 'error'); return; }
            if (!isValidDateOnly(date)) { showToast('出入库日期无效', 'error'); return; }
            const currentQty = Number(part.qty);
            if (!Number.isFinite(currentQty) || currentQty < 0) { showToast('当前库存数据异常，请先核对库存台账', 'error'); return; }
            if (action === '出库' && qty > currentQty) {
                showToast('出库数量超过当前库存，已阻止本次出库', 'error'); return;
            }
            const data = { partId, date, action, qty, operator: document.getElementById('sl-operator').value,
                note: document.getElementById('sl-note').value, id: Date.now() };
            // Validate first, then atomically append the ledger entry and update stock.
            part.qty = action === '入库' ? currentQty + qty : currentQty - qty;
            part.update = date;
            DB.spareLogs.push(data);
            saveToLocal(); closeModal('modal-spare-log'); renderSpareParts();
            if (!document.getElementById('spare-log-view').classList.contains('hidden')) renderSpareLogs();
            showToast('流水已保存，库存已更新');
        }

        // ==================== 9. 测试台日志 ====================
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
                    const start = new Date(t.start).getTime();
                    const end = new Date(t.end).getTime();
                    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
                    // Keep the category index as the first value for the custom series.
                    return { name: t.unit + '-' + t.start, value: [index, start, end], itemStyle: { color: '#f59e0b' } };
                }).filter(Boolean);
                if (!data.length) { timeChart.clear(); return; }
                timeChart.setOption({
                    tooltip: { formatter: p => `${p.name}<br/>开始: ${new Date(p.value[0]).toLocaleDateString()}<br/>结束: ${new Date(p.value[1]).toLocaleDateString()}` },
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
        function editTestDiary(id) { let t = DB.testDiary.find(x => x.id === id); document.getElementById('t-id').value=t.id; document.getElementById('t-start').value=t.start||''; document.getElementById('t-end').value=t.end||''; document.getElementById('t-duration').value=t.duration||0; document.getElementById('t-unit').value=t.unit||''; document.getElementById('t-operator').value=t.operator||''; document.getElementById('t-sap').value=t.sap||''; document.getElementById('t-result').value=t.result||''; document.getElementById('t-cycle').value=t.cycle||''; document.getElementById('t-error').value=t.error||''; document.getElementById('t-errorDesc').value=t.errorDesc||''; openModal('modal-testDiary'); }
        function saveTestDiary() { let id=document.getElementById('t-id').value; let data={start:document.getElementById('t-start').value, end:document.getElementById('t-end').value, duration:+document.getElementById('t-duration').value, unit:document.getElementById('t-unit').value, operator:document.getElementById('t-operator').value, sap:document.getElementById('t-sap').value, result:document.getElementById('t-result').value, cycle:document.getElementById('t-cycle').value, error:document.getElementById('t-error').value, errorDesc:document.getElementById('t-errorDesc').value}; if(id){let i=DB.testDiary.findIndex(x=>x.id==id); DB.testDiary[i]={...DB.testDiary[i],...data}; showToast('已更新');}else{data.id=Date.now(); DB.testDiary.push(data); showToast('已新增');} saveToLocal(); closeModal('modal-testDiary'); renderTestDiary(); }

        // ==================== 10. 年度综合统计 ====================
        function renderYearlyFilter() {
            let select = document.getElementById('filter-yearly-year');
            if (select.options.length <= 1) {
                let years = new Set();
                DB.gases.forEach(g => years.add(g.year));
                DB.maintLogs.forEach(l => years.add(new Date(l.date).getFullYear()));
                DB.spareLogs.forEach(l => years.add(new Date(l.date).getFullYear()));
                DB.testDiary.forEach(t => years.add(new Date(t.start).getFullYear()));
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
            let totalHours = DB.testDiary.filter(t => yearFilter(new Date(t.start).getFullYear())).reduce((sum, t) => sum + (Number(t.duration) || 0), 0);
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
                <tr><td>测试台日志</td><td>总运行时长 / 故障次数</td><td>${totalHours} h / ${DB.testDiary.filter(t => yearFilter(new Date(t.start).getFullYear()) && t.error).length} 次</td></tr>
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
                partSelect.innerHTML = DB.spareParts.map(p => `<option value="${Number(p.id)}">${esc(p.desc)}</option>`).join('');
                openModal('modal-spare-log');
            }
            if (table === 'testDiary') openModal('modal-testDiary'); 
        }

        // ==================== 12. 导出与删除 ====================
        async function deleteItem(table, id) {
            if (!confirm('确认删除这条记录吗？')) return;
            const rows = DB[table];
            if (!Array.isArray(rows)) { showToast('数据表不存在，无法删除', 'error'); return; }
            const target = rows.find(item => String(item.id) === String(id));
            if (!target) { showToast('记录不存在或已被删除', 'error'); return; }
            if (table === 'maintenance' && DB.maintLogs.some(item => String(item.eqId) === String(id))) {
                showToast('该设备仍有关联维保历史，请先处理历史记录后再删除', 'error'); return;
            }
            if (table === 'spareParts' && DB.spareLogs.some(item => String(item.partId) === String(id))) {
                showToast('该备件仍有关联出入库流水，请先处理流水后再删除', 'error'); return;
            }
            if (table === 'spareLogs') {
                const part = DB.spareParts.find(item => String(item.id) === String(target.partId));
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
                part.qty = nextQty;
            }
            const affectedMaintenanceIds = table === 'maintLogs'
                ? [...new Set(DB.maintLogs.filter(item => String(item.id) === String(id)).map(item => item.eqId))] : [];
            DB[table] = rows.filter(item => String(item.id) !== String(id));
            if (table === 'maintLogs') affectedMaintenanceIds.forEach(syncMaintenanceSchedule);
            await saveToLocal();
            if (table === 'gases') renderGases();
            if (table === 'maintLogs') { renderMaintenance(); renderMaintLogs(); }
            if (table === 'maintenance') renderMaintenance();
            if (table === 'spareParts') renderSpareParts();
            if (table === 'spareLogs') { renderSpareParts(); renderSpareLogs(); }
            if (table === 'testDiary') renderTestDiary();
            showToast('删除成功');
        }
        function exportAllToJSON() {
            let dataStr = JSON.stringify(DB, null, 2);
            let blob = new Blob([dataStr], { type: 'application/json' });
            let url = URL.createObjectURL(blob);
            let a = document.createElement('a'); a.href = url; a.download = `燃料电池实验室数据备份_${getToday()}.json`; a.click();
            showToast('数据已保存到本地磁盘！');
        }
        function exportAllToExcel() {
            let wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.gases), "气体使用记录");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.maintenance), "设备维保台账");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.maintLogs), "维保历史记录");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.spareParts), "备件库存台账");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.spareLogs), "备件出入库流水");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.testDiary), "测试台运行日志");
            XLSX.writeFile(wb, `燃料电池实验室数据报表_${getToday()}.xlsx`);
            showToast('Excel报表已导出！');
        }
        function importFromLocal(event) {
            let file = event.target.files[0]; if (!file) return;
            let reader = new FileReader();
            reader.onload = function(e) {
                try {
                    let imported = JSON.parse(e.target.result);
                    if (imported && Array.isArray(imported.gases) && Array.isArray(imported.maintenance) &&
                        Array.isArray(imported.spareParts) && Array.isArray(imported.testDiary) &&
                        (imported.maintLogs == null || Array.isArray(imported.maintLogs)) &&
                        (imported.spareLogs == null || Array.isArray(imported.spareLogs))) {
                        DB = imported;
                        storageRecoveryRequired = false;
                        if (!DB.maintLogs) DB.maintLogs = [];
                        if (!DB.spareLogs) DB.spareLogs = [];
                        saveToLocal(); showToast('数据导入成功！'); switchTab('dashboard', document.querySelector('.nav-item'));
                    } else { showToast('文件格式不正确', 'error'); }
                } catch (err) { showToast('读取文件失败', 'error'); }
            };
            reader.readAsText(file);
        }

        // ==================== 初始化 ====================
        window.onload = () => {
            renderDashboard();
            if (storageWarning) showToast('本地缓存损坏或不可用，当前为演示数据；请勿覆盖原始备份', 'error');
        };
    