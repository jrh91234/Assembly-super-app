window.renderCharts = function(data) {
    try {
         if(!charts) charts = {};
         
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
                 zoom: {
                     pan: { enabled: true, mode: 'xy' },
                     zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }
                 }
             }
         };
         
         const dataLabelsPlugin = typeof window.ChartDataLabels !== 'undefined' ? window.ChartDataLabels : null;
         const activePlugins = dataLabelsPlugin ? [dataLabelsPlugin] : [];

         // === Base symptom data (ใช้สำหรับ NG by Machine chart และ Doughnut) ===
         const baseNgLabels = data.ngLabels || [];
         const baseNgValsPcs = data.ngValuesPcs || data.ngValues || [];
         const baseRawPcsMap = {};
         baseNgLabels.forEach((l, i) => { baseRawPcsMap[l] = (baseRawPcsMap[l] || 0) + (baseNgValsPcs[i] || 0); });
         const separatedBySymptom = window.separateSetupData(baseRawPcsMap);

         // === Pareto View Selector (symptom / model / machine) ===
         const paretoSelector = document.getElementById('paretoViewSelector');
         const paretoView = paretoSelector ? paretoSelector.value : 'symptom';

         // === Pareto Machine Filter (เลือกเครื่องเฉพาะเมื่อดูตามอาการ) ===
         const paretoMacSel = document.getElementById('paretoMachineSelector');
         if (paretoMacSel) {
             // แสดง/ซ่อน machine selector ตาม view
             paretoMacSel.style.display = (paretoView === 'symptom') ? '' : 'none';
             const prevVal = paretoMacSel.value;
             const allMachines = Object.keys(data.machineData || {}).sort();
             paretoMacSel.innerHTML = '<option value="all">ทุกเครื่อง</option>';
             allMachines.forEach(m => {
                 const md = data.machineData[m];
                 const hasNg = md && md.ngBreakdownPcs && Object.keys(md.ngBreakdownPcs).length > 0;
                 if (hasNg) {
                     const opt = document.createElement('option');
                     opt.value = m;
                     opt.textContent = m;
                     paretoMacSel.appendChild(opt);
                 }
             });
             if (prevVal && [...paretoMacSel.options].some(o => o.value === prevVal)) {
                 paretoMacSel.value = prevVal;
             }
         }
         const selectedParetoMac = (paretoMacSel && paretoView === 'symptom') ? paretoMacSel.value : 'all';

         // คำนวณจำนวนเปลี่ยนม้วนรวม (จาก dailyTrend) สำหรับ Pareto tooltip
         let paretoTotalCoils = 0;
         (data.dailyTrend || []).forEach(day => {
             if (selectedParetoMac !== 'all') {
                 paretoTotalCoils += (day.coilChangesByMachine && day.coilChangesByMachine[selectedParetoMac]) || 0;
             } else {
                 paretoTotalCoils += day.coilChanges || 0;
             }
         });

         let separated = { labels: [], production: [], setup: [], total: [] };
         let hasSetup = false;
         let paretoBarLabel = 'NG (ชิ้น)';

         if (paretoView === 'symptom') {
             // กรองตามเครื่องที่เลือก (ถ้าเลือก)
             let rawPcsMap = {};
             if (selectedParetoMac !== 'all' && data.machineData && data.machineData[selectedParetoMac]) {
                 rawPcsMap = { ...(data.machineData[selectedParetoMac].ngBreakdownPcs || {}) };
             } else {
                 const baseNgLabels = data.ngLabels || [];
                 const baseNgValsPcs = data.ngValuesPcs || data.ngValues || [];
                 baseNgLabels.forEach((l, i) => { rawPcsMap[l] = (rawPcsMap[l] || 0) + (baseNgValsPcs[i] || 0); });
             }
             separated = window.separateSetupData(rawPcsMap);
             hasSetup = separated.setup.some(v => v > 0);
             paretoBarLabel = hasSetup ? 'Production (ชิ้น)' : 'NG (ชิ้น)';
         } else {
             const groupedMap = {};
             const mapSource = (typeof machineMapping !== 'undefined' && machineMapping)
                 ? machineMapping
                 : (window.globalMachineMapping || data.machineMapping || {});

             Object.entries(data.machineData || {}).forEach(([machineName, mData]) => {
                 const sep = window.separateSetupData(mData.ngBreakdownPcs || {});
                 const totalNg = sep.total.reduce((sum, v) => sum + v, 0);
                 if (totalNg <= 0) return;

                 const key = (paretoView === 'model')
                     ? (mapSource[machineName] && mapSource[machineName] !== 'Unassigned' ? mapSource[machineName] : 'Unassigned')
                     : machineName;
                 groupedMap[key] = (groupedMap[key] || 0) + totalNg;
             });

             const sortedEntries = Object.entries(groupedMap).sort((a, b) => b[1] - a[1]);
             separated.labels = sortedEntries.map(([k]) => k);
             separated.total = sortedEntries.map(([, v]) => v);
             separated.production = [...separated.total];
             separated.setup = separated.total.map(() => 0);
             paretoBarLabel = paretoView === 'model' ? 'NG ตามรุ่น (ชิ้น)' : 'NG ตามเครื่อง (ชิ้น)';
         }

         const totalNG = separated.total.reduce((a,b) => a+b, 0);
         let acc = 0;
         const cumulative = separated.total.map(v => { acc += v; return totalNG > 0 ? ((acc/totalNG)*100).toFixed(1) : 0; });

         // อัปเดตหัวข้อ Pareto ตามเครื่อง/มุมมองที่เลือก
         const paretoCard = document.getElementById('card-pareto');
         if (paretoCard) {
             const h3 = paretoCard.querySelector('h3');
             if (h3) {
                 if (paretoView !== 'symptom') {
                     h3.textContent = paretoView === 'model' ? '📉 NG Analysis — ตามรุ่น' : '📉 NG Analysis — ตามเครื่อง';
                 } else if (selectedParetoMac !== 'all') {
                     h3.textContent = `📉 NG Analysis — ${selectedParetoMac}`;
                 } else {
                     h3.textContent = '📉 NG Analysis (Pareto)';
                 }
             }
         }

         const ctxP = document.getElementById('paretoChart');
         if(ctxP) {
             if(charts.pareto) charts.pareto.destroy();
             const paretoDatasets = [
                 { label: '% สะสม', data: cumulative, type: 'line', borderColor: '#8b5cf6', yAxisID: 'y1', datalabels: { display: false }, stack: false },
                 { label: paretoBarLabel, data: separated.production, backgroundColor: '#ef4444', yAxisID: 'y', stack: 'paretoStack', datalabels: {
                    display: function(ctx) { if (!hasSetup) { const c = ctx.chart.canvas.closest('.widget-card'); return c ? c.classList.contains('maximized-card') : true; } return false; },
                    align: 'end', anchor: 'end', formatter: (v) => v > 0 ? v.toLocaleString() + ' ชิ้น' : null
                 } }
             ];
             if (paretoView === 'symptom' && hasSetup) {
                 paretoDatasets.push({
                     label: 'Setup (ชิ้น)', data: separated.setup, backgroundColor: '#fb923c', yAxisID: 'y', stack: 'paretoStack',
                     borderColor: '#ea580c', borderWidth: 1, borderDash: [3, 2],
                     datalabels: {
                         display: function(ctx) { const c = ctx.chart.canvas.closest('.widget-card'); return c ? c.classList.contains('maximized-card') : true; },
                         align: 'end', anchor: 'end',
                         formatter: (v, ctx) => {
                             const total = separated.total[ctx.dataIndex];
                             return total > 0 ? total.toLocaleString() + ' ชิ้น' : null;
                         }
                     }
                 });
             }
             charts.pareto = new Chart(ctxP, {
                 type: 'bar', plugins: activePlugins,
                 data: { labels: separated.labels, datasets: paretoDatasets },
                 options: {
                     ...commonOpts, layout: { padding: { top: 20 } },
                     scales: {
                         x: { stacked: true },
                         y: { stacked: true, beginAtZero: true, grace: '10%' },
                         y1: { beginAtZero: true, max: 105, position: 'right', grid: { display: false } }
                     },
                     plugins: {
                         ...commonOpts.plugins,
                         tooltip: {
                             callbacks: {
                                 afterBody: function(context) {
                                     const idx = context[0].dataIndex;
                                     const lines = [];
                                     if (hasSetup) {
                                         const prod = separated.production[idx] || 0;
                                         const setup = separated.setup[idx] || 0;
                                         const total = prod + setup;
                                         if (total > 0) lines.push(`รวม: ${total.toLocaleString()} ชิ้น (Production: ${prod.toLocaleString()}, Setup: ${setup.toLocaleString()})`);
                                     }
                                     // แสดงข้อมูลเปลี่ยนม้วนเมื่อ hover อาการเปลี่ยนม้วน
                                     if (paretoView === 'symptom' && paretoTotalCoils > 0) {
                                         const label = (separated.labels[idx] || '').toLowerCase();
                                         if (label.includes('เปลี่ยนม้วน') || label.includes('roll change')) {
                                             const ngPcs = separated.total[idx] || 0;
                                             const avg = (ngPcs / paretoTotalCoils).toFixed(1);
                                             lines.push(`🔄 เปลี่ยนม้วน: ${paretoTotalCoils} ม้วน`);
                                             lines.push(`📊 เฉลี่ย: ${avg} ชิ้น/ม้วน`);
                                         }
                                     }
                                     return lines.join('\n');
                                 }
                             }
                         }
                     }
                 }
             });
         }
         
         const ctxNgMac = document.getElementById('ngByMachineChart');
         if(ctxNgMac) {
             if(charts.ngMachine) charts.ngMachine.destroy();

             // ใช้ merged labels จาก Pareto (Setup รวมเข้ากับอาการหลัก)
             const sortedNgLabels = separatedBySymptom.labels.filter((l, i) => separatedBySymptom.total[i] > 0);

             const macColors = [
                 '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
                 '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
             ];
             let macDatasets = [];
             let colorIdx = 0;

             const allMacs = Object.keys(data.machineData || {}).sort();

             allMacs.forEach(m => {
                 const mData = data.machineData[m];
                 if (!mData.ngBreakdownPcs) return;
                 // แยก Setup ของเครื่องนี้
                 const macSep = window.separateSetupData(mData.ngBreakdownPcs);
                 let hasNg = false;

                 // Production layer
                 const prodData = sortedNgLabels.map(ngLabel => {
                     const idx = macSep.labels.indexOf(ngLabel);
                     const val = idx >= 0 ? macSep.production[idx] : 0;
                     if (val > 0) hasNg = true;
                     return val;
                 });

                 // Setup layer
                 const setupData = sortedNgLabels.map(ngLabel => {
                     const idx = macSep.labels.indexOf(ngLabel);
                     return idx >= 0 ? macSep.setup[idx] : 0;
                 });
                 const hasSetupForMac = setupData.some(v => v > 0);
                 if (hasSetupForMac) hasNg = true;

                 if (hasNg) {
                     const color = macColors[colorIdx % macColors.length];
                     macDatasets.push({
                         label: m,
                         data: prodData,
                         backgroundColor: color,
                         stack: 'StackProd'
                     });
                     if (hasSetupForMac) {
                         // Setup ใช้สีเดียวกันแต่จางลง + ลายเส้น
                         macDatasets.push({
                             label: m + ' (Setup)',
                             data: setupData,
                             backgroundColor: color + '80', // 50% opacity
                             borderColor: color,
                             borderWidth: 1,
                             borderDash: [4, 2],
                             stack: 'StackSetup'
                         });
                     }
                     colorIdx++;
                 }
             });

             charts.ngMachine = new Chart(ctxNgMac, {
                 type: 'bar',
                 data: {
                     labels: sortedNgLabels,
                     datasets: macDatasets
                 },
                 options: {
                     ...commonOpts,
                     scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
                     plugins: {
                         ...commonOpts.plugins,
                         legend: {
                             display: window.innerWidth > 768,
                             position: 'right',
                             labels: {
                                 boxWidth: 12, font: { size: 10 },
                                 filter: function(item) {
                                     // ซ่อน "(Setup)" จาก legend ถ้าไม่จำเป็น
                                     return !item.text.includes('(Setup)');
                                 }
                             }
                         },
                         tooltip: {
                             mode: 'index',
                             intersect: false,
                             itemSort: function(a, b) { return b.raw - a.raw; },
                             filter: function(tooltipItem) { return tooltipItem.raw > 0; },
                             callbacks: {
                                 title: function(context) { return `อาการ: ${context[0].label}`; }
                             }
                         },
                         datalabels: {
                             display: function(ctx) {
                                 const c = ctx.chart.canvas.closest('.widget-card');
                                 const isMax = c ? c.classList.contains('maximized-card') : false;
                                 return ctx.dataset.data[ctx.dataIndex] > 0 && isMax;
                             },
                             color: '#ffffff',
                             font: { weight: 'bold', size: 11 },
                             formatter: (value, ctx) => { return `${ctx.dataset.label}: ${value}`; }
                         }
                     }
                 }
             });
         }

         window.renderDailyOutputChart();

         const hNgPcs = data.hourlyNgPcsData || data.hourlyNgData || []; 
         const ctxH = document.getElementById('hourlyChart');
         if(ctxH) {
             if(charts.hourly) charts.hourly.destroy();
             
             const cleanHourlyLabels = (data.hourlyLabels || []).map(label => {
                 const parts = label.split('-');
                 if (parts.length > 1) {
                     const match = parts[1].match(/(\d{2}):/);
                     return match ? match[1] + ":00" : label;
                 }
                 const fallbackMatch = label.match(/(\d{2}):/);
                 return fallbackMatch ? fallbackMatch[1] + ":00" : label;
             });

             let hourlyDatasets = [];
             
             if (data.hourlyByModel && Object.keys(data.hourlyByModel).length > 0) {
                 const fgColors = ['#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e3a8a']; 
                 const ngColors = ['#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#7f1d1d'];
                 
                 let cIdx = 0;
                 for (const [model, d] of Object.entries(data.hourlyByModel)) {
                     hourlyDatasets.push({
                         label: `FG - ${model}`,
                         data: d.fg,
                         backgroundColor: fgColors[cIdx % fgColors.length],
                         stack: 'Stack 0',
                         borderWidth: 1,
                         borderColor: 'rgba(255,255,255,0.2)'
                     });
                     cIdx++;
                 }
                 
                 cIdx = 0;
                 for (const [model, d] of Object.entries(data.hourlyByModel)) {
                     hourlyDatasets.push({
                         label: `NG - ${model}`,
                         data: d.ng,
                         backgroundColor: ngColors[cIdx % ngColors.length],
                         stack: 'Stack 0',
                         borderWidth: 1,
                         borderColor: 'rgba(255,255,255,0.2)'
                     });
                     cIdx++;
                 }
             } else {
                 hourlyDatasets = [
                     {label:'FG (รวม)', data:data.hourlyData || [], backgroundColor:'#3b82f6', stack: 'Stack 0'}, 
                     {label:'NG (เสียเป็นชิ้น)', data:hNgPcs, backgroundColor:'#ef4444', stack: 'Stack 0'}
                 ];
             }

             charts.hourly = new Chart(ctxH, { 
                 type: 'bar', 
                 data: { 
                     labels: cleanHourlyLabels, 
                     datasets: hourlyDatasets
                 }, 
                 options: {
                     ...commonOpts, 
                     scales:{x:{stacked:true}, y:{stacked:true}},
                     plugins: {
                         ...commonOpts.plugins,
                         legend: { display: false }, 
                         tooltip: {
                             mode: 'index',
                             intersect: false,
                             filter: function(tooltipItem) {
                                 return tooltipItem.raw > 0;
                             }
                         },
                         datalabels: {
                             display: function(ctx) { 
                                 const c = ctx.chart.canvas.closest('.widget-card'); 
                                 const isMax = c ? c.classList.contains('maximized-card') : true; 
                                 return isMax && ctx.dataset.data[ctx.dataIndex] > 0; 
                             },
                             color: '#ffffff',
                             font: { weight: 'bold', size: 10 },
                             formatter: (value) => value > 0 ? value : null
                         }
                     }
                 },
                 plugins: [
                     ...(activePlugins || []),
                     {
                         id: 'customHtmlLegend',
                         afterUpdate: function(chart) {
                             const container = document.getElementById('hourly-legend-ul');
                             if (!container) return;
                             container.innerHTML = ''; 
                             
                             const items = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                             
                             const half = Math.ceil(items.length / 2);
                             let interleaved = [];
                             for(let i = 0; i < half; i++) {
                                 interleaved.push(items[i]);                 
                                 if(items[i+half]) interleaved.push(items[i+half]); 
                             }
                             
                             interleaved.forEach(item => {
                                 const li = document.createElement('li');
                                 li.className = `flex items-center cursor-pointer text-[10px] md:text-xs ${item.hidden ? 'line-through text-gray-300' : 'text-gray-700'} hover:text-blue-600 transition-colors`;
                                 
                                 li.onclick = () => {
                                     const isHidden = chart.isDatasetVisible(item.datasetIndex);
                                     chart.setDatasetVisibility(item.datasetIndex, !isHidden);
                                     chart.update();
                                 };
                                 
                                 const box = document.createElement('span');
                                 box.className = 'w-3 h-3 md:w-4 md:h-4 inline-block mr-1.5 flex-none rounded-sm shadow-sm';
                                 box.style.backgroundColor = item.fillStyle;
                                 box.style.border = item.lineWidth > 0 ? `${item.lineWidth}px solid ${item.strokeStyle}` : '1px solid rgba(0,0,0,0.1)';
                                 
                                 const text = document.createElement('span');
                                 text.className = 'truncate leading-none';
                                 text.title = item.text; 
                                 text.innerText = item.text;
                                 
                                 li.appendChild(box);
                                 li.appendChild(text);
                                 container.appendChild(li);
                             });
                         }
                     }
                 ]
             });
         }

         const ctxYieldM = document.getElementById('yieldMachineChart');
         if(ctxYieldM) {
            if(charts.yieldMachine) charts.yieldMachine.destroy();
            const macs = []; for(let i=1;i<=16;i++) macs.push(`CWM-${String(i).padStart(2,'0')}`);
            charts.yieldMachine = new Chart(ctxYieldM, { 
                type: 'bar', 
                data: { 
                    labels: macs, 
                    datasets: [{ 
                        label: '% Yield', 
                        data: macs.map(m=>{
                            const d = (data.machineData && data.machineData[m]) ? data.machineData[m] : null; 
                            if(!d) return 0; 
                            const ngCount = d.ngTotalPcs !== undefined ? d.ngTotalPcs : (d.ngTotal || 0);
                            const t = d.fg + ngCount; 
                            return t > 0 ? ((d.fg/t)*100).toFixed(1) : 0;
                        }), 
                        backgroundColor: '#6366f1' 
                    }] 
                }, 
                options: {
                    ...commonOpts, 
                    scales:{y:{max:100}},
                    layout: { padding: { top: 40 } }, 
                    plugins: {
                        ...commonOpts.plugins,
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `Yield: ${context.parsed.y}%`;
                                },
                                afterLabel: function(context) {
                                    const machineName = context.label;
                                    const mData = (data.machineData && data.machineData[machineName]) ? data.machineData[machineName] : null;
                                    if(!mData) return [];
                                    
                                    const fg = mData.fg || 0;
                                    const ngTotal = mData.ngTotalPcs !== undefined ? mData.ngTotalPcs : (mData.ngTotal || 0);
                                    
                                    let lines = [
                                        `----------------------`,
                                        `✅ FG: ${fg.toLocaleString()} ชิ้น`,
                                        `❌ NG รวม: ${ngTotal.toLocaleString()} ชิ้น`
                                    ];
                                    
                                    if(mData.ngBreakdownPcs && Object.keys(mData.ngBreakdownPcs).length > 0) {
                                        const mdSep = window.separateSetupData(mData.ngBreakdownPcs);
                                        const sortedNg = mdSep.labels
                                            .map((l, idx) => [l, mdSep.total[idx], mdSep.setup[idx]])
                                            .filter(x => x[1] > 0)
                                            .sort((a, b) => b[1] - a[1]);

                                        if(sortedNg.length > 0) {
                                            lines.push(`-- รายละเอียด NG --`);
                                            sortedNg.forEach(([k, total, setup]) => {
                                                let sn = setup > 0 ? ` (Setup: ${setup.toLocaleString()})` : '';
                                                lines.push(`   • ${k}: ${total.toLocaleString()} ชิ้น${sn}`);
                                            });
                                        }
                                    }
                                    return lines;
                                }
                            }
                        },
                        datalabels: {
                            display: function(ctx) { const c = ctx.chart.canvas.closest('.widget-card'); return c ? c.classList.contains('maximized-card') : true; },
                            color: '#4338ca', 
                            anchor: 'end',    
                            align: 'top',     
                            font: { weight: 'bold' },
                            formatter: (value) => value > 0 ? value + '%' : null
                        }
                    }
                } 
            });
         }

const ctxQC = document.getElementById('qcTrendChart');
         if(ctxQC) {
            if(charts.qcTrend) charts.qcTrend.destroy();
            
            // 🌟 อ่านค่า Model ที่ต้องการกรอง
            const qcSelector = document.getElementById('qcModelSelector');
            const selectedModel = qcSelector ? qcSelector.value : 'all';

            const trendData = data.dailyTrend || [];
            
            // uses shared getWppStrict / getKgFromPcs from helpers.js

            let displayTrendData = trendData.map(originalDay => {
                const dateStr = originalDay.date;
                
                let mFgKg = 0; let mNgKg = 0; let mPendingKg = 0;
                let mFgPcs = 0; let mNgPcs = 0; let mPendingPcs = 0;
                let modelNgBreakdownKg = {};
                let modelSortFgPcs = 0; let modelSortNgPcs = 0;
                let pendingByMachine = []; // เก็บรายละเอียดงานรอ Sort แยกตามเครื่อง
                let ngByMachine = []; // เก็บรายละเอียด NG แยกตามเครื่อง

                Object.entries(data.machineData || {}).forEach(([mac, mData]) => {
                    let assignedModel = '';
                    if (typeof machineMapping !== 'undefined' && machineMapping[mac]) {
                        assignedModel = machineMapping[mac];
                    } else if (typeof globalMachineMapping !== 'undefined' && globalMachineMapping[mac]) {
                        assignedModel = globalMachineMapping[mac];
                    } else if (data.machineMapping && data.machineMapping[mac]) {
                        assignedModel = data.machineMapping[mac];
                    }

                    // ข้ามเครื่องที่ไม่ได้ Assign รุ่น (ไม่มี WPP ที่ถูกต้อง)
                    if (!assignedModel || getWppStrict(assignedModel) === null) return;

                    if (selectedModel === 'all' || assignedModel === selectedModel || assignedModel.includes(selectedModel)) {
                        if (mData.daily && mData.daily[dateStr]) {
                            const dailyFgPcs = mData.daily[dateStr].fg || 0;
                            const dailyNgPcs = mData.daily[dateStr].ngPcs !== undefined ? mData.daily[dateStr].ngPcs : (mData.daily[dateStr].ng || 0);

                            mFgPcs += dailyFgPcs;
                            mNgPcs += dailyNgPcs;

                            mFgKg += getKgFromPcs(assignedModel, dailyFgPcs);
                            mNgKg += getKgFromPcs(assignedModel, dailyNgPcs);

                            if (mData.daily[dateStr].ngBreakdown) {
                                for (const [symp, pcs] of Object.entries(mData.daily[dateStr].ngBreakdown)) {
                                    const sympKg = getKgFromPcs(assignedModel, pcs);
                                    modelNgBreakdownKg[symp] = (modelNgBreakdownKg[symp] || 0) + sympKg;
                                }
                            }
                            // เก็บ NG แยกตามเครื่อง
                            if (dailyNgPcs > 0) {
                                ngByMachine.push({ machine: mac, model: assignedModel, ngPcs: dailyNgPcs, fgPcs: dailyFgPcs, symptoms: mData.daily[dateStr].ngBreakdown || {} });
                            }
                        }
                        if (mData.sortData && mData.sortData[dateStr]) {
                            const pendingPcs = mData.sortData[dateStr].pendingPcs || 0;
                            mPendingPcs += pendingPcs;
                            mPendingKg += getKgFromPcs(assignedModel, pendingPcs);

                            modelSortFgPcs += mData.sortData[dateStr].fgPcs || 0;
                            modelSortNgPcs += mData.sortData[dateStr].ngPcs || 0;

                            // เก็บรายละเอียดงานรอ Sort แยกตามเครื่อง+อาการจริงจาก Sorting_Data
                            if (pendingPcs > 0) {
                                const realSymptoms = mData.sortData[dateStr].pendingBySymptom || null;
                                let symptoms = {};
                                let estimated = false;
                                if (realSymptoms && Object.keys(realSymptoms).length > 0) {
                                    // มีข้อมูลอาการจริงจาก backend
                                    symptoms = realSymptoms;
                                } else if (mData.daily && mData.daily[dateStr] && mData.daily[dateStr].ngBreakdown) {
                                    // Fallback: ประมาณจากสัดส่วน NG ของเครื่องนั้น
                                    const ngBk = mData.daily[dateStr].ngBreakdown;
                                    const totalNgDay = Object.values(ngBk).reduce((a, b) => a + b, 0);
                                    if (totalNgDay > 0) {
                                        for (const [symp, pcs] of Object.entries(ngBk)) {
                                            symptoms[symp] = Math.round((pcs / totalNgDay) * pendingPcs);
                                        }
                                        estimated = true;
                                    }
                                }
                                pendingByMachine.push({ machine: mac, model: assignedModel, pendingPcs, symptoms, estimated });
                            }
                        }
                    }
                });

                return {
                    date: dateStr,
                    fgKg: mFgKg, ngKg: mNgKg, fgPcs: mFgPcs, ngPcs: mNgPcs,
                    pendingSortQty: mPendingPcs,
                    pendingKg: mPendingKg,
                    ngBreakdownKg: modelNgBreakdownKg,
                    pendingByMachine: pendingByMachine,
                    ngByMachine: ngByMachine,
                    coilChanges: originalDay.coilChanges || 0,
                    coilChangesByMachine: originalDay.coilChangesByMachine || {}
                };
            });

            // 📅 รวมเป็นรายสัปดาห์ / เดือน / ไตรมาส / ปี (แบบกราฟหุ้น) — รวม Kg/ชิ้น แล้วคำนวณ % ใหม่จากยอดรวม
            const qcPeriod = window.getChartPeriod ? window.getChartPeriod('qcTrend') : 'day';
            if (qcPeriod !== 'day' && window.groupRowsByPeriod) {
                // รวมรายการรายเครื่องของหลายวันเป็นเครื่องละ 1 แถว
                const mergeByMachine = (list, qtyKey) => {
                    const map = {};
                    list.forEach(it => {
                        const m = map[it.machine] || (map[it.machine] = Object.assign({}, it, { symptoms: {} }, { [qtyKey]: 0, fgPcs: 0 }));
                        m[qtyKey] += it[qtyKey] || 0;
                        m.fgPcs += it.fgPcs || 0;
                        if (it.estimated) m.estimated = true;
                        window.mergeNumberMap(m.symptoms, it.symptoms);
                    });
                    return Object.values(map);
                };
                displayTrendData = window.groupRowsByPeriod(displayTrendData, qcPeriod, r => r.date,
                    () => ({ fgKg: 0, ngKg: 0, fgPcs: 0, ngPcs: 0, pendingSortQty: 0, pendingKg: 0,
                             ngBreakdownKg: {}, ngList: [], pendList: [], coilChanges: 0, coilChangesByMachine: {} }),
                    (acc, r) => {
                        acc.fgKg += r.fgKg; acc.ngKg += r.ngKg;
                        acc.fgPcs += r.fgPcs; acc.ngPcs += r.ngPcs;
                        acc.pendingSortQty += r.pendingSortQty; acc.pendingKg += r.pendingKg;
                        window.mergeNumberMap(acc.ngBreakdownKg, r.ngBreakdownKg);
                        acc.ngList.push(...r.ngByMachine);
                        acc.pendList.push(...r.pendingByMachine);
                        acc.coilChanges += r.coilChanges;
                        window.mergeNumberMap(acc.coilChangesByMachine, r.coilChangesByMachine);
                    }
                ).map(g => Object.assign(g, {
                    date: g.title, // ใช้เป็นหัว popup รายละเอียด
                    periodWord: (window.CHART_PERIODS.find(p => p.value === qcPeriod) || {}).short || 'ช่วง', // "ของเดือน" แทน "ของวัน" ใน popup
                    ngByMachine: mergeByMachine(g.ngList, 'ngPcs'),
                    pendingByMachine: mergeByMachine(g.pendList, 'pendingPcs')
                }));
            }

            // คำนวณ % NG / Worst / Best / Forecast ของแต่ละจุด (ใช้สูตรเดียวกันทั้งรายวันและรายช่วง)
            displayTrendData.forEach(d => {
                const mFgKg = d.fgKg, mNgKg = d.ngKg, mPendingKg = d.pendingKg;
                const modelNgBreakdownKg = d.ngBreakdownKg || {};
                const totalKg = mFgKg + mNgKg;
                const ngRate = totalKg > 0 ? (mNgKg / totalKg) * 100 : 0;
                let worstNgRate = null; let bestNgRate = null; let forecastNgRate = null;
                let projectedNgKg = 0; 

                if (mPendingKg > 0 && totalKg > 0) {
                    const projTotalKg = totalKg + mPendingKg;
                    worstNgRate = ((mNgKg + mPendingKg) / projTotalKg) * 100;
                    bestNgRate = (mNgKg / projTotalKg) * 100;
                    
                    const dynamicWeights = data.dynamicSymptomWeights || {};
                    let totalWeightedNgRatio = 0;
                    let knownWeightKg = 0; // เฉพาะอาการที่มีข้อมูล Sort จริง

                    if (Object.keys(modelNgBreakdownKg).length > 0 && mNgKg > 0) {
                        for (const [symp, sympKg] of Object.entries(modelNgBreakdownKg)) {
                            if (dynamicWeights[symp] === undefined) continue; // ข้ามอาการที่ไม่มีข้อมูล Sort
                            const fgRate = dynamicWeights[symp];
                            knownWeightKg += sympKg;
                            totalWeightedNgRatio += ((sympKg / mNgKg) * (1 - fgRate));
                        }
                        if (knownWeightKg > 0) {
                            // Re-normalize: ปรับสัดส่วนเฉพาะอาการที่มีข้อมูลจริง
                            const coverageRatio = knownWeightKg / mNgKg;
                            if (coverageRatio > 0) totalWeightedNgRatio = totalWeightedNgRatio / coverageRatio;
                            projectedNgKg = mPendingKg * totalWeightedNgRatio;
                            forecastNgRate = ((mNgKg + projectedNgKg) / projTotalKg) * 100;
                        }
                        // ถ้าไม่มีอาการไหนมีข้อมูล Sort → ไม่แสดง Forecast (forecastNgRate = null)
                    }
                    // ไม่ใช้ Global Fallback — ถ้าไม่มีข้อมูลจริงก็ไม่พยากรณ์
                }

                Object.assign(d, { ngRate, worstNgRate, bestNgRate, forecastNgRate, projectedNgKg });
            });

            const hasPendingSort = displayTrendData.some(d => d.pendingSortQty > 0);
            
            // 🌟 1. ดึงยอดรวม (Kg) ทั้งหมดเพื่อสร้าง True Average ของแต่ละ Case 🌟
            let sumTotalProdKg = 0;
            let sumTotalNgKg = 0;
            let sumTotalPendingKg = 0;
            let sumTotalProjectedNgKg = 0;

            displayTrendData.forEach(d => {
                sumTotalProdKg += (d.fgKg + d.ngKg);
                sumTotalNgKg += d.ngKg;
                sumTotalPendingKg += (d.pendingKg || 0);
                sumTotalProjectedNgKg += (d.projectedNgKg || 0);
            });

            const avgNgRate = sumTotalProdKg > 0 ? (sumTotalNgKg / sumTotalProdKg) * 100 : 0;
            
            let avgWorstNgRate = null; let avgBestNgRate = null; let avgForecastNgRate = null;

            if (sumTotalPendingKg > 0) {
                const totalProjProdKg = sumTotalProdKg + sumTotalPendingKg;
                avgWorstNgRate = ((sumTotalNgKg + sumTotalPendingKg) / totalProjProdKg) * 100;
                avgBestNgRate = (sumTotalNgKg / totalProjProdKg) * 100;
                avgForecastNgRate = ((sumTotalNgKg + sumTotalProjectedNgKg) / totalProjProdKg) * 100;
            }

            // 🌟 2. เพิ่มเส้น Average เข้าไปใน Datasets 🌟
            const datasets = [
                {label:'% NG Rate (ถ่วงน้ำหนัก Kg)', data:displayTrendData.map(d=> Math.min(d.ngRate, 100)), borderColor:'#f97316', borderWidth: 2, pointRadius: 3},
                {label: `Avg NG (${avgNgRate.toFixed(2)}%)`, data: displayTrendData.map(() => parseFloat(avgNgRate.toFixed(2))), borderColor: '#6b7280', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false, tension: 0}
            ];

            if (hasPendingSort) {
                // เส้น Worst Case + Avg Worst
                datasets.push({label:'NG 100% (Worst)', data: displayTrendData.map(d => d.worstNgRate != null ? Math.min(d.worstNgRate, 100) : null), borderColor: 'rgba(239, 68, 68, 0.35)', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderWidth: 2, borderDash: [6, 4], pointRadius: 2, fill: false, spanGaps: false});
                if (avgWorstNgRate !== null) {
                    datasets.push({label: `Avg Worst (${avgWorstNgRate.toFixed(2)}%)`, data: displayTrendData.map(() => parseFloat(avgWorstNgRate.toFixed(2))), borderColor: 'rgba(239, 68, 68, 0.4)', borderWidth: 1, borderDash: [3, 3], pointRadius: 0, fill: false, tension: 0});
                }

                // เส้น Best Case + Avg Best
                datasets.push({label:'FG 100% (Best)', data: displayTrendData.map(d => d.bestNgRate != null ? Math.min(d.bestNgRate, 100) : null), borderColor: 'rgba(34, 197, 94, 0.35)', backgroundColor: 'rgba(34, 197, 94, 0.05)', borderWidth: 2, borderDash: [6, 4], pointRadius: 2, fill: false, spanGaps: false});
                if (avgBestNgRate !== null) {
                    datasets.push({label: `Avg Best (${avgBestNgRate.toFixed(2)}%)`, data: displayTrendData.map(() => parseFloat(avgBestNgRate.toFixed(2))), borderColor: 'rgba(34, 197, 94, 0.4)', borderWidth: 1, borderDash: [3, 3], pointRadius: 0, fill: false, tension: 0});
                }

                // เส้น Forecast + Avg Forecast
                datasets.push({label:'📊 Forecast', data: displayTrendData.map(d => d.forecastNgRate != null ? Math.min(d.forecastNgRate, 100) : null), borderColor: 'rgba(139, 92, 246, 0.8)', borderWidth: 2.5, borderDash: [8, 3], pointRadius: 3, pointStyle: 'triangle', fill: false, spanGaps: false});
                if (avgForecastNgRate !== null) {
                    datasets.push({label: `Avg Forecast (${avgForecastNgRate.toFixed(2)}%)`, data: displayTrendData.map(() => parseFloat(avgForecastNgRate.toFixed(2))), borderColor: 'rgba(139, 92, 246, 0.6)', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0, fill: false, tension: 0});
                }
            }

            // 🌟 2.5 แท่ง Stack: ยอดผลิต FG (ล่าง) + NG (บน) หน่วยชิ้น — ใช้แกน Y ขวา 🌟
            datasets.push({
                type: 'bar',
                label: 'ยอดผลิต FG (ชิ้น)',
                data: displayTrendData.map(d => d.fgPcs || 0),
                backgroundColor: 'rgba(59, 130, 246, 0.25)',
                borderColor: 'rgba(59, 130, 246, 0.5)',
                borderWidth: 1,
                stack: 'qty',
                yAxisID: 'yQty',
                order: 10
            });
            datasets.push({
                type: 'bar',
                label: 'NG (ชิ้น)',
                data: displayTrendData.map(d => d.ngPcs || 0),
                backgroundColor: 'rgba(239, 68, 68, 0.6)',
                borderColor: 'rgba(220, 38, 38, 0.8)',
                borderWidth: 1,
                stack: 'qty',
                yAxisID: 'yQty',
                order: 10
            });

            // 🌟 3. สร้างกราฟ Chart.js 🌟
            charts.qcTrend = new Chart(ctxQC, {
                type: 'line',
                data: {
                    labels: displayTrendData.map(d => d.label || d.date),
                    datasets: datasets
                },
                plugins: [window.qcCrosshairPlugin],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { offset: true },
                        // 📈 สไตล์กราฟหุ้น: แบ่ง 2 หน้าต่างบนแกนเดียวกัน (stacked scales)
                        // หน้าต่างบน (3/4) = % NG Rate, หน้าต่างล่าง (1/4) = ยอดผลิต FG + NG (Stack)
                        y: {
                            type: 'linear',
                            position: 'left',
                            stack: 'qcPanes',
                            stackWeight: (window.qcPaneWeights || {}).y ?? 3, // ปรับได้โดยลากแถบคั่นระหว่างหน้าต่าง
                            weight: 2, // weight มากกว่า = อยู่ด้านบน
                            min: 0, // เริ่มจาก 0 และแสดงเลข 0
                            beginAtZero: true, // คงฐาน 0 แม้ถูก reset zoom (ลบ min/max)
                            grace: '10%',
                            border: { color: '#9ca3af' },
                            title: { display: true, text: '% NG Rate' },
                            ticks: { callback: v => v + '%', autoSkip: true, maxTicksLimit: 10, includeBounds: false }
                        },
                        // ช่องว่างคั่นระหว่าง 2 หน้าต่าง ให้ตัวเลขแกนบน/ล่างอยู่คนละจุด ไม่ชนกัน
                        yGap: {
                            type: 'linear',
                            position: 'left',
                            stack: 'qcPanes',
                            stackWeight: 0.3,
                            weight: 1,
                            grid: { display: false },
                            ticks: { display: false },
                            border: { display: false }
                        },
                        yQty: {
                            type: 'linear',
                            position: 'left',
                            stack: 'qcPanes',
                            stackWeight: (window.qcPaneWeights || {}).q ?? 1,
                            weight: 0,
                            min: 0, // เริ่มจาก 0 และแสดงเลข 0
                            beginAtZero: true,
                            stacked: true,
                            border: { color: '#9ca3af' },
                            title: { display: true, text: 'ยอดผลิต (ชิ้น)', font: { size: 11 } },
                            grace: '15%',
                            ticks: { callback: v => Number(v).toLocaleString(), maxTicksLimit: 4, includeBounds: false }
                        }
                    },
                    layout: { padding: { top: 20 } },
                    plugins: {
                        qcCrosshair: { refreshOnMove: () => window.qcTrendShowLabels === false },
                        zoom: {
                            limits: { y: { min: 0 }, yQty: { min: 0 } },
                            // pan แนวนอนผ่าน plugin (2 หน้าต่างเลื่อนพร้อมกัน), pan แนวตั้งแยกหน้าต่างด้วย initQcPanePan
                            pan: { enabled: true, mode: 'x' },
                            zoom: {
                                wheel: { enabled: true },
                                pinch: { enabled: true },
                                mode: 'xy'
                            }
                        },
                        tooltip: {
                            callbacks: {
                                title: function(items) {
                                    const d = items.length ? displayTrendData[items[0].dataIndex] : null;
                                    return d ? (d.title || d.date) : '';
                                },
                                label: function(ctx) {
                                    const v = ctx.parsed.y;
                                    if (v === null || v === undefined) return null;
                                    if (ctx.dataset.yAxisID === 'yQty') {
                                        return `${ctx.dataset.label}: ${Math.round(v).toLocaleString()} ชิ้น`;
                                    }
                                    return `${ctx.dataset.label}: ${v.toFixed(2)}%`;
                                },
                                afterBody: function(tooltipItems) {
                                    const idx = tooltipItems[0].dataIndex;
                                    const d = displayTrendData[idx];
                                    if (!d) return '';
                                    let lines = [];
                                    if (d.pendingSortQty > 0) lines.push(`รองาน Sort: ${d.pendingSortQty.toLocaleString()} ชิ้น`);
                                    if (d.coilChanges > 0) {
                                        lines.push(`🔄 เปลี่ยนม้วน: ${d.coilChanges} ม้วน`);
                                        const byMac = d.coilChangesByMachine || {};
                                        const sorted = Object.entries(byMac).sort((a,b) => b[1] - a[1]);
                                        sorted.forEach(([mac, cnt]) => { lines.push(`   ${mac}: ${cnt} ม้วน`); });
                                    }
                                    lines.push('(คลิกดูรายละเอียด)');
                                    return lines.join('\n');
                                }
                            }
                        },
                        datalabels: {
                            display: function(ctx) {
                                if (ctx.datasetIndex !== 0) return false;
                                // โหมดปิดตัวเลข: แสดงเฉพาะจุดที่เส้นแนวตั้ง (crosshair) พาดผ่าน
                                if (window.qcTrendShowLabels === false) return ctx.chart.$crosshairIdx === ctx.dataIndex;
                                const c = ctx.chart.canvas.closest('.widget-card');
                                return c ? c.classList.contains('maximized-card') : true;
                            },
                            color: '#c2410c', align: 'top', anchor: 'end', font: { weight: 'bold' },
                            formatter: (value) => value > 0 ? value.toFixed(1) + '%' : null
                        }
                    },
                    onClick: (e, elements, chart) => {
                        if (chart.$drawMode) return; // กำลังใช้เครื่องมือตีเส้น ไม่เปิด breakdown
                        if (!elements || elements.length === 0) return;
                        const idx = elements[0].index;
                        const d = displayTrendData[idx];
                        if (!d) return;
                        window.showTrendDayBreakdown(d);
                    }
                }
            });

            // 🖊️ เครื่องมือตีเส้นบนกราฟ (TradingView style) — js/charts/draw-tool.js
            if (window.initChartDrawTool) window.initChartDrawTool(charts.qcTrend, qcPeriod === 'day' ? 'qcTrend' : 'qcTrend_' + qcPeriod); // เส้นที่ตีแยกตามช่วงเวลา
            // ↕ ลากขึ้นลงแยกหน้าต่าง (บน/ล่าง) — ลากซ้ายขวายังเลื่อนพร้อมกัน
            if (window.initQcPanePan) window.initQcPanePan(ctxQC);
         }

         window.renderNgTrendChart();

         const ctxNG = document.getElementById('ngChart');
         if(ctxNG) {
            if(charts.ng) charts.ng.destroy();

            // ใช้ separated data (Setup รวมเข้ากับอาการหลัก)
            const ngItemsMerged = separatedBySymptom.labels.map((l, i) => ({ label: l, pcs: separatedBySymptom.total[i] || 0 }));
            const sortedLabels = ngItemsMerged.filter(item => item.pcs > 0).map(item => item.label);
            const sortedData = ngItemsMerged.filter(item => item.pcs > 0).map(item => item.pcs);
            const totalNGPcs = sortedData.reduce((a, b) => a + b, 0);
            
            charts.ng = new Chart(ctxNG, { 
                type: 'doughnut',
                plugins: activePlugins,
                data: { 
                    labels: sortedLabels, 
                    datasets: [{ 
                        data: sortedData, 
                        backgroundColor: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6'],
                        borderWidth: 0
                    }] 
                }, 
                options: {
                    ...commonOpts,
                    scales: { 
                        x: { display: false }, 
                        y: { display: false } 
                    },
                    plugins: {
                        ...commonOpts.plugins,
                        datalabels: {
                            display: function(ctx) { const c = ctx.chart.canvas.closest('.widget-card'); return c ? c.classList.contains('maximized-card') : true; },
                            color: '#ffffff',
                            font: { weight: 'bold', size: 12 },
                            formatter: (value) => {
                                if (totalNGPcs === 0 || value === 0) return null;
                                return ((value / totalNGPcs) * 100).toFixed(1) + '%';
                            }
                        }
                    }
                } 
            });
         }
         
         window.renderModelChart();

    } catch (err) {
         const debugOut = document.getElementById('debug-output');
         if (debugOut) {
             document.getElementById('debug-panel').classList.remove('hidden');
             debugOut.innerText += `\n[Chart Rendering Error] ${err.message}`;
         }
         console.error(err);
    }
};


// 🔢 ปิด/เปิด ตัวเลข % บนกราฟ Daily NG Rate Trend
// ค่าเริ่มต้น = ปิดตัวเลข (ตัวเลขจะขึ้นเฉพาะจุดที่เส้น crosshair พาดผ่าน)
if (window.qcTrendShowLabels === undefined) window.qcTrendShowLabels = false;
window.toggleQcTrendLabels = function() {
    window.qcTrendShowLabels = window.qcTrendShowLabels === false;
    const btn = document.getElementById('qcLabelToggleBtn');
    if (btn) {
        btn.textContent = window.qcTrendShowLabels ? '🔢 ตัวเลข: เปิด' : '🔢 ตัวเลข: ปิด';
        btn.classList.toggle('bg-blue-50', window.qcTrendShowLabels);
        btn.classList.toggle('text-blue-700', window.qcTrendShowLabels);
        btn.classList.toggle('bg-white', !window.qcTrendShowLabels);
        btn.classList.toggle('text-gray-500', !window.qcTrendShowLabels);
    }
    if (typeof charts !== 'undefined' && charts.qcTrend) charts.qcTrend.update();
};


// ➕ Crosshair: เส้นแนวตั้งตามเมาส์ ลากยาวตั้งแต่บนสุดถึงล่างสุด (ผ่านทั้ง 2 หน้าต่าง)
window.qcCrosshairPlugin = {
    id: 'qcCrosshair',
    afterEvent(chart, args, opts) {
        const e = args.event;
        // refreshOnMove (scriptable): กราฟที่ต้อง update ทุกครั้งที่เส้นเลื่อนข้ามจุด เช่น โหมดปิดตัวเลขของ qcTrend
        const needUpdate = !!(opts && opts.refreshOnMove);
        const clear = () => {
            if (chart.$crosshairX == null) return;
            chart.$crosshairX = null; chart.$crosshairIdx = null;
            // โหมดปิดตัวเลข: ต้อง update เพื่อให้ datalabels ซ่อนตัวเลขของจุดเดิม
            if (needUpdate) chart.update('none'); else args.changed = true;
        };
        if (e.type === 'mouseout') { clear(); return; }
        if (e.type !== 'mousemove') return;
        const xs = chart.scales.x;
        if (!args.inChartArea || !xs) { clear(); return; }
        // snap เข้ากลางแท่ง/จุดของวันที่ใกล้ที่สุด
        const last = chart.data.labels.length - 1;
        let idx = Math.round(xs.getValueForPixel(e.x));
        idx = Math.max(Math.max(0, Math.ceil(xs.min)), Math.min(Math.min(last, Math.floor(xs.max)), idx));
        if (idx === chart.$crosshairIdx) return;
        chart.$crosshairIdx = idx;
        chart.$crosshairX = xs.getPixelForValue(idx);
        if (needUpdate) chart.update('none'); else args.changed = true;
    },
    afterDatasetsDraw(chart) {
        if (chart.$crosshairX == null) return;
        const { ctx, chartArea: a } = chart;
        const x = chart.$crosshairX;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(75, 85, 99, 0.7)';
        ctx.moveTo(x, a.top);
        ctx.lineTo(x, a.bottom);
        ctx.stroke();
        ctx.restore();

        // วันที่แนวตั้งที่ขอบบนสุด ยาวตามเส้น
        const text = String(chart.data.labels[chart.$crosshairIdx] ?? '');
        if (!text) return;
        ctx.save();
        ctx.font = 'bold 11px sans-serif';
        const w = ctx.measureText(text).width + 12; // ความยาวป้าย (แนวตั้ง)
        const h = 18;                                // ความกว้างป้าย
        const cx = Math.min(Math.max(x, a.left + h / 2), a.right - h / 2);
        ctx.fillStyle = 'rgba(31, 41, 55, 0.88)';
        ctx.fillRect(cx - h / 2, a.top, h, w);
        ctx.translate(cx, a.top + w / 2);
        ctx.rotate(Math.PI / 2); // อ่านจากบนลงล่าง
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, 0);
        ctx.restore();
    }
};

// ↕ ลากเมาส์บนกราฟ Daily NG Rate Trend (หน้าต่างบน=y, หน้าต่างล่าง=yQty)
//  - ลากในพื้นที่กราฟ        : เลื่อนขึ้นลงเฉพาะหน้าต่างนั้น (ซ้าย-ขวา plugin zoom เลื่อนพร้อมกัน)
//  - ลากที่แกนซ้าย (ตัวเลข)   : ยืด/หดความสูงของกราฟหน้าต่างนั้น (ฐาน 0 คงที่) ลากขึ้น = สูงขึ้น
//  - ลากที่แถบคั่นระหว่างหน้าต่าง : ปรับสัดส่วนความสูงหน้าต่างบน/ล่าง
window.initQcPanePan = function(canvas) {
    if (!canvas || canvas.$qcPanePanInit) return;
    canvas.$qcPanePanInit = true;
    let drag = null;
    let cursorSet = false;

    // หาว่าตำแหน่งเมาส์อยู่ส่วนไหน
    function hitTest(chart, e) {
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left, py = e.clientY - rect.top;
        const a = chart.chartArea;
        const S = chart.scales;
        if (!S.y || !S.yQty || px < 0 || px > a.right) return null;
        const inScale = id => py >= S[id].top && py <= S[id].bottom;
        const inGap = py > S.y.bottom && py < S.yQty.top;
        if (px < a.left) {
            const id = ['y', 'yQty'].find(inScale);
            if (id) return { type: 'scale', id };
            if (inGap) return { type: 'resize' };
            return null;
        }
        if (inGap) return { type: 'resize' };
        const id = ['y', 'yQty'].find(inScale);
        return id ? { type: 'pan', id } : null;
    }

    // ดักใน capture phase ที่ element แม่ เพื่อให้ลากแกน/แถบคั่นไม่ไปถึง plugin zoom (กันกราฟเลื่อนซ้าย-ขวาตาม)
    (canvas.parentElement || document).addEventListener('pointerdown', function(e) {
        if (e.target !== canvas) return;
        const chart = Chart.getChart(canvas);
        if (!chart || e.button !== 0 || chart.$drawMode) return;
        const hit = hitTest(chart, e);
        if (!hit) return;
        if (hit.type === 'pan') {
            const zoomOpts = chart.options.plugins && chart.options.plugins.zoom;
            if (zoomOpts && zoomOpts.pan && zoomOpts.pan.enabled === false) return;
        } else {
            e.stopPropagation();
            document.body.style.userSelect = 'none'; // กันลากแล้วเลือกข้อความในหน้า
        }
        const S = chart.scales;
        drag = { type: hit.type, id: hit.id, startY: e.clientY };
        if (hit.type === 'resize') {
            drag.topH = S.y.bottom - S.y.top;
            drag.botH = S.yQty.bottom - S.yQty.top;
            drag.wSum = (chart.options.scales.y.stackWeight || 3) + (chart.options.scales.yQty.stackWeight || 1);
        } else {
            const sc = S[hit.id];
            drag.min = sc.min; drag.max = sc.max; drag.height = sc.bottom - sc.top;
        }
    }, true);

    window.addEventListener('pointermove', function(e) {
        const chart = Chart.getChart(canvas);
        if (!drag) {
            // เปลี่ยน cursor ตามส่วนที่เมาส์ชี้
            if (!chart || chart.$drawMode || e.buttons) return;
            const hit = hitTest(chart, e);
            const cur = hit && hit.type === 'scale' ? 'ns-resize' : hit && hit.type === 'resize' ? 'row-resize' : '';
            if (cur) { canvas.style.cursor = cur; cursorSet = true; }
            else if (cursorSet) { canvas.style.cursor = ''; cursorSet = false; }
            return;
        }
        if (!chart) { drag = null; return; }
        const dy = e.clientY - drag.startY;
        const o = chart.options.scales;
        if (drag.type === 'pan') {
            const range = drag.max - drag.min;
            // ลากลง = เลื่อนไปดูค่าที่สูงขึ้น
            let min = drag.min + dy * (range / drag.height);
            if (min < 0) min = 0; // ไม่ต่ำกว่า 0
            o[drag.id].min = min;
            o[drag.id].max = min + range;
        } else if (drag.type === 'scale') {
            // ลากขึ้น = กราฟสูงขึ้น (ช่วงค่าแคบลง) / ลากลง = ต่ำลง (ช่วงค่ากว้างขึ้น), ฐานล่างคงที่
            const f = Math.min(Math.max(Math.exp(dy * 0.005), 0.02), 50);
            o[drag.id].min = drag.min;
            o[drag.id].max = drag.min + (drag.max - drag.min) * f;
        } else if (drag.type === 'resize') {
            const total = drag.topH + drag.botH;
            const top = Math.min(Math.max(drag.topH + dy, total * 0.15), total * 0.85);
            const wy = drag.wSum * top / total;
            o.y.stackWeight = wy;
            o.yQty.stackWeight = drag.wSum - wy;
            window.qcPaneWeights = { y: o.y.stackWeight, q: o.yQty.stackWeight };
        }
        chart.update('none');
    });

    const end = () => {
        if (drag && drag.type !== 'pan') document.body.style.userSelect = '';
        drag = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
};

// 📅 ปุ่มสลับ วัน/สัปดาห์/เดือน/ไตรมาส/ปี ของกราฟ Daily NG Rate Trend
if (window.registerChartPeriod) window.registerChartPeriod('qcTrend', () => {
    if (typeof currentDashboardData !== 'undefined' && currentDashboardData) window.renderCharts(currentDashboardData);
});
