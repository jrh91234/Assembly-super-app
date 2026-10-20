// js/cost.js — Cost Management Module (Admin Only) v1.1
(function () {
    'use strict';

    let costData = [];
    let dlStaffData = [];
    let costChartInstances = {};

    const COST_FIELDS = [
        { key: 'Sale', label: 'Sale', group: 'sale' },
        { key: 'RM', label: 'RM', group: 'rm' },
        { key: 'Sub_Con', label: 'Sub con', group: 'rm' },
        { key: 'DL', label: 'DL', group: 'dl' },
        { key: 'OT', label: 'OT', group: 'dl' },
        { key: 'DL_Sup', label: 'DL sup&mini MD', group: 'dl' },
        { key: 'OT_Sup', label: 'OT sup&mini MD', group: 'dl' },
        { key: 'Utilities', label: 'Utilities', group: 'ohvc' },
        { key: 'Subcontract', label: 'Subcontract', group: 'ohvc' },
        { key: 'Accessories', label: 'Accessories', group: 'ohvc' },
        { key: 'Repair', label: 'Repair', group: 'ohvc' },
        { key: 'Other_OH', label: 'Other', group: 'ohvc' },
        { key: 'OH_FC', label: 'OH FC', group: 'ohfc' },
        { key: 'Transportation', label: 'Transportation', group: 'sell' },
        { key: 'Selling_Other', label: 'Selling อื่นๆ', group: 'sell' },
        { key: 'Staff_Admin', label: 'Staff (Admin)', group: 'admin' },
        { key: 'Admin_Other', label: 'Admin อื่นๆ', group: 'admin' },
        { key: 'Other_Income', label: 'Other income', group: 'other' },
        { key: 'Bonus_Admin', label: 'Extra Bonus-Admin', group: 'other' },
        { key: 'Bonus_OH', label: 'Extra Bonus-OH', group: 'other' },
        { key: 'Mgt_Bonus', label: 'Mgt Bonus', group: 'other' },
        { key: 'Extra', label: 'Extra', group: 'other' },
        { key: 'Interest', label: 'Interest', group: 'fin' },
        { key: 'Tax', label: 'Tax', group: 'fin' },
        { key: 'Depre', label: 'Depreciation', group: 'fin' }
    ];

    function v(row, key) { return parseFloat(row[key]) || 0; }

    function calc(row) {
        const sale = v(row, 'Sale');
        const rm = v(row, 'RM') + v(row, 'Sub_Con');
        const dl = v(row, 'DL') + v(row, 'OT') + v(row, 'DL_Sup') + v(row, 'OT_Sup');
        const ohvc = v(row, 'Utilities') + v(row, 'Subcontract') + v(row, 'Accessories') + v(row, 'Repair') + v(row, 'Other_OH');
        const ohfc = v(row, 'OH_FC');
        const cogs = rm + dl + ohvc + ohfc;
        const grossProfit = sale - cogs;
        const sellVC = v(row, 'Transportation') + v(row, 'Selling_Other');
        const adminFC = v(row, 'Staff_Admin') + v(row, 'Admin_Other');
        const sga = sellVC + adminFC;
        const profit = grossProfit - sga;
        const otherInc = v(row, 'Other_Income');
        const bonuses = v(row, 'Bonus_Admin') + v(row, 'Bonus_OH') + v(row, 'Mgt_Bonus') + v(row, 'Extra');
        const ebit = profit + otherInc - bonuses;
        const interest = v(row, 'Interest');
        const tax = v(row, 'Tax');
        const eat = ebit - interest - tax;
        const depre = v(row, 'Depre');
        const ebitda = eat + depre + interest + tax;
        const pct = (val) => sale > 0 ? ((val / sale) * 100).toFixed(1) : '0.0';
        return { sale, rm, dl, ohvc, ohfc, cogs, grossProfit, sellVC, adminFC, sga, profit, otherInc, bonuses, ebit, interest, tax, eat, depre, ebitda, pct };
    }

    function fmt(n) {
        if (n < 0) return '(' + Math.abs(n).toFixed(1) + ')';
        return n.toFixed(1);
    }

    function pctClass(val) {
        if (val.startsWith('-')) return 'text-red-600';
        return '';
    }

    window.loadCostModule = async function () {
        const container = document.getElementById('cost-content');
        if (!container) return;

        container.innerHTML = `<div class="flex items-center justify-center py-20"><div class="text-4xl animate-spin">💰</div><div class="ml-4 text-lg text-gray-600">กำลังโหลดข้อมูลต้นทุน...</div></div>`;

        try {
            const [costRes, dlRes] = await Promise.all([
                fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'GET_COST_DATA' }) }),
                fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'GET_DL_STAFF' }) })
            ]);
            const costJson = await costRes.json();
            const dlJson = await dlRes.json();
            costData = (costJson.data || []).sort((a, b) => String(a.Month || '').localeCompare(String(b.Month || '')));
            dlStaffData = dlJson.data || [];
        } catch (e) {
            costData = [];
            dlStaffData = [];
        }

        renderCostPage(container);
    };

    function renderCostPage(container) {
        const months = costData.map(d => String(d.Month || ''));
        const latestMonth = months.length > 0 ? months[months.length - 1] : '';

        container.innerHTML = `
            <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-4">
                <h2 class="text-xl font-bold text-gray-800">💰 บริหารต้นทุน (Cost Management)</h2>
                <div class="flex gap-2 flex-wrap">
                    <select id="cost-month-select" class="border rounded-lg px-3 py-2 text-sm" onchange="window.costSelectMonth(this.value)">
                        ${months.map(m => `<option value="${m}" ${m === latestMonth ? 'selected' : ''}>${m}</option>`).join('')}
                        ${months.length === 0 ? '<option value="">-- ไม่มีข้อมูล --</option>' : ''}
                    </select>
                    <button onclick="window.openCostForm()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700">➕ เพิ่ม/แก้ไขข้อมูล</button>
                </div>
            </div>

            <div id="cost-pl-table"></div>

            <div id="cost-dl-staff-section" class="mt-6"></div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
                <div class="bg-white rounded-xl shadow-sm border p-4">
                    <h3 class="text-sm font-bold text-gray-700 mb-2">โครงสร้างต้นทุน (% of Sale)</h3>
                    <div class="relative" style="height:300px"><canvas id="cost-pie-chart"></canvas></div>
                </div>
                <div class="bg-white rounded-xl shadow-sm border p-4">
                    <div class="flex justify-between items-center mb-2 gap-2 flex-wrap">
                        <h3 class="text-sm font-bold text-gray-700">แนวโน้มต้นทุน / กำไร</h3>
                        <div class="chart-period-switch" data-period-chart="costTrend" data-periods="month,quarter,year"></div>
                    </div>
                    <div class="relative" style="height:300px"><canvas id="cost-trend-chart"></canvas></div>
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-sm border p-4 mt-4">
                <h3 class="text-sm font-bold text-gray-700 mb-2">Waterfall: Sale → EAT</h3>
                <div class="relative" style="height:320px"><canvas id="cost-waterfall-chart"></canvas></div>
            </div>
        `;

        if (window.renderPeriodSwitches) window.renderPeriodSwitches(container);
        renderPLTable(latestMonth);
        renderDLStaffSection();
        renderCharts(latestMonth);
    }

    window.costSelectMonth = function (month) {
        renderPLTable(month);
        renderCharts(month);
    };

    function renderPLTable(month) {
        const el = document.getElementById('cost-pl-table');
        if (!el) return;
        const row = costData.find(d => String(d.Month) === month);
        if (!row) { el.innerHTML = '<div class="text-center text-gray-400 py-8">ไม่มีข้อมูลเดือนที่เลือก</div>'; return; }

        const c = calc(row);
        const p = c.pct;
        const monthLabel = month || '-';

        const headerBg = 'bg-blue-800 text-white';
        const groupBg = 'bg-blue-50 font-bold text-blue-900';
        const subRow = 'text-gray-500 text-sm';
        const totalBg = 'bg-blue-900 text-white font-bold';
        const profitBg = (val) => val >= 0 ? 'bg-green-100 text-green-800 font-bold' : 'bg-red-100 text-red-800 font-bold';
        const pctBadge = (val, threshold) => {
            const num = parseFloat(val);
            if (threshold && num > threshold) return `<span class="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold ml-1">OVER ${threshold}%</span>`;
            return '';
        };

        el.innerHTML = `
        <div class="bg-white rounded-xl shadow-sm border overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr class="${headerBg}">
                        <th class="text-left p-3 w-1/2">บริษัท A (Sale)</th>
                        <th class="text-center p-3" colspan="2">${monthLabel}</th>
                    </tr>
                    <tr class="bg-gray-100 text-gray-600 text-xs">
                        <th class="text-left p-2"></th>
                        <th class="text-right p-2 w-28">Actual</th>
                        <th class="text-right p-2 w-20">%</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="${groupBg}"><td class="p-2">Sale</td><td class="text-right p-2 font-bold">${fmt(c.sale)}</td><td class="text-right p-2">100%</td></tr>

                    <tr class="${groupBg} border-t"><td class="p-2">RM</td><td class="text-right p-2">${fmt(c.rm)}</td><td class="text-right p-2">${p(c.rm)}% ${pctBadge(p(c.rm), 70)}</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-8">RM</td><td class="text-right p-2">${fmt(v(row,'RM'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'RM'))}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-8">Sub con</td><td class="text-right p-2">${fmt(v(row,'Sub_Con'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'Sub_Con'))}%</td></tr>

                    <tr class="${groupBg} border-t"><td class="p-2">DL, OT</td><td class="text-right p-2">${fmt(c.dl)}</td><td class="text-right p-2">${p(c.dl)}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-8">DL</td><td class="text-right p-2">${fmt(v(row,'DL'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'DL'))}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-8">OT</td><td class="text-right p-2">${fmt(v(row,'OT'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'OT'))}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-8">DL sup&mini MD</td><td class="text-right p-2">${fmt(v(row,'DL_Sup'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'DL_Sup'))}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-8">OT sup&mini MD</td><td class="text-right p-2">${fmt(v(row,'OT_Sup'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'OT_Sup'))}%</td></tr>

                    <tr class="${groupBg} border-t"><td class="p-2">OH VC</td><td class="text-right p-2">${fmt(c.ohvc)}</td><td class="text-right p-2">${p(c.ohvc)}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-8">Utilities</td><td class="text-right p-2">${fmt(v(row,'Utilities'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'Utilities'))}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-8">Subcontract</td><td class="text-right p-2">${fmt(v(row,'Subcontract'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'Subcontract'))}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-8">Accessories</td><td class="text-right p-2">${fmt(v(row,'Accessories'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'Accessories'))}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-8">Repair</td><td class="text-right p-2">${fmt(v(row,'Repair'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'Repair'))}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-8">Other</td><td class="text-right p-2">${fmt(v(row,'Other_OH'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'Other_OH'))}%</td></tr>

                    <tr class="${groupBg} border-t"><td class="p-2">OH FC</td><td class="text-right p-2">${fmt(c.ohfc)}</td><td class="text-right p-2">${p(c.ohfc)}%</td></tr>

                    <tr class="${totalBg} border-t-2"><td class="p-3">COGS</td><td class="text-right p-3">${fmt(c.cogs)}</td><td class="text-right p-3">${p(c.cogs)}%</td></tr>
                    <tr class="${profitBg(c.grossProfit)}"><td class="p-3">Gross Profit</td><td class="text-right p-3">${fmt(c.grossProfit)}</td><td class="text-right p-3">${p(c.grossProfit)}%</td></tr>

                    <tr class="${groupBg} border-t"><td class="p-2">Selling VC</td><td class="text-right p-2">${fmt(c.sellVC)}</td><td class="text-right p-2">${p(c.sellVC)}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-8">Transportation</td><td class="text-right p-2">${fmt(v(row,'Transportation'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'Transportation'))}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-8">อื่นๆ</td><td class="text-right p-2">${fmt(v(row,'Selling_Other'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'Selling_Other'))}%</td></tr>

                    <tr class="${groupBg} border-t"><td class="p-2">Admin FC</td><td class="text-right p-2">${fmt(c.adminFC)}</td><td class="text-right p-2">${p(c.adminFC)}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-8">Staff (Admin)</td><td class="text-right p-2">${fmt(v(row,'Staff_Admin'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'Staff_Admin'))}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-8">อื่นๆ</td><td class="text-right p-2">${fmt(v(row,'Admin_Other'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'Admin_Other'))}%</td></tr>

                    <tr class="${totalBg}"><td class="p-3">SG & A</td><td class="text-right p-3">${fmt(c.sga)}</td><td class="text-right p-3">${p(c.sga)}%</td></tr>
                    <tr class="${profitBg(c.profit)} border-t-2"><td class="p-3">Profit</td><td class="text-right p-3 text-lg">${fmt(c.profit)}</td><td class="text-right p-3">${p(c.profit)}%</td></tr>

                    <tr class="${subRow} border-t"><td class="p-2 pl-4">Other income</td><td class="text-right p-2">${fmt(v(row,'Other_Income'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'Other_Income'))}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-4">Extra Bonus-Admin</td><td class="text-right p-2">${fmt(-v(row,'Bonus_Admin'))}</td><td class="text-right p-2 text-gray-400">${v(row,'Bonus_Admin') > 0 ? '-' : ''}${p(v(row,'Bonus_Admin'))}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-4">Extra Bonus-OH</td><td class="text-right p-2">${fmt(-v(row,'Bonus_OH'))}</td><td class="text-right p-2 text-gray-400">${v(row,'Bonus_OH') > 0 ? '-' : ''}${p(v(row,'Bonus_OH'))}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-4">Mgt Bonus</td><td class="text-right p-2">${fmt(-v(row,'Mgt_Bonus'))}</td><td class="text-right p-2 text-gray-400">${v(row,'Mgt_Bonus') > 0 ? '-' : ''}${p(v(row,'Mgt_Bonus'))}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-4">Extra</td><td class="text-right p-2">${fmt(v(row,'Extra'))}</td><td class="text-right p-2 text-gray-400">${p(v(row,'Extra'))}%</td></tr>

                    <tr class="${totalBg} border-t"><td class="p-3">EBIT</td><td class="text-right p-3">${fmt(c.ebit)}</td><td class="text-right p-3">${p(c.ebit)}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-4">Interest</td><td class="text-right p-2">${fmt(-c.interest)}</td><td class="text-right p-2 text-gray-400">-${p(c.interest)}%</td></tr>
                    <tr class="${subRow}"><td class="p-2 pl-4">Tax</td><td class="text-right p-2">${fmt(c.tax)}</td><td class="text-right p-2 text-gray-400">${p(c.tax)}%</td></tr>

                    <tr class="${profitBg(c.eat)} border-t-2 text-lg"><td class="p-3">EAT</td><td class="text-right p-3">${fmt(c.eat)}</td><td class="text-right p-3">${p(c.eat)}%</td></tr>
                </tbody>
            </table>
            <div class="border-t p-3 bg-gray-50 text-sm">
                <table class="w-full">
                    <tr class="text-gray-500"><td class="p-1">Depre</td><td class="text-right p-1">${fmt(c.depre)}</td><td></td></tr>
                    <tr class="text-gray-500"><td class="p-1">Interest</td><td class="text-right p-1">${fmt(c.interest)}</td><td></td></tr>
                    <tr class="text-gray-500"><td class="p-1">Tax</td><td class="text-right p-1">${fmt(c.tax)}</td><td></td></tr>
                    <tr class="font-bold text-blue-800 border-t"><td class="p-1">EBITDA</td><td class="text-right p-1">${fmt(c.ebitda)}</td><td class="text-right p-1 text-blue-600">${p(c.ebitda)}%</td></tr>
                </table>
            </div>
            <div class="text-[10px] text-gray-400 p-2 text-right">Updated: ${row.Updated_At || '-'} by ${row.Updated_By || '-'}</div>
        </div>`;
    }

    function renderCharts(month) {
        Object.values(costChartInstances).forEach(ch => ch.destroy());
        costChartInstances = {};

        const row = costData.find(d => String(d.Month) === month);
        if (row) {
            const c = calc(row);
            renderPieChart(c);
            renderWaterfallChart(c);
        }
        renderTrendChart();
    }

    function renderPieChart(c) {
        const ctx = document.getElementById('cost-pie-chart');
        if (!ctx) return;
        costChartInstances.pie = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['RM', 'DL,OT', 'OH VC', 'OH FC', 'SG&A', 'Profit'],
                datasets: [{
                    data: [c.rm, c.dl, c.ohvc, c.ohfc, c.sga, Math.max(0, c.profit)],
                    backgroundColor: ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#8b5cf6', '#22c55e'],
                    borderWidth: 2, borderColor: '#fff'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { font: { size: 11 } } },
                    datalabels: {
                        color: '#fff', font: { weight: 'bold', size: 11 },
                        formatter: (val, ctx) => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            return total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '';
                        }
                    }
                }
            }
        });
    }

    function renderTrendChart() {
        const ctx = document.getElementById('cost-trend-chart');
        if (!ctx) return;
        if (costChartInstances.trend) { costChartInstances.trend.destroy(); delete costChartInstances.trend; }
        // 📅 รายเดือน / ไตรมาส / ปี — รวมยอดของทุกเดือนในช่วง (helpers.js)
        const period = window.getChartPeriod ? window.getChartPeriod('costTrend', ['month', 'quarter', 'year']) : 'month';
        let rows = costData.map(d => {
            const c = calc(d);
            return { month: String(d.Month || ''), sale: v(d, 'Sale'), cogs: c.cogs, grossProfit: c.grossProfit, eat: c.eat };
        });
        if (period !== 'month' && window.groupRowsByPeriod) {
            rows = window.groupRowsByPeriod(rows, period, r => r.month,
                () => ({ sale: 0, cogs: 0, grossProfit: 0, eat: 0 }),
                (acc, r) => { acc.sale += r.sale; acc.cogs += r.cogs; acc.grossProfit += r.grossProfit; acc.eat += r.eat; });
        }
        const labels = rows.map(r => r.label || r.month);
        const datasets = [
            { label: 'Sale', data: rows.map(r => r.sale), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', fill: true, tension: 0.3 },
            { label: 'COGS', data: rows.map(r => r.cogs), borderColor: '#ef4444', borderDash: [5, 5], tension: 0.3 },
            { label: 'Gross Profit', data: rows.map(r => r.grossProfit), borderColor: '#22c55e', tension: 0.3 },
            { label: 'EAT', data: rows.map(r => r.eat), borderColor: '#8b5cf6', tension: 0.3 }
        ];
        costChartInstances.trend = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 10 } } }, datalabels: { display: false },
                    tooltip: { callbacks: { title: (items) => {
                        const r = items.length ? rows[items[0].dataIndex] : null;
                        return r ? (r.title || r.month) : '';
                    } } }
                },
                scales: { y: { beginAtZero: true } }
            }
        });
    }
    if (window.registerChartPeriod) window.registerChartPeriod('costTrend', renderTrendChart);

    function renderWaterfallChart(c) {
        const ctx = document.getElementById('cost-waterfall-chart');
        if (!ctx) return;

        const items = [
            { label: 'Sale', value: c.sale, color: '#2563eb' },
            { label: 'RM', value: -c.rm, color: '#ef4444' },
            { label: 'DL,OT', value: -c.dl, color: '#f97316' },
            { label: 'OH VC', value: -c.ohvc, color: '#eab308' },
            { label: 'OH FC', value: -c.ohfc, color: '#3b82f6' },
            { label: 'Gross Profit', value: c.grossProfit, color: '#22c55e', isTotal: true },
            { label: 'SG&A', value: -c.sga, color: '#8b5cf6' },
            { label: 'Other', value: c.otherInc - c.bonuses, color: '#06b6d4' },
            { label: 'Interest', value: -c.interest, color: '#6b7280' },
            { label: 'EAT', value: c.eat, color: c.eat >= 0 ? '#22c55e' : '#ef4444', isTotal: true }
        ];

        let running = 0;
        const bases = [];
        const values = [];
        const colors = [];
        items.forEach(item => {
            if (item.isTotal) {
                bases.push(0);
                values.push(item.value);
            } else {
                if (item.value >= 0) {
                    bases.push(running);
                    values.push(item.value);
                    running += item.value;
                } else {
                    running += item.value;
                    bases.push(running);
                    values.push(Math.abs(item.value));
                }
            }
            colors.push(item.color);
        });

        costChartInstances.waterfall = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: items.map(i => i.label),
                datasets: [
                    { data: bases, backgroundColor: 'transparent', borderWidth: 0, stack: 'stack' },
                    { data: values, backgroundColor: colors, borderWidth: 0, stack: 'stack', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        anchor: 'end', align: 'end', font: { size: 10, weight: 'bold' },
                        formatter: (val, ctx) => ctx.datasetIndex === 1 ? val.toFixed(1) : ''
                    }
                },
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
            }
        });
    }

    // ========== Form Modal ==========
    window.openCostForm = function (editMonth) {
        const existing = editMonth ? costData.find(d => String(d.Month) === editMonth) : null;
        const now = new Date();
        const defaultMonth = existing ? existing.Month : now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

        const groups = [
            { title: 'Sale', fields: COST_FIELDS.filter(f => f.group === 'sale') },
            { title: 'RM (Raw Material)', fields: COST_FIELDS.filter(f => f.group === 'rm') },
            { title: 'DL, OT (Direct Labor)', fields: COST_FIELDS.filter(f => f.group === 'dl') },
            { title: 'OH VC (Overhead Variable)', fields: COST_FIELDS.filter(f => f.group === 'ohvc') },
            { title: 'OH FC (Overhead Fixed)', fields: COST_FIELDS.filter(f => f.group === 'ohfc') },
            { title: 'Selling VC', fields: COST_FIELDS.filter(f => f.group === 'sell') },
            { title: 'Admin FC', fields: COST_FIELDS.filter(f => f.group === 'admin') },
            { title: 'Other / Bonus', fields: COST_FIELDS.filter(f => f.group === 'other') },
            { title: 'Finance & Depre', fields: COST_FIELDS.filter(f => f.group === 'fin') }
        ];

        let formHtml = `<div class="mb-4">
            <label class="block text-sm font-bold text-gray-700 mb-1">เดือน (yyyy-MM)</label>
            <input type="month" id="cost-form-month" value="${defaultMonth}" class="border rounded-lg px-3 py-2 w-full" ${existing ? 'readonly' : ''}>
        </div>`;

        const dlAuto = getDLAutoValues();
        const dlKeys = ['DL', 'OT', 'DL_Sup', 'OT_Sup'];
        const hasDLStaff = dlStaffData.filter(s => String(s.Active) !== 'No').length > 0;

        groups.forEach(g => {
            const isDLGroup = g.title.includes('DL');
            formHtml += `<div class="mb-3"><div class="text-xs font-bold text-blue-700 mb-1 border-b pb-1">${g.title}`;
            if (isDLGroup && hasDLStaff) formHtml += ` <span class="text-[10px] text-orange-600 font-normal ml-2">⚡ คำนวณจากข้อมูลบุคลากรอัตโนมัติ</span>`;
            formHtml += `</div><div class="grid grid-cols-2 gap-2">`;
            g.fields.forEach(f => {
                const isDLField = dlKeys.includes(f.key);
                const autoVal = isDLField && hasDLStaff ? dlAuto[f.key] : null;
                const val = autoVal !== null ? autoVal : (existing ? (parseFloat(existing[f.key]) || 0) : 0);
                const readonlyAttr = (isDLField && hasDLStaff) ? 'readonly' : '';
                const bgClass = (isDLField && hasDLStaff) ? 'bg-orange-50' : '';
                formHtml += `<div><label class="text-[11px] text-gray-500">${f.label}${isDLField && hasDLStaff ? ' ⚡' : ''}</label><input type="number" step="0.01" id="cost-f-${f.key}" value="${val}" class="border rounded px-2 py-1.5 w-full text-sm ${bgClass}" ${readonlyAttr}></div>`;
            });
            formHtml += `</div></div>`;
        });

        const modal = document.createElement('div');
        modal.id = 'cost-form-modal';
        modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/50';
        modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
            <div class="sticky top-0 bg-white border-b p-4 flex justify-between items-center z-10">
                <h3 class="text-lg font-bold text-gray-800">${existing ? 'แก้ไข' : 'เพิ่ม'}ข้อมูลต้นทุน</h3>
                <button onclick="document.getElementById('cost-form-modal')?.remove()" class="text-2xl text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            <div class="p-4">${formHtml}</div>
            <div class="sticky bottom-0 bg-white border-t p-4 flex gap-2 justify-end">
                ${existing ? `<button onclick="window.deleteCostMonth('${existing.Month}')" class="bg-red-100 text-red-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-200 mr-auto">ลบเดือนนี้</button>` : ''}
                <button onclick="document.getElementById('cost-form-modal')?.remove()" class="bg-gray-200 px-4 py-2 rounded-lg text-sm">ยกเลิก</button>
                <button onclick="window.saveCostForm()" class="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-blue-700">บันทึก</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
    };

    window.saveCostForm = async function () {
        const month = document.getElementById('cost-form-month')?.value;
        if (!month) return alert('กรุณาเลือกเดือน');

        const payload = { action: 'SAVE_COST_DATA', month: month, updatedBy: window.currentUser?.name || window.currentUser?.username || 'Admin' };
        COST_FIELDS.forEach(f => {
            payload[f.key] = parseFloat(document.getElementById('cost-f-' + f.key)?.value) || 0;
        });

        const btn = document.querySelector('#cost-form-modal button:last-child');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }

        try {
            const res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
            const json = await res.json();
            if (json.status === 'success') {
                document.getElementById('cost-form-modal')?.remove();
                window.loadCostModule();
            } else {
                alert('Error: ' + (json.message || 'Unknown'));
                if (btn) { btn.disabled = false; btn.textContent = 'บันทึก'; }
            }
        } catch (e) {
            alert('Network error');
            if (btn) { btn.disabled = false; btn.textContent = 'บันทึก'; }
        }
    };

    window.deleteCostMonth = async function (month) {
        if (!confirm('ลบข้อมูลเดือน ' + month + ' ?')) return;
        try {
            await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'DELETE_COST_DATA', month }) });
            document.getElementById('cost-form-modal')?.remove();
            window.loadCostModule();
        } catch (e) { alert('Error'); }
    };

    // ========== DL Staff Management ==========

    const DL_CATEGORIES = [
        { key: 'DL', label: 'DL (แรงงานตรง)' },
        { key: 'OT', label: 'OT (ค่าล่วงเวลา)' },
        { key: 'DL_Sup', label: 'DL sup&mini MD' },
        { key: 'OT_Sup', label: 'OT sup&mini MD' }
    ];

    function dlStaffSummary() {
        const summary = { DL: 0, OT: 0, DL_Sup: 0, OT_Sup: 0, totalHeadcount: 0, totalCost: 0 };
        dlStaffData.forEach(s => {
            if (String(s.Active) === 'No') return;
            const count = parseInt(s.Count) || 0;
            const salary = parseFloat(s.Salary) || 0;
            const cost = count * salary;
            const cat = String(s.Category || 'DL');
            if (summary[cat] !== undefined) summary[cat] += cost;
            summary.totalHeadcount += count;
            summary.totalCost += cost;
        });
        return summary;
    }

    function renderDLStaffSection() {
        const el = document.getElementById('cost-dl-staff-section');
        if (!el) return;

        const activeStaff = dlStaffData.filter(s => String(s.Active) !== 'No');
        const summary = dlStaffSummary();

        const catGroups = {};
        activeStaff.forEach(s => {
            const cat = String(s.Category || 'DL');
            if (!catGroups[cat]) catGroups[cat] = [];
            catGroups[cat].push(s);
        });

        let tableHtml = '';
        DL_CATEGORIES.forEach(c => {
            const items = catGroups[c.key] || [];
            if (items.length === 0) return;
            let subtotal = 0;
            tableHtml += `<tr class="bg-blue-50"><td colspan="5" class="p-2 text-xs font-bold text-blue-800">${c.label}</td></tr>`;
            items.forEach(s => {
                const count = parseInt(s.Count) || 0;
                const salary = parseFloat(s.Salary) || 0;
                const total = count * salary;
                subtotal += total;
                tableHtml += `<tr class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="p-2 text-sm">${s.Name || '-'}</td>
                    <td class="p-2 text-sm text-gray-600">${s.Position || '-'}</td>
                    <td class="p-2 text-sm text-center">${count}</td>
                    <td class="p-2 text-sm text-right">${salary.toLocaleString()}</td>
                    <td class="p-2 text-sm text-right font-bold">${total.toLocaleString()}</td>
                </tr>`;
            });
            tableHtml += `<tr class="bg-blue-50/50"><td colspan="4" class="p-1.5 text-xs text-right text-blue-700 font-bold">รวม ${c.label}</td><td class="p-1.5 text-xs text-right text-blue-800 font-bold">${subtotal.toLocaleString()}</td></tr>`;
        });

        el.innerHTML = `
        <div class="bg-white rounded-xl shadow-sm border">
            <div class="p-4 border-b flex justify-between items-center">
                <div>
                    <h3 class="text-sm font-bold text-gray-800">👥 บุคลากร Direct Labor (DL)</h3>
                    <div class="text-xs text-gray-500 mt-1">รวม ${summary.totalHeadcount} คน · ต้นทุนรวม <span class="font-bold text-blue-700">${summary.totalCost.toLocaleString()}</span> บาท/เดือน</div>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.toggleDLStaffDetail()" id="btn-toggle-dl" class="bg-gray-200 text-gray-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-gray-300">🔒 แสดงรายละเอียด</button>
                    <button onclick="window.openDLStaffEditor()" class="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-600">✏️ จัดการบุคลากร</button>
                </div>
            </div>
            <div id="dl-staff-detail" class="hidden">
            ${activeStaff.length > 0 ? `
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 text-gray-600 text-xs">
                        <tr><th class="p-2 text-left">ชื่อ</th><th class="p-2 text-left">ตำแหน่ง</th><th class="p-2 text-center">จำนวน</th><th class="p-2 text-right">เงินเดือน/คน</th><th class="p-2 text-right">รวม</th></tr>
                    </thead>
                    <tbody>${tableHtml}</tbody>
                    <tfoot>
                        <tr class="bg-gray-100 font-bold text-sm">
                            <td colspan="2" class="p-2">รวมทั้งหมด</td>
                            <td class="p-2 text-center">${summary.totalHeadcount}</td>
                            <td class="p-2"></td>
                            <td class="p-2 text-right text-blue-700">${summary.totalCost.toLocaleString()}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>` : '<div class="p-8 text-center text-gray-400">ยังไม่มีข้อมูลบุคลากร — กด "จัดการบุคลากร" เพื่อเพิ่ม</div>'}
            </div>
            <div class="p-3 bg-gray-50 border-t text-[10px] text-gray-400">
                DL = ${summary.DL.toLocaleString()} · OT = ${summary.OT.toLocaleString()} · DL sup = ${summary.DL_Sup.toLocaleString()} · OT sup = ${summary.OT_Sup.toLocaleString()}
            </div>
        </div>`;
    }

    window.toggleDLStaffDetail = function() {
        const detail = document.getElementById('dl-staff-detail');
        const btn = document.getElementById('btn-toggle-dl');
        if (!detail || !btn) return;
        if (detail.classList.contains('hidden')) {
            detail.classList.remove('hidden');
            btn.innerHTML = '🔓 ซ่อนรายละเอียด';
            btn.classList.remove('bg-gray-200', 'text-gray-600');
            btn.classList.add('bg-red-100', 'text-red-700');
        } else {
            detail.classList.add('hidden');
            btn.innerHTML = '🔒 แสดงรายละเอียด';
            btn.classList.remove('bg-red-100', 'text-red-700');
            btn.classList.add('bg-gray-200', 'text-gray-600');
        }
    };

    // ========== DL Staff Editor Modal ==========

    let dlEditorRows = [];

    window.openDLStaffEditor = function () {
        dlEditorRows = dlStaffData.filter(s => String(s.Active) !== 'No').map((s, i) => ({
            id: i, name: s.Name || '', position: s.Position || '', count: parseInt(s.Count) || 1, salary: parseFloat(s.Salary) || 0, category: s.Category || 'DL'
        }));
        if (dlEditorRows.length === 0) dlEditorRows.push({ id: 0, name: '', position: '', count: 1, salary: 0, category: 'DL' });

        renderDLEditorModal();
    };

    function renderDLEditorModal() {
        document.getElementById('dl-editor-modal')?.remove();

        let rowsHtml = '';
        dlEditorRows.forEach((r, i) => {
            const catOptions = DL_CATEGORIES.map(c => `<option value="${c.key}" ${r.category === c.key ? 'selected' : ''}>${c.label}</option>`).join('');
            rowsHtml += `
            <tr class="border-b" data-idx="${i}">
                <td class="p-1"><input type="text" value="${r.name}" onchange="window.dlEditorUpdate(${i},'name',this.value)" class="border rounded px-2 py-1.5 w-full text-sm" placeholder="ชื่อ/กลุ่ม"></td>
                <td class="p-1"><input type="text" value="${r.position}" onchange="window.dlEditorUpdate(${i},'position',this.value)" class="border rounded px-2 py-1.5 w-full text-sm" placeholder="ตำแหน่ง"></td>
                <td class="p-1"><input type="number" value="${r.count}" min="0" onchange="window.dlEditorUpdate(${i},'count',this.value)" class="border rounded px-2 py-1.5 w-16 text-sm text-center"></td>
                <td class="p-1"><input type="number" value="${r.salary}" step="0.01" min="0" onchange="window.dlEditorUpdate(${i},'salary',this.value)" class="border rounded px-2 py-1.5 w-28 text-sm text-right"></td>
                <td class="p-1 text-right text-sm font-bold text-blue-700">${((parseInt(r.count) || 0) * (parseFloat(r.salary) || 0)).toLocaleString()}</td>
                <td class="p-1"><select onchange="window.dlEditorUpdate(${i},'category',this.value)" class="border rounded px-1 py-1.5 text-[11px]">${catOptions}</select></td>
                <td class="p-1 text-center"><button onclick="window.dlEditorRemove(${i})" class="text-red-500 hover:text-red-700 text-lg font-bold">&times;</button></td>
            </tr>`;
        });

        const totalCost = dlEditorRows.reduce((sum, r) => sum + (parseInt(r.count) || 0) * (parseFloat(r.salary) || 0), 0);
        const totalHead = dlEditorRows.reduce((sum, r) => sum + (parseInt(r.count) || 0), 0);

        const modal = document.createElement('div');
        modal.id = 'dl-editor-modal';
        modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/50';
        modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-4">
            <div class="sticky top-0 bg-white border-b p-4 flex justify-between items-center z-10">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">👥 จัดการบุคลากร DL</h3>
                    <div class="text-xs text-gray-500">รวม ${totalHead} คน · ${totalCost.toLocaleString()} บาท/เดือน</div>
                </div>
                <button onclick="document.getElementById('dl-editor-modal')?.remove()" class="text-2xl text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            <div class="p-4 overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-50 text-[11px] text-gray-600">
                        <tr><th class="p-1 text-left">ชื่อ/กลุ่ม</th><th class="p-1 text-left">ตำแหน่ง</th><th class="p-1 text-center">จำนวน</th><th class="p-1 text-right">เงินเดือน/คน</th><th class="p-1 text-right">รวม</th><th class="p-1">หมวด</th><th class="p-1"></th></tr>
                    </thead>
                    <tbody id="dl-editor-tbody">${rowsHtml}</tbody>
                </table>
                <button onclick="window.dlEditorAddRow()" class="mt-2 text-sm text-blue-600 font-bold hover:text-blue-800">+ เพิ่มแถว</button>
            </div>
            <div class="sticky bottom-0 bg-white border-t p-4 flex gap-2 justify-end">
                <button onclick="document.getElementById('dl-editor-modal')?.remove()" class="bg-gray-200 px-4 py-2 rounded-lg text-sm">ยกเลิก</button>
                <button onclick="window.saveDLStaff()" class="bg-orange-500 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-orange-600">💾 บันทึก</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
    }

    window.dlEditorUpdate = function (idx, field, value) {
        if (dlEditorRows[idx]) {
            dlEditorRows[idx][field] = value;
            renderDLEditorModal();
        }
    };

    window.dlEditorRemove = function (idx) {
        dlEditorRows.splice(idx, 1);
        renderDLEditorModal();
    };

    window.dlEditorAddRow = function () {
        dlEditorRows.push({ id: dlEditorRows.length, name: '', position: '', count: 1, salary: 0, category: 'DL' });
        renderDLEditorModal();
    };

    window.saveDLStaff = async function () {
        const items = dlEditorRows.filter(r => r.name || r.position || (parseInt(r.count) > 0 && parseFloat(r.salary) > 0));
        const btn = document.querySelector('#dl-editor-modal button:last-child');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }

        try {
            const res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({
                action: 'SAVE_DL_STAFF',
                items: items.map(r => ({ name: r.name, position: r.position, count: r.count, salary: r.salary, category: r.category, active: true })),
                updatedBy: window.currentUser?.name || window.currentUser?.username || 'Admin'
            })});
            const json = await res.json();
            if (json.status === 'success') {
                document.getElementById('dl-editor-modal')?.remove();
                window.loadCostModule();
            } else {
                alert('Error: ' + (json.message || 'Unknown'));
                if (btn) { btn.disabled = false; btn.textContent = '💾 บันทึก'; }
            }
        } catch (e) {
            alert('Network error');
            if (btn) { btn.disabled = false; btn.textContent = '💾 บันทึก'; }
        }
    };

    // ========== Auto-fill DL from staff data ==========

    function getDLAutoValues() {
        const summary = dlStaffSummary();
        return { DL: summary.DL, OT: summary.OT, DL_Sup: summary.DL_Sup, OT_Sup: summary.OT_Sup };
    }
})();
