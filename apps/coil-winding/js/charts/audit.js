// ==========================================
// Audit Export: Daily NG Rate Calculation Detail
// ==========================================
window._auditData = null;

window.exportNgRateAudit = function() {
    if (!currentDashboardData) { alert('กรุณาโหลดข้อมูลก่อน'); return; }
    const data = currentDashboardData;
    const container = document.getElementById('ng-audit-content');
    if (!container) return;

    const qcSelector = document.getElementById('qcModelSelector');
    const selectedModel = qcSelector ? qcSelector.value : 'all';
    const startDate = document.getElementById('startDate')?.value || '-';
    const endDate = document.getElementById('endDate')?.value || '-';
    const shiftFilter = document.getElementById('shiftFilter')?.value || 'All';
    const shiftTypeFilter = document.getElementById('shiftTypeFilter')?.value || 'All';
    const now = new Date().toLocaleString('th-TH');

    // uses shared getWppStrict / getKgFromPcs from helpers.js
    const f = (v, d) => v !== null && v !== undefined ? parseFloat(v).toFixed(d === undefined ? 4 : d) : '-';

    const trendData = data.dailyTrend || [];
    const dynamicWeights = data.dynamicSymptomWeights || {};

    // === Build per-day audit rows ===
    let auditRows = [];
    let grandFgKg = 0, grandNgKg = 0, grandPendingKg = 0, grandProjNgKg = 0;

    trendData.forEach(originalDay => {
        const dateStr = originalDay.date;
        let dayMachines = [];
        let mFgKg = 0, mNgKg = 0, mPendingKg = 0, mFgPcs = 0, mNgPcs = 0, mPendingPcs = 0;
        let modelNgBreakdownKg = {};
        let modelSortFgPcs = 0, modelSortNgPcs = 0;

        Object.entries(data.machineData || {}).forEach(([mac, mData]) => {
            let assignedModel = '';
            if (typeof machineMapping !== 'undefined' && machineMapping[mac]) assignedModel = machineMapping[mac];
            else if (typeof globalMachineMapping !== 'undefined' && globalMachineMapping[mac]) assignedModel = globalMachineMapping[mac];
            else if (data.machineMapping && data.machineMapping[mac]) assignedModel = data.machineMapping[mac];

            // ข้ามเครื่องที่ไม่ได้ Assign รุ่น
            const wpp = getWppStrict(assignedModel);
            if (!assignedModel || wpp === null) return;

            if (selectedModel === 'all' || assignedModel === selectedModel || assignedModel.includes(selectedModel)) {
                if (mData.daily && mData.daily[dateStr]) {
                    const dd = mData.daily[dateStr];
                    const dailyFgPcs = dd.fg || 0;
                    const dailyNgPcs = dd.ngPcs !== undefined ? dd.ngPcs : (dd.ng || 0);
                    if (dailyFgPcs === 0 && dailyNgPcs === 0) return;

                    const macFgKg = getKgFromPcs(assignedModel, dailyFgPcs);
                    const macNgKg = getKgFromPcs(assignedModel, dailyNgPcs);
                    let pendPcs = 0, pendKg = 0;
                    if (mData.sortData && mData.sortData[dateStr]) {
                        pendPcs = mData.sortData[dateStr].pendingPcs || 0;
                        pendKg = getKgFromPcs(assignedModel, pendPcs);
                        modelSortFgPcs += mData.sortData[dateStr].fgPcs || 0;
                        modelSortNgPcs += mData.sortData[dateStr].ngPcs || 0;
                    }

                    let ngBreakdown = {};
                    if (dd.ngBreakdown) {
                        for (const [symp, pcs] of Object.entries(dd.ngBreakdown)) {
                            const sympKg = getKgFromPcs(assignedModel, pcs);
                            ngBreakdown[symp] = { pcs, kg: sympKg };
                            modelNgBreakdownKg[symp] = (modelNgBreakdownKg[symp] || 0) + sympKg;
                        }
                    }

                    mFgPcs += dailyFgPcs; mNgPcs += dailyNgPcs;
                    mFgKg += macFgKg; mNgKg += macNgKg;
                    mPendingPcs += pendPcs; mPendingKg += pendKg;

                    dayMachines.push({
                        machine: mac, model: assignedModel, wpp,
                        fgPcs: dailyFgPcs, ngPcs: dailyNgPcs, fgKg: macFgKg, ngKg: macNgKg,
                        pendingPcs: pendPcs, pendingKg: pendKg, ngBreakdown
                    });
                }
            }
        });

        const totalKg = mFgKg + mNgKg;
        const ngRate = totalKg > 0 ? (mNgKg / totalKg) * 100 : 0;
        let worstNgRate = null, bestNgRate = null, forecastNgRate = null, projectedNgKg = 0;
        let forecastDetail = [];

        if (mPendingKg > 0 && totalKg > 0) {
            const projTotalKg = totalKg + mPendingKg;
            worstNgRate = ((mNgKg + mPendingKg) / projTotalKg) * 100;
            bestNgRate = (mNgKg / projTotalKg) * 100;
            let totalWeightedNgRatio = 0;

            let knownWeightKg = 0;
            if (Object.keys(modelNgBreakdownKg).length > 0 && mNgKg > 0) {
                for (const [symp, sympKg] of Object.entries(modelNgBreakdownKg)) {
                    if (dynamicWeights[symp] === undefined) {
                        forecastDetail.push({ symp, sympKg, proportion: sympKg / mNgKg, fgRate: null, ngRatio: null, source: 'No Sort Data (skipped)' });
                        continue;
                    }
                    const fgRate = dynamicWeights[symp];
                    const proportion = sympKg / mNgKg;
                    const ngRatio = 1 - fgRate;
                    knownWeightKg += sympKg;
                    totalWeightedNgRatio += (proportion * ngRatio);
                    forecastDetail.push({ symp, sympKg, proportion, fgRate, ngRatio, source: 'Dynamic (Sort History)' });
                }
                if (knownWeightKg > 0) {
                    const coverageRatio = knownWeightKg / mNgKg;
                    if (coverageRatio > 0) totalWeightedNgRatio = totalWeightedNgRatio / coverageRatio;
                    projectedNgKg = mPendingKg * totalWeightedNgRatio;
                    forecastNgRate = ((mNgKg + projectedNgKg) / projTotalKg) * 100;
                }
                // ถ้าไม่มีอาการไหนมีข้อมูล Sort → ไม่แสดง Forecast (forecastNgRate = null)
            }
            // ไม่ใช้ Global Fallback — ถ้าไม่มีข้อมูลจริงก็ไม่พยากรณ์
        }

        grandFgKg += mFgKg; grandNgKg += mNgKg; grandPendingKg += mPendingKg; grandProjNgKg += projectedNgKg;

        auditRows.push({
            date: dateStr, machines: dayMachines,
            fgPcs: mFgPcs, ngPcs: mNgPcs, fgKg: mFgKg, ngKg: mNgKg,
            totalKg, ngRate, pendingPcs: mPendingPcs, pendingKg: mPendingKg,
            worstNgRate, bestNgRate, forecastNgRate, projectedNgKg, forecastDetail,
            modelNgBreakdownKg
        });
    });

    window._auditData = auditRows;
    const grandTotalKg = grandFgKg + grandNgKg;
    const grandNgRate = grandTotalKg > 0 ? (grandNgKg / grandTotalKg) * 100 : 0;

    // === Render HTML ===
    let html = '';

    // Header
    html += `<div class="bg-white border rounded-lg p-4 mb-4 shadow-sm">
        <h2 class="text-lg font-black text-gray-800 mb-2">Audit Report: Daily NG Rate Trend — Calculation Detail</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600">
            <div><b>Generated:</b> ${now}</div>
            <div><b>Period:</b> ${startDate} ~ ${endDate}</div>
            <div><b>Shift:</b> ${shiftFilter} / ${shiftTypeFilter}</div>
            <div><b>Model Filter:</b> ${selectedModel}</div>
        </div>
    </div>`;

    // Section 1: Methodology
    html += `<div class="bg-white border rounded-lg p-4 mb-4 shadow-sm">
        <h3 class="font-bold text-sm text-blue-800 border-b pb-1 mb-2">Section 1: Methodology & Basis of Calculation</h3>
        <div class="text-xs text-gray-700 space-y-1">
            <p><b>1.1 NG Rate Formula:</b> <code class="bg-gray-100 px-1 rounded">NG Rate (%) = (NG Weight in Kg) / (FG Weight in Kg + NG Weight in Kg) × 100</code></p>
            <p><b>1.2 Weight Basis:</b> NG Rate is calculated on a <b>weight (Kg) basis</b>, not piece count. This ensures fair comparison across product models with different piece weights.</p>
            <p><b>1.3 Conversion:</b> <code class="bg-gray-100 px-1 rounded">Weight (Kg) = Piece Count × Weight Per Piece (WPP)</code></p>
            <p><b>1.4 Worst Case:</b> <code class="bg-gray-100 px-1 rounded">Worst NG Rate = (NG Kg + Pending Kg) / (Total Kg + Pending Kg) × 100</code> — assumes all pending sort items are NG</p>
            <p><b>1.5 Best Case:</b> <code class="bg-gray-100 px-1 rounded">Best NG Rate = NG Kg / (Total Kg + Pending Kg) × 100</code> — assumes all pending sort items are FG</p>
            <p><b>1.6 Forecast:</b> Uses <b>Dynamic Symptom Weights</b> from actual sort history to predict NG ratio of pending items per defect type. <span class="text-green-700 font-bold">Only verified data is used — no fallback values.</span> Symptoms without sort history are skipped and weights are re-normalized based on coverage ratio.</p>
            <p><b>1.7 Data Integrity:</b> <span class="text-green-700">Machines with unassigned/unknown products are excluded from calculation. Only known WPP constants are used (no default 0.003 fallback).</span></p>
            <p class="text-[10px] text-gray-500 mt-1"><code>Forecast NG Kg = Pending Kg × Σ(Symptom Proportion × Symptom NG Ratio)</code><br>
            <code>Forecast NG Rate = (NG Kg + Forecast NG Kg) / (Total Kg + Pending Kg) × 100</code></p>
        </div>
    </div>`;

    // Section 2: WPP Reference
    html += `<div class="bg-white border rounded-lg p-4 mb-4 shadow-sm">
        <h3 class="font-bold text-sm text-blue-800 border-b pb-1 mb-2">Section 2: Weight Per Piece (WPP) Reference Table</h3>
        <table class="w-full text-xs border-collapse"><thead><tr class="bg-blue-50">
            <th class="border p-1 text-left">Product Model</th><th class="border p-1 text-right">WPP (Kg/Piece)</th><th class="border p-1 text-left">Remark</th>
        </tr></thead><tbody>`;
    [["S1B29288-JR (10A)", 0.00228], ["S1B71819-JR (16A)", 0.00279], ["S1B29292-JR (20A)", 0.00357], ["51207080HC-JR (25/32A)", 0.005335]].forEach(([m, w]) => {
        html += `<tr><td class="border p-1">${m}</td><td class="border p-1 text-right font-mono">${w}</td><td class="border p-1 text-gray-500">Fixed constant</td></tr>`;
    });
    html += `<tr class="bg-green-50"><td class="border p-1 text-gray-600" colspan="3">⚠️ Only verified WPP values are used. Machines with unknown products are excluded from calculation.</td></tr>`;
    html += `</tbody></table></div>`;

    // Section 3: Dynamic Symptom Weights
    html += `<div class="bg-white border rounded-lg p-4 mb-4 shadow-sm">
        <h3 class="font-bold text-sm text-blue-800 border-b pb-1 mb-2">Section 3: Dynamic Symptom Weights (from Sort History)</h3>
        <p class="text-xs text-gray-600 mb-2">These weights are derived from actual sorting results. <b>FG Rate</b> = proportion of items sorted as Good (FG) for each defect symptom. <b>NG Ratio</b> = 1 - FG Rate = expected proportion that will remain NG.</p>
        <table class="w-full text-xs border-collapse"><thead><tr class="bg-purple-50">
            <th class="border p-1 text-left">Symptom</th><th class="border p-1 text-right">FG Rate</th><th class="border p-1 text-right">NG Ratio (1 - FG Rate)</th><th class="border p-1 text-left">Source</th>
        </tr></thead><tbody>`;
    if (Object.keys(dynamicWeights).length > 0) {
        Object.entries(dynamicWeights).sort((a, b) => b[1] - a[1]).forEach(([symp, fgRate]) => {
            html += `<tr><td class="border p-1">${symp}</td><td class="border p-1 text-right font-mono">${(fgRate * 100).toFixed(2)}%</td><td class="border p-1 text-right font-mono">${((1 - fgRate) * 100).toFixed(2)}%</td><td class="border p-1 text-gray-500">Sort History</td></tr>`;
        });
    } else {
        html += `<tr><td class="border p-1 text-gray-400" colspan="4">No sort history data available</td></tr>`;
    }
    html += `<tr class="bg-green-50"><td class="border p-1 text-gray-600" colspan="4">⚠️ Only symptoms with verified sort history are used for forecast. Symptoms without data are skipped and re-normalized.</td></tr>`;
    html += `</tbody></table></div>`;

    // Section 4: Machine-Product Assignment
    html += `<div class="bg-white border rounded-lg p-4 mb-4 shadow-sm">
        <h3 class="font-bold text-sm text-blue-800 border-b pb-1 mb-2">Section 4: Machine-Product Assignment (WPP applied)</h3>
        <table class="w-full text-xs border-collapse"><thead><tr class="bg-green-50">
            <th class="border p-1">Machine</th><th class="border p-1">Assigned Product</th><th class="border p-1 text-right">WPP Used</th>
        </tr></thead><tbody>`;
    for (let i = 1; i <= 16; i++) {
        const m = 'CWM-' + String(i).padStart(2, '0');
        let prod = '';
        if (typeof machineMapping !== 'undefined' && machineMapping[m]) prod = machineMapping[m];
        else if (data.machineMapping && data.machineMapping[m]) prod = data.machineMapping[m];
        if (selectedModel !== 'all' && !prod.includes(selectedModel)) continue;
        const w = getWppStrict(prod);
        if (w === null) {
            html += `<tr class="bg-gray-50"><td class="border p-1 font-bold text-gray-400">${m}</td><td class="border p-1 text-gray-400">${prod || 'Unassigned'}</td><td class="border p-1 text-right font-mono text-gray-400">— (excluded)</td></tr>`;
        } else {
            html += `<tr><td class="border p-1 font-bold">${m}</td><td class="border p-1">${prod}</td><td class="border p-1 text-right font-mono">${w}</td></tr>`;
        }
    }
    html += `</tbody></table></div>`;

    // Section 5: Grand Summary
    html += `<div class="bg-white border rounded-lg p-4 mb-4 shadow-sm">
        <h3 class="font-bold text-sm text-blue-800 border-b pb-1 mb-2">Section 5: Grand Summary</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div class="bg-blue-50 rounded p-2"><b>Total FG (Kg):</b><br><span class="text-lg font-bold text-blue-700">${f(grandFgKg, 4)}</span></div>
            <div class="bg-red-50 rounded p-2"><b>Total NG (Kg):</b><br><span class="text-lg font-bold text-red-700">${f(grandNgKg, 4)}</span></div>
            <div class="bg-gray-50 rounded p-2"><b>Total Production (Kg):</b><br><span class="text-lg font-bold">${f(grandTotalKg, 4)}</span></div>
            <div class="bg-orange-50 rounded p-2"><b>Avg NG Rate:</b><br><span class="text-lg font-bold text-orange-700">${f(grandNgRate, 4)}%</span></div>
        </div>
        <p class="text-[10px] text-gray-500 mt-2 font-mono">Formula: ${f(grandNgKg, 4)} / (${f(grandFgKg, 4)} + ${f(grandNgKg, 4)}) × 100 = ${f(grandNgRate, 4)}%</p>
    </div>`;

    // Section 6: Daily Detail
    html += `<div class="bg-white border rounded-lg p-4 mb-4 shadow-sm">
        <h3 class="font-bold text-sm text-blue-800 border-b pb-1 mb-3">Section 6: Daily Calculation Detail</h3>`;

    auditRows.forEach((row, dayIdx) => {
        if (row.fgPcs === 0 && row.ngPcs === 0) return;
        const hasPending = row.pendingKg > 0;

        html += `<div class="border rounded-lg mb-3 overflow-hidden">
            <div class="bg-gray-100 px-3 py-2 flex justify-between items-center cursor-pointer" onclick="this.nextElementSibling.classList.toggle('hidden')">
                <span class="font-bold text-sm text-gray-800">${row.date}</span>
                <div class="flex gap-4 text-xs">
                    <span class="text-blue-700">FG: ${f(row.fgKg, 4)} Kg</span>
                    <span class="text-red-700">NG: ${f(row.ngKg, 4)} Kg</span>
                    <span class="font-black text-orange-700">Rate: ${f(row.ngRate, 2)}%</span>
                    ${hasPending ? `<span class="text-purple-600">Forecast: ${f(row.forecastNgRate, 2)}%</span>` : ''}
                </div>
            </div>
            <div class="hidden p-3 bg-white text-xs space-y-3">`;

        // 6a: Day Summary + Formula
        html += `<div class="bg-yellow-50 border border-yellow-200 rounded p-2">
            <p class="font-bold text-yellow-800 mb-1">Calculation:</p>
            <p class="font-mono text-[11px]">FG Kg = ${f(row.fgKg, 6)} | NG Kg = ${f(row.ngKg, 6)} | Total = ${f(row.totalKg, 6)}</p>
            <p class="font-mono text-[11px]">NG Rate = ${f(row.ngKg, 6)} / ${f(row.totalKg, 6)} × 100 = <b>${f(row.ngRate, 4)}%</b></p>`;
        if (hasPending) {
            const projTotal = row.totalKg + row.pendingKg;
            html += `<p class="font-mono text-[11px] mt-1">Pending Sort = ${row.pendingPcs} pcs = ${f(row.pendingKg, 6)} Kg</p>
                <p class="font-mono text-[11px]">Worst = (${f(row.ngKg, 4)} + ${f(row.pendingKg, 4)}) / ${f(projTotal, 4)} × 100 = <b>${f(row.worstNgRate, 4)}%</b></p>
                <p class="font-mono text-[11px]">Best = ${f(row.ngKg, 4)} / ${f(projTotal, 4)} × 100 = <b>${f(row.bestNgRate, 4)}%</b></p>
                <p class="font-mono text-[11px]">Projected NG Kg = ${f(row.pendingKg, 4)} × Weighted Ratio = ${f(row.projectedNgKg, 6)}</p>
                <p class="font-mono text-[11px]">Forecast = (${f(row.ngKg, 4)} + ${f(row.projectedNgKg, 4)}) / ${f(projTotal, 4)} × 100 = <b>${f(row.forecastNgRate, 4)}%</b></p>`;
        }
        html += `</div>`;

        // 6b: Machine Breakdown
        html += `<div><p class="font-bold text-gray-700 mb-1">Machine Breakdown:</p>
            <table class="w-full border-collapse text-[11px]"><thead><tr class="bg-blue-50">
                <th class="border p-1">Machine</th><th class="border p-1">Model</th><th class="border p-1 text-right">WPP</th>
                <th class="border p-1 text-right">FG (pcs)</th><th class="border p-1 text-right">FG (Kg)</th>
                <th class="border p-1 text-right">NG (pcs)</th><th class="border p-1 text-right">NG (Kg)</th>
                <th class="border p-1 text-right">Pending</th><th class="border p-1">NG Detail</th>
            </tr></thead><tbody>`;
        row.machines.forEach(mc => {
            const detailParts = Object.entries(mc.ngBreakdown).map(([s, v]) => `${s}: ${v.pcs}pcs (${f(v.kg, 4)}Kg)`).join(', ');
            html += `<tr>
                <td class="border p-1 font-bold">${mc.machine}</td><td class="border p-1">${mc.model}</td>
                <td class="border p-1 text-right font-mono">${mc.wpp}</td>
                <td class="border p-1 text-right">${mc.fgPcs.toLocaleString()}</td><td class="border p-1 text-right font-mono">${f(mc.fgKg, 4)}</td>
                <td class="border p-1 text-right text-red-600">${mc.ngPcs.toLocaleString()}</td><td class="border p-1 text-right font-mono text-red-600">${f(mc.ngKg, 6)}</td>
                <td class="border p-1 text-right">${mc.pendingPcs > 0 ? mc.pendingPcs + 'pcs' : '-'}</td>
                <td class="border p-1 text-[10px] text-gray-600">${detailParts || '-'}</td>
            </tr>`;
        });
        // Subtotal
        html += `<tr class="bg-gray-100 font-bold">
            <td class="border p-1" colspan="3">Subtotal</td>
            <td class="border p-1 text-right">${row.fgPcs.toLocaleString()}</td><td class="border p-1 text-right font-mono">${f(row.fgKg, 4)}</td>
            <td class="border p-1 text-right text-red-600">${row.ngPcs.toLocaleString()}</td><td class="border p-1 text-right font-mono text-red-600">${f(row.ngKg, 4)}</td>
            <td class="border p-1 text-right">${row.pendingPcs > 0 ? row.pendingPcs + 'pcs' : '-'}</td>
            <td class="border p-1"></td>
        </tr></tbody></table></div>`;

        // 6c: Forecast Weight Detail (if pending)
        if (row.forecastDetail.length > 0) {
            html += `<div><p class="font-bold text-gray-700 mb-1">Forecast Weight Calculation:</p>
                <table class="w-full border-collapse text-[11px]"><thead><tr class="bg-purple-50">
                    <th class="border p-1 text-left">Symptom</th><th class="border p-1 text-right">NG Kg</th>
                    <th class="border p-1 text-right">Proportion</th><th class="border p-1 text-right">FG Rate</th>
                    <th class="border p-1 text-right">NG Ratio</th><th class="border p-1 text-right">Weighted</th>
                    <th class="border p-1">Source</th>
                </tr></thead><tbody>`;
            let sumWeighted = 0;
            row.forecastDetail.forEach(fd => {
                const isSkipped = fd.fgRate === null;
                const weighted = isSkipped ? 0 : (fd.proportion * fd.ngRatio);
                if (!isSkipped) sumWeighted += weighted;
                html += `<tr class="${isSkipped ? 'text-gray-400' : ''}">
                    <td class="border p-1">${fd.symp}</td>
                    <td class="border p-1 text-right font-mono">${f(fd.sympKg, 4)}</td>
                    <td class="border p-1 text-right font-mono">${(fd.proportion * 100).toFixed(2)}%</td>
                    <td class="border p-1 text-right font-mono">${isSkipped ? '—' : (fd.fgRate * 100).toFixed(2) + '%'}</td>
                    <td class="border p-1 text-right font-mono">${isSkipped ? '—' : (fd.ngRatio * 100).toFixed(2) + '%'}</td>
                    <td class="border p-1 text-right font-mono">${isSkipped ? '—' : (weighted * 100).toFixed(4) + '%'}</td>
                    <td class="border p-1 text-gray-500">${fd.source}</td>
                </tr>`;
            });
            html += `<tr class="bg-gray-100 font-bold"><td class="border p-1" colspan="5">Total Weighted NG Ratio</td>
                <td class="border p-1 text-right font-mono">${(sumWeighted * 100).toFixed(4)}%</td><td class="border p-1"></td></tr>`;
            html += `</tbody></table>
                <p class="text-[10px] text-gray-500 font-mono mt-1">Projected NG Kg = Pending ${f(row.pendingKg, 4)} Kg × ${(sumWeighted * 100).toFixed(4)}% = ${f(row.projectedNgKg, 6)} Kg</p>
            </div>`;
        }

        html += `</div></div>`;
    });
    html += `</div>`;

    // Section 7: Verification Checklist
    html += `<div class="bg-white border rounded-lg p-4 mb-4 shadow-sm">
        <h3 class="font-bold text-sm text-blue-800 border-b pb-1 mb-2">Section 7: Verification Checklist</h3>
        <ul class="text-xs text-gray-700 space-y-1 list-disc pl-5">
            <li>All weights derived from piece count × WPP (Section 2)</li>
            <li>NG Rate calculated on Kg basis, not piece basis</li>
            <li>Machine-Product assignment determines WPP used (Section 4)</li>
            <li>Forecast uses symptom-level FG Rate from actual sort results (Section 3)</li>
            <li>When symptom has no sort history, Global Fallback ratio is applied</li>
            <li>Each daily row can be expanded to verify individual machine contributions</li>
            <li>Grand summary matches sum of all daily data</li>
        </ul>
    </div>`;

    container.innerHTML = html;
    document.getElementById('modal-ng-audit').classList.remove('hidden');
};

// === CSV Download ===
window.downloadAuditCSV = function() {
    if (!window._auditData) return;
    let csv = 'Date,FG (pcs),FG (Kg),NG (pcs),NG (Kg),Total (Kg),NG Rate (%),Pending (pcs),Pending (Kg),Worst (%),Best (%),Forecast (%),Projected NG (Kg)\n';
    window._auditData.forEach(r => {
        csv += `${r.date},${r.fgPcs},${r.fgKg.toFixed(4)},${r.ngPcs},${r.ngKg.toFixed(6)},${r.totalKg.toFixed(4)},${r.ngRate.toFixed(4)},${r.pendingPcs},${r.pendingKg.toFixed(4)},${r.worstNgRate !== null ? r.worstNgRate.toFixed(4) : ''},${r.bestNgRate !== null ? r.bestNgRate.toFixed(4) : ''},${r.forecastNgRate !== null ? r.forecastNgRate.toFixed(4) : ''},${r.projectedNgKg.toFixed(6)}\n`;
    });

    // Machine detail sheet
    csv += '\n\nDate,Machine,Model,WPP,FG (pcs),FG (Kg),NG (pcs),NG (Kg),Pending (pcs),NG Breakdown\n';
    window._auditData.forEach(r => {
        r.machines.forEach(mc => {
            const bd = Object.entries(mc.ngBreakdown).map(([s, v]) => `${s}:${v.pcs}pcs/${v.kg.toFixed(4)}Kg`).join(' | ');
            csv += `${r.date},${mc.machine},${mc.model},${mc.wpp},${mc.fgPcs},${mc.fgKg.toFixed(4)},${mc.ngPcs},${mc.ngKg.toFixed(6)},${mc.pendingPcs},"${bd}"\n`;
        });
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NG_Rate_Audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

// === Print ===
window.printAuditReport = function() {
    const content = document.getElementById('ng-audit-content');
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>NG Rate Audit Report</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        <style>body{padding:20px;font-size:11px} table{page-break-inside:auto} tr{page-break-inside:avoid} .hidden{display:block!important} @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
    </head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 500);
};
