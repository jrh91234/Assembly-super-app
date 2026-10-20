window.renderFgByModel = function(data) {
    const container = document.getElementById('fgModelList');
    if(!container) return;
    const models = [
        "S1B29288-JR (10A)",
        "S1B71819-JR (16A)",
        "S1B29292-JR (20A)",
        "51207080HC-JR (25/32A)"
    ];

    // uses shared getKgFromPcs from helpers.js (strict, no fallback)

    let html = '<ul class="divide-y divide-gray-100">';
    models.forEach(m => {
        // ดึงยอดชิ้นงาน FG
        const fg = (data.productData && data.productData[m]) ? data.productData[m].fg : 0;
        
        // คำนวณยอดชิ้นงานเป็นกิโลกรัม
        const fgKg = getKgFromPcs(m, fg);

        html += `
        <li class="py-3 flex flex-col gap-1">
            <div class="flex justify-between items-center">
                <span class="text-sm text-gray-800 font-bold">${m}</span>
            </div>
            <div class="flex justify-between items-center text-xs mt-1 bg-blue-50 p-2 rounded border border-blue-100">
                <span class="text-gray-700">ยอดงานดี (FG)</span>
                <div class="text-right">
                    <span class="font-bold text-blue-700 text-sm">${fg.toLocaleString()} ชิ้น</span>
                    <span class="text-gray-500 ml-2">(${window.formatKg ? window.formatKg(fgKg, 3) : fgKg.toFixed(3)} Kg)</span>
                </div>
            </div>
        </li>`;
    });
    html += '</ul>';
    container.innerHTML = html;
};

window.renderSimulator = function(data) {
    const container = document.getElementById('simulator-checkboxes');
    if (!container) return;
    if (!data) data = currentDashboardData;
    if (!data) return;

    // เติม dropdown เลือกเครื่อง (เฉพาะเครื่องที่มีข้อมูล + คงค่าที่เลือก)
    const macSel = document.getElementById('simMachineSelector');
    let selectedMac = 'all';
    if (macSel) {
        const macsWithData = Object.keys(data.machineData || {}).filter(m => {
            const md = data.machineData[m];
            const ng = md.ngTotalPcs !== undefined ? md.ngTotalPcs : (md.ngTotal || 0);
            return (md.fg || 0) > 0 || ng > 0;
        }).sort();
        const desired = ['all'].concat(macsWithData);
        const current = Array.from(macSel.options).map(o => o.value);
        const same = current.length === desired.length && current.every((v, i) => v === desired[i]);
        if (!same) {
            const prev = macSel.value;
            macSel.innerHTML = '';
            const allOpt = document.createElement('option');
            allOpt.value = 'all'; allOpt.textContent = 'ทุกเครื่อง (รวม)';
            macSel.appendChild(allOpt);
            macsWithData.forEach(m => {
                const o = document.createElement('option');
                o.value = m;
                const model = (typeof machineMapping !== 'undefined' && machineMapping[m]) ? machineMapping[m] : (data.machineMapping && data.machineMapping[m]);
                o.textContent = model ? `${m} (${model})` : m;
                macSel.appendChild(o);
            });
            macSel.value = desired.indexOf(prev) !== -1 ? prev : 'all';
        }
        selectedMac = macSel.value;
    }

    // เลือกชุดอาการ NG ตามสโคป: ทุกเครื่อง = ยอดรวม, รายเครื่อง = breakdown ของเครื่องนั้น
    let ngItems = [];
    if (selectedMac === 'all') {
        const labels = data.ngLabels || [];
        const valsPcs = data.ngValuesPcs || data.ngValues || [];
        ngItems = labels.map((l, i) => ({ label: l, pcs: valsPcs[i] || 0 }));
    } else {
        const md = data.machineData && data.machineData[selectedMac];
        const bd = (md && md.ngBreakdownPcs) ? md.ngBreakdownPcs : {};
        ngItems = Object.entries(bd).map(([l, pcs]) => ({ label: l, pcs: pcs || 0 }));
    }
    ngItems.sort((a, b) => b.pcs - a.pcs);
    const totalNgScope = ngItems.reduce((a, b) => a + b.pcs, 0);

    let html = '';
    ngItems.forEach((item) => {
        if(item.pcs > 0) {
            const pct = totalNgScope > 0 ? ((item.pcs / totalNgScope) * 100).toFixed(1) : '0.0';
            html += `
            <label class="flex items-center space-x-2 cursor-pointer p-1 hover:bg-gray-200 rounded transition-colors">
                <input type="checkbox" class="sim-cb w-4 h-4 text-blue-600 rounded flex-none" value="${item.label}" data-pcs="${item.pcs}" onchange="window.updateSimulator()">
                <span class="truncate leading-tight flex-1" title="${item.label}">${item.label} (<span class="text-red-500 font-bold">${item.pcs}</span> · <span class="text-orange-500 font-semibold">${pct}%</span>)</span>
            </label>
            `;
        }
    });

    container.innerHTML = html || '<div class="text-gray-400 col-span-2 text-center py-4">ไม่มีข้อมูล NG ในรอบนี้</div>';

    window.updateSimulator();
};

window.updateSimulator = function() {
    if (!currentDashboardData) return;
    const data = currentDashboardData;

    const macSel = document.getElementById('simMachineSelector');
    const selectedMac = macSel ? macSel.value : 'all';

    let fg, originalNg;
    if (selectedMac === 'all') {
        fg = data.totalFg || 0;
        originalNg = data.totalNgPcs !== undefined ? data.totalNgPcs : (data.totalNg || 0);
    } else {
        const md = data.machineData && data.machineData[selectedMac];
        fg = md ? (md.fg || 0) : 0;
        originalNg = md ? (md.ngTotalPcs !== undefined ? md.ngTotalPcs : (md.ngTotal || 0)) : 0;
    }

    let savedNg = 0;
    const checkboxes = document.querySelectorAll('.sim-cb:checked');
    checkboxes.forEach(cb => {
        savedNg += parseInt(cb.dataset.pcs) || 0;
    });

    const newNg = originalNg - savedNg;

    const totalOriginal = fg + originalNg;
    const originalYield = totalOriginal > 0 ? (fg / totalOriginal) * 100 : 0;

    const totalNew = fg + newNg;
    const newYield = totalNew > 0 ? (fg / totalNew) * 100 : 0;

    const yieldDiff = newYield - originalYield;

    const savedPct = originalNg > 0 ? ((savedNg / originalNg) * 100).toFixed(1) : '0.0';

    document.getElementById('sim-yield').innerHTML = `${newYield.toFixed(2)}% <span class="text-sm font-medium ${yieldDiff > 0 ? 'text-green-500' : 'text-gray-400'}">(+${yieldDiff.toFixed(2)}%)</span>`;
    document.getElementById('sim-ng-saved').innerHTML = `${savedNg.toLocaleString()} ชิ้น <span class="text-orange-500 font-semibold ml-1">(${savedPct}% ของ NG)</span> <span class="text-gray-400 font-normal ml-1">(เหลือ NG: ${newNg.toLocaleString()})</span>`;
};

window.renderModelChart = function() {
    if (!currentDashboardData || !charts) return;
    
    const data = currentDashboardData;
    const pData = data.productData || {};
    const labels = Object.keys(pData);
    const selector = document.getElementById('modelChartSelector');
    const viewBySelector = document.getElementById('modelViewBySelector');
    const type = selector ? selector.value : 'yield';
    const viewBy = viewBySelector ? viewBySelector.value : 'model';

    const rawMatMap = {
        "S1B29288-JR (10A)": "51150220",
        "S1B71819-JR (16A)": "51150221",
        "S1B29292-JR (20A)": "51150222",
        "51207080HC-JR (25/32A)": "51150244" 
    };

    const displayLabels = labels.map(model => {
        if (viewBy === 'rawmat') {
            return rawMatMap[model] || model;
        }
        return model;
    });

    const ctxYM = document.getElementById('yieldModelChart');
    if(!ctxYM) return;
    if(charts.yieldModel) charts.yieldModel.destroy();

    // uses shared getKgFromPcs from helpers.js (strict, no fallback)

    let datasets = [];
    let scales = { y: { stacked: false } };

    if (type === 'yield') {
        datasets = [{ 
            label: '% Yield', 
            data: Object.values(pData).map(d => {
                const ngCount = d.ngTotalPcs !== undefined ? d.ngTotalPcs : (d.ngTotal || 0);
                const t = d.fg + ngCount; 
                return t > 0 ? parseFloat(((d.fg/t)*100).toFixed(1)) : 0;
            }), 
            backgroundColor: '#10b981' 
        }];
        scales.x = { max: 100, beginAtZero: true };
    } else if (type === 'ng_rate') {
        datasets = [{ 
            label: '% NG Rate', 
            data: Object.values(pData).map(d => {
                const ngCount = d.ngTotalPcs !== undefined ? d.ngTotalPcs : (d.ngTotal || 0);
                const t = d.fg + ngCount; 
                return t > 0 ? parseFloat(((ngCount/t)*100).toFixed(2)) : 0;
            }), 
            backgroundColor: '#f43f5e' 
        }];
        scales.x = { max: 100, beginAtZero: true, title: {display: true, text: '% NG Rate'} };
    }  else if (type === 'ng_pcs') {
        datasets = [{ 
            label: 'NG (ชิ้น)', 
            data: Object.entries(pData).map(([prod, d]) => d.ngTotalPcs !== undefined ? d.ngTotalPcs : (d.ngTotal || 0)), 
            backgroundColor: '#ef4444' 
        }];
        scales.x = { beginAtZero: true };
    } else if (type === 'ng_kg') {
        datasets = [{ 
            label: 'NG (Kg)', 
            data: Object.entries(pData).map(([prod, d]) => {
                const pcs = d.ngTotalPcs !== undefined ? d.ngTotalPcs : (d.ngTotal || 0);
                return parseFloat(getKgFromPcs(prod, pcs).toFixed(2));
            }), 
            backgroundColor: '#f59e0b' 
        }];
        scales.x = { beginAtZero: true };
    } else if (type === 'ng_both') {
        datasets = [
            { 
                label: 'NG (ชิ้น)', 
                data: Object.entries(pData).map(([prod, d]) => d.ngTotalPcs !== undefined ? d.ngTotalPcs : (d.ngTotal || 0)), 
                backgroundColor: '#ef4444',
                xAxisID: 'x'
            },
            { 
                label: 'NG (Kg)', 
                data: Object.entries(pData).map(([prod, d]) => {
                    const pcs = d.ngTotalPcs !== undefined ? d.ngTotalPcs : (d.ngTotal || 0);
                    return parseFloat(getKgFromPcs(prod, pcs).toFixed(2));
                }), 
                backgroundColor: '#f59e0b',
                xAxisID: 'x1'
            }
        ];
        scales.x = { position: 'bottom', beginAtZero: true, title: {display: true, text: 'จำนวน (ชิ้น)'} };
        scales.x1 = { position: 'top', beginAtZero: true, grid: { drawOnChartArea: false }, title: {display: true, text: 'น้ำหนัก (Kg)'} };
    }

    const commonOpts = { 
         responsive: true, 
         maintainAspectRatio: false,
         onClick: (e, elements, chart) => {
             if (elements && elements.length > 0 && chart.options.scales) {
                 const axisId = chart.options.indexAxis === 'y' ? 'y' : 'x';
                 const index = elements[0].index;
                 if(chart.options.scales[axisId]) {
                     chart.options.scales[axisId].min = index;
                     chart.options.scales[axisId].max = index;
                     chart.update();
                 }
             }
         },
         plugins: {
             zoom: { pan: { enabled: true, mode: 'xy' }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' } }
         }
    };

    let dlFormatter = (value) => value > 0 ? value : null;
    if (type === 'yield' || type === 'ng_rate') dlFormatter = (value) => value > 0 ? value + '%' : null; // <--- แก้บรรทัดนี้
    else if (type === 'ng_pcs') dlFormatter = (value) => value > 0 ? value + ' ชิ้น' : null;
    else if (type === 'ng_kg') dlFormatter = (value) => value > 0 ? value + ' Kg' : null;
    else if (type === 'ng_both') dlFormatter = (value, ctx) => value > 0 ? value + (ctx.datasetIndex === 0 ? ' ชิ้น' : ' Kg') : null;

    const dataLabelsPlugin = typeof window.ChartDataLabels !== 'undefined' ? window.ChartDataLabels : null;
    const activePlugins = dataLabelsPlugin ? [dataLabelsPlugin] : [];

    charts.yieldModel = new Chart(ctxYM, { 
        type: 'bar', 
        plugins: activePlugins,
        data: { labels: displayLabels, datasets: datasets }, 
        options: {
            ...commonOpts, 
            indexAxis:'y', 
            scales: scales,
            layout: { padding: { right: 40, top: type==='ng_both'? 20 : 0 } }, 
            plugins: {
                ...commonOpts.plugins,
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const idx = context[0].dataIndex;
                            const originalModel = labels[idx];
                            const displayLabel = context[0].label;
                            if (viewBy === 'rawmat') {
                                return `Raw Mat: ${displayLabel}\nModel: ${originalModel}`;
                            }
                            return displayLabel;
                        },
                        label: function(context) {
                            let unit = '%';
                            if(type === 'ng_pcs' || (type === 'ng_both' && context.datasetIndex === 0)) unit = ' ชิ้น';
                            if(type === 'ng_kg' || (type === 'ng_both' && context.datasetIndex === 1)) unit = ' Kg';
                            return `${context.dataset.label}: ${context.parsed.x}${unit}`;
                        },
                        afterLabel: function(context) {
                            const idx = context.dataIndex;
                            const productName = labels[idx]; 
                            const prData = (data.productData && data.productData[productName]) ? data.productData[productName] : null;
                            if(!prData) return [];
                            
                            const fg = prData.fg || 0;
                            const ngTotal = prData.ngTotalPcs !== undefined ? prData.ngTotalPcs : (prData.ngTotal || 0);
                            
                            let lines = [
                                `----------------------`,
                                `✅ FG: ${fg.toLocaleString()} ชิ้น`,
                                `❌ NG รวม: ${ngTotal.toLocaleString()} ชิ้น`
                            ];
                            
                            if(prData.ngBreakdownPcs && Object.keys(prData.ngBreakdownPcs).length > 0) {
                                const prSep = window.separateSetupData(prData.ngBreakdownPcs);
                                const sortedNg = prSep.labels
                                    .map((l, idx) => [l, prSep.total[idx], prSep.setup[idx]])
                                    .filter(x => x[1] > 0)
                                    .sort((a, b) => b[1] - a[1]);

                                if(sortedNg.length > 0) {
                                    lines.push(`-- รายละเอียด NG --`);
                                    sortedNg.forEach(([k, total, setup]) => {
                                        let setupNote = setup > 0 ? ` (Setup: ${setup.toLocaleString()})` : '';
                                        lines.push(`   • ${k}: ${total.toLocaleString()} ชิ้น${setupNote}`);
                                    });
                                }
                            }
                            return lines;
                        }
                    }
                },
                datalabels: {
                    display: function(ctx) { const c = ctx.chart.canvas.closest('.widget-card'); return c ? c.classList.contains('maximized-card') : true; },
                    color: (ctx) => {
                        if (type === 'yield') return '#065f46';
                        if (type === 'ng_pcs' || (type==='ng_both' && ctx.datasetIndex === 0)) return '#b91c1c';
                        return '#b45309';
                    },
                    anchor: 'end',
                    align: 'right',
                    font: { weight: 'bold' },
                    formatter: dlFormatter
                }
            }
        } 
    });
};

// แหล่งข้อมูลเดียวของกราฟ Daily Output — ใช้ทั้งวาดกราฟและทำ Audit (ตัวเลขตรงกันเสมอ)
window.getDailyOutputSeries = function() {
    if (!currentDashboardData) return null;
    const data = currentDashboardData;

    const selector = document.getElementById('dailyOutputSelector');
    const mode = selector ? selector.value : 'pcs';

    // เลือกรุ่น (เติม dropdown จากรายการรุ่นในข้อมูล โดยคงค่าที่เลือกไว้)
    const modelSel = document.getElementById('dailyOutputModelSelector');
    let model = 'all';
    if (modelSel) {
        const models = Object.keys(data.productData || {});
        const desired = ['all'].concat(models);
        const current = Array.from(modelSel.options).map(o => o.value);
        const same = current.length === desired.length && current.every((v, i) => v === desired[i]);
        if (!same) {
            const prev = modelSel.value;
            modelSel.innerHTML = '';
            const allOpt = document.createElement('option');
            allOpt.value = 'all'; allOpt.textContent = 'ทุกรุ่น (รวม)';
            modelSel.appendChild(allOpt);
            models.forEach(m => {
                const o = document.createElement('option');
                o.value = m; o.textContent = m;
                modelSel.appendChild(o);
            });
            modelSel.value = desired.indexOf(prev) !== -1 ? prev : 'all';
        }
        model = modelSel.value;
    }

    // 📅 วัน/สัปดาห์/เดือน/ไตรมาส/ปี — ปุ่มสลับกลาง (helpers.js)
    const period = window.getChartPeriod ? window.getChartPeriod('dailyOutput') : 'day';
    const avgSel = document.getElementById('dailyOutputAvgSelector');
    const avgMode = avgSel ? avgSel.value : 'off';
    const hoursSel = document.getElementById('dailyOutputHoursSelector');
    const hoursMode = hoursSel ? hoursSel.value : 'off';
    // แยกงานที่ส่ง Sort แล้วยังไม่รู้ผล ออกมาเป็นก้อนของตัวเอง (หักออกจาก FG/NG ตามที่มา)
    const pendingSel = document.getElementById('dailyOutputPendingSelector');
    const pendingMode = pendingSel ? pendingSel.value : 'split';

    const trendData = data.dailyTrend || [];

    // รวมยอด FG/NG (งานผลิต + งานคัดแยก) + ชั่วโมง ตามรุ่นที่เลือก แล้วจัดกลุ่มตามช่วงเวลา
    const order = [];
    const grp = {};
    trendData.forEach(d => {
        let fg, ng, sFg, sNg, hrs, pendFromFg, pendFromNg;
        if (model === 'all') {
            const outputProd = d.dailyOutputProduction || null;
            fg = outputProd ? (outputProd.fg || 0) : (d.fg || 0);
            ng = outputProd ? (outputProd.ng || 0) : (d.ng || 0);
            sFg = (d.sortYield && d.sortYield.fg) || 0;
            sNg = (d.sortYield && d.sortYield.ng) || 0;
            hrs = d.workHours || 0;
            pendFromFg = d.pendingSortFromFg || 0;
            pendFromNg = (d.pendingSortFromNg !== undefined)
                ? d.pendingSortFromNg
                : Math.max(0, (d.pendingSortQty || 0) - (d.pendingSortFromFg || 0));
        } else {
            const outputByModel = d.dailyOutputProduction && d.dailyOutputProduction.byModel;
            const m = (outputByModel && outputByModel[model]) || (d.byModel && d.byModel[model]);
            fg = m ? (m.fg || 0) : 0;
            ng = m ? (m.ng || 0) : 0;
            const sm = d.sortByModel && d.sortByModel[model];
            sFg = sm ? (sm.fg || 0) : 0;
            sNg = sm ? (sm.ng || 0) : 0;
            hrs = (d.workHoursByModel && d.workHoursByModel[model]) || 0;
            const pm = d.pendingSortByModel && d.pendingSortByModel[model];
            pendFromFg = pm ? (pm.fromFg || 0) : 0;
            pendFromNg = pm ? (pm.fromNg || 0) : 0;
        }
        const key = window.getPeriodKey ? window.getPeriodKey(d.date, period) : d.date;
        if (!(key in grp)) { grp[key] = { fg: 0, ng: 0, sFg: 0, sNg: 0, hours: 0, pendFromFg: 0, pendFromNg: 0 }; order.push(key); }
        grp[key].fg += fg;
        grp[key].ng += ng;
        grp[key].sFg += sFg;
        grp[key].sNg += sNg;
        grp[key].hours += hrs;
        grp[key].pendFromFg += pendFromFg;
        grp[key].pendFromNg += pendFromNg;
    });

    const labels = order.map(k => window.formatPeriodLabel ? window.formatPeriodLabel(k, period) : k);
    const periods = [];
    const fgData = [], ngData = [], sortFgData = [], sortNgData = [], pendingData = [];
    const totalPcsData = [], fgPcsData = [], hoursData = [];
    order.forEach(k => {
        let fg = grp[k].fg, ng = grp[k].ng;
        const sFg = grp[k].sFg, sNg = grp[k].sNg;
        const hours = Math.round(grp[k].hours * 10) / 10;

        // งานที่ส่ง Sort แล้วยังไม่รู้ผล — ยึด "ขั้นตอนที่พบ" ว่ายอดนั้นเคยถูกบันทึกไว้แล้วหรือยัง
        //   พบระหว่างผลิต → ยังไม่เคยบันทึกเป็น FG/NG → เป็นก้อนใหม่ ไม่หักจากที่ไหน
        //   พบที่ FG/RTV  → เคยนับเป็น FG แล้ว → หักออกจากแท่ง FG (งานผลิต)
        // หักได้ไม่เกิน FG ของช่วงนั้น (ใบงานอาจลงคนละวันกับวันผลิต) ส่วนที่หักไม่ได้เก็บไว้ที่ pendExtra
        let pending = 0, cutFromFg = 0, fromLine = 0, pendExtra = 0;
        if (pendingMode !== 'merge') {
            const wantFg = grp[k].pendFromFg || 0;
            fromLine = grp[k].pendFromNg || 0;   // พบระหว่างผลิต
            cutFromFg = Math.min(fg, wantFg);
            pendExtra = wantFg - cutFromFg;
            fg -= cutFromFg;
            pending = wantFg + fromLine;
        }

        const grand = fg + ng + sFg + sNg + pending;
        periods.push({ key: k, fg, ng, sFg, sNg, pending, cutFromFg, fromLine, pendExtra,
                       hours, total: grand, fgGood: fg + sFg });
        totalPcsData.push(grand);
        fgPcsData.push(fg + sFg);
        hoursData.push(hours);
        if (mode === 'percent') {
            const pctOf = (v) => grand > 0 ? parseFloat(((v/grand)*100).toFixed(1)) : 0;
            fgData.push(pctOf(fg));
            ngData.push(pctOf(ng));
            sortFgData.push(pctOf(sFg));
            sortNgData.push(pctOf(sNg));
            pendingData.push(pctOf(pending));
        } else {
            fgData.push(fg);
            ngData.push(ng);
            sortFgData.push(sFg);
            sortNgData.push(sNg);
            pendingData.push(pending);
        }
    });

    const avgTotal = totalPcsData.length ? totalPcsData.reduce((a, b) => a + b, 0) / totalPcsData.length : 0;
    const avgFg = fgPcsData.length ? fgPcsData.reduce((a, b) => a + b, 0) / fgPcsData.length : 0;

    return { model, period, mode, avgMode, hoursMode, pendingMode, labels, periods,
             fgData, ngData, sortFgData, sortNgData, pendingData, totalPcsData, fgPcsData, hoursData, avgTotal, avgFg };
};

window.renderDailyOutputChart = function() {
    if (!currentDashboardData || !charts) return;
    const ctxDaily = document.getElementById('dailyOutputChart');
    if (!ctxDaily) return;

    // การแสดงตัวเลขบนกราฟ: auto (เมื่อขยาย) / hide (ซ่อน) / show (แสดงเสมอ)
    const labelSel = document.getElementById('dailyOutputLabelSelector');
    const labelMode = labelSel ? labelSel.value : 'auto';

    // ใช้แหล่งข้อมูลเดียวกับ Audit เพื่อให้ตัวเลขตรงกัน
    const S = window.getDailyOutputSeries();
    if (!S) return;
    const mode = S.mode, period = S.period, avgMode = S.avgMode, hoursMode = S.hoursMode;
    const labels = S.labels;
    const fgData = S.fgData, ngData = S.ngData, sortFgData = S.sortFgData, sortNgData = S.sortNgData;
    const pendingData = S.pendingData || [];
    const periods = S.periods || [];
    const hasPending = pendingData.some(v => v > 0);
    const totalPcsData = S.totalPcsData, fgPcsData = S.fgPcsData, hoursData = S.hoursData;

    if (charts.dailyOutput) charts.dailyOutput.destroy();

    const commonOpts = { 
         responsive: true, 
         maintainAspectRatio: false,
         onClick: (e, elements, chart) => {
             if (elements && elements.length > 0 && chart.options.scales) {
                 const axisId = chart.options.indexAxis === 'y' ? 'y' : 'x';
                 const index = elements[0].index;
                 if(chart.options.scales[axisId]) {
                     chart.options.scales[axisId].min = index;
                     chart.options.scales[axisId].max = index;
                     chart.update();
                 }
             }
         },
         plugins: {
             zoom: { pan: { enabled: true, mode: 'xy' }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' } }
         }
    };

    const dataLabelsPlugin = typeof window.ChartDataLabels !== 'undefined' ? window.ChartDataLabels : null;
    const activePlugins = dataLabelsPlugin ? [dataLabelsPlugin] : [];

    // วาดยอดรวม (ชิ้น) ไว้บนยอดแท่ง เมื่อขยายการ์ดเต็มจอ
    const totalLabelPlugin = {
        id: 'dailyOutputTotalLabel',
        afterDatasetsDraw(chart) {
            if (labelMode === 'hide') return;
            let show = labelMode === 'show';
            if (!show) {
                const card = chart.canvas.closest('.widget-card');
                show = card ? card.classList.contains('maximized-card') : false;
            }
            if (!show) return;
            const yScale = chart.scales.y;
            const meta = chart.getDatasetMeta(0);
            if (!yScale || !meta) return;
            const ctx = chart.ctx;
            ctx.save();
            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = '#1f2937';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            for (let i = 0; i < labels.length; i++) {
                const totalPcs = totalPcsData[i] || 0;
                if (totalPcs <= 0) continue;
                const bar = meta.data[i];
                if (!bar) continue;
                const stackTopVal = mode === 'percent'
                    ? (fgData[i] + ngData[i] + sortFgData[i] + sortNgData[i])
                    : totalPcs;
                ctx.fillText(totalPcs.toLocaleString(), bar.x, yScale.getPixelForValue(stackTopVal) - 4);
            }
            ctx.restore();
        }
    };

    // เส้นค่าเฉลี่ย (เส้นประแนวนอน) — คิดจากยอดจริงเป็นชิ้น เฉลี่ยทุกช่วงที่แสดง (เฉพาะโหมดชิ้น)
    const avgLinePlugin = {
        id: 'dailyOutputAvgLine',
        afterDatasetsDraw(chart) {
            if (avgMode === 'off' || mode !== 'pcs') return;
            const metric = avgMode === 'fg' ? fgPcsData : totalPcsData;
            if (!metric.length) return;
            const avg = metric.reduce((a, b) => a + b, 0) / metric.length;
            if (!(avg > 0)) return;
            const yScale = chart.scales.y;
            const area = chart.chartArea;
            if (!yScale || !area) return;
            const yPix = yScale.getPixelForValue(avg);
            const ctx = chart.ctx;
            ctx.save();
            ctx.strokeStyle = '#7c3aed';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(area.left, yPix);
            ctx.lineTo(area.right, yPix);
            ctx.stroke();
            ctx.setLineDash([]);
            const txt = (avgMode === 'fg' ? 'เฉลี่ย FG: ' : 'เฉลี่ยรวม: ') + Math.round(avg).toLocaleString() + ' ชิ้น';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = '#7c3aed';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillText(txt, area.right - 4, yPix - 3);
            ctx.restore();
        }
    };

    let scales = { x: { stacked: true }, y: { stacked: true, beginAtZero: true } };
    if (mode === 'percent') {
        scales.y.max = 100;
        scales.y.title = { display: true, text: 'สัดส่วน (%)' };
    } else {
        scales.y.title = { display: true, text: 'จำนวน (ชิ้น)' };
    }
    if (hoursMode !== 'off') {
        scales.yHours = {
            position: 'right',
            beginAtZero: true,
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'ชั่วโมง-เครื่อง' }
        };
    }

    const chartDatasets = [
        {label:'FG (งานผลิต)', data:fgData, backgroundColor:'#3b82f6', borderRadius: 2},
        {label:'NG (งานผลิต)', data:ngData, backgroundColor:'#ef4444', borderRadius: 2},
        {label:'FG (คัดแยก)', data:sortFgData, backgroundColor:'#10b981', borderRadius: 2},
        {label:'NG (คัดแยก)', data:sortNgData, backgroundColor:'#f59e0b', borderRadius: 2}
    ];
    if (hasPending) {
        // ก้อนงานที่ส่ง Sort แล้วยังไม่รู้ผล — ถูกหักออกจาก FG/NG ด้านบนแล้ว จึงไม่นับซ้ำ
        chartDatasets.push({label:'รอ Sort (ยังไม่รู้ผล)', data:pendingData, backgroundColor:'#a855f7', borderRadius: 2});
    }
    if (hoursMode !== 'off') {
        chartDatasets.push({
            type: 'line',
            label: 'ชั่วโมง-เครื่อง (รวม)',
            data: hoursData,
            yAxisID: 'yHours',
            borderColor: '#0ea5e9',
            backgroundColor: '#0ea5e9',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5,
            fill: false,
            datalabels: { display: false }
        });
    }

    charts.dailyOutput = new Chart(ctxDaily, {
         type: 'bar',
         plugins: activePlugins.concat([totalLabelPlugin, avgLinePlugin], window.qcCrosshairPlugin ? [window.qcCrosshairPlugin] : []),
         data: {
             labels: labels,
             datasets: chartDatasets
         },
         options: {
             ...commonOpts,
             scales: scales,
             layout: { padding: { top: 18 } },
             plugins: {
                 ...commonOpts.plugins,
                 tooltip: {
                     callbacks: {
                         title: function(items) {
                             const p = periods[items[0].dataIndex];
                             if (p && window.formatPeriodTitle) return window.formatPeriodTitle(p.key, period);
                             return items[0].label;
                         },
                         label: function(context) {
                             if (context.dataset.yAxisID === 'yHours') {
                                 return `${context.dataset.label}: ${context.parsed.y} ชม.`;
                             }
                             return `${context.dataset.label}: ${context.parsed.y}${mode === 'percent' ? '%' : ' ชิ้น'}`;
                         },
                         footer: function(items) {
                             const idx = items[0].dataIndex;
                             const lines = ['รวมทั้งหมด: ' + (totalPcsData[idx] || 0).toLocaleString() + ' ชิ้น'];
                             const p = periods[idx];
                             if (p && p.pending > 0) {
                                 lines.push(`รอ Sort ${p.pending.toLocaleString()} ชิ้น — พบระหว่างผลิต ${(p.fromLine || 0).toLocaleString()} (ยอดใหม่) · พบที่ FG/RTV ${p.cutFromFg.toLocaleString()} (หักจาก FG แล้ว)`);
                                 if (p.pendExtra > 0) {
                                     lines.push(`⚠️ ของที่พบที่ FG อีก ${p.pendExtra.toLocaleString()} ชิ้น หักจากวันนี้ไม่ได้ (ยอด FG อยู่วันอื่น)`);
                                 }
                             }
                             return lines;
                         }
                     }
                 },
                 datalabels: {
                     display: function(ctx) {
                         if (labelMode === 'hide') return false;
                         if (labelMode === 'show') return true;
                         const c = ctx.chart.canvas.closest('.widget-card');
                         return c ? c.classList.contains('maximized-card') : true;
                     },
                     color: '#ffffff',
                     font: { weight: 'bold', size: 11 },
                     formatter: (value) => value > 0 ? value + (mode === 'percent' ? '%' : '') : null
                 }
             }
         } 
    });
};

// 📅 ปุ่มสลับ วัน/สัปดาห์/เดือน/ไตรมาส/ปี ของกราฟ Daily Output
if (window.registerChartPeriod) window.registerChartPeriod('dailyOutput', () => window.renderDailyOutputChart());
