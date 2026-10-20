// escape สำหรับ innerHTML / attribute (กัน XSS จากข้อมูลใน sheet เช่น remark, issueType, recorder)
function tmEscHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function tmEscAttr(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.renderTable = function(data) {
    // รวม Setup เข้ากับอาการหลักสำหรับ column headers
    let rawColumns = normalizeSymptomList(ngSymptoms);
    if (data.machineData) {
        for (let m in data.machineData) {
            const d = data.machineData[m];
            if (d.ngBreakdownPcs) {
                Object.keys(d.ngBreakdownPcs).forEach(k => {
                    const parsed = window.parseSetupType(k);
                    const stdK = capitalizeFirst(parsed.base);
                    if (!rawColumns.some(s => s.toLowerCase() === stdK.toLowerCase())) {
                        rawColumns.push(stdK);
                    }
                });
            }
        }
    }

    // ลบ "Setup" ออกจาก column ถ้ามี (เพราะรวมเข้ากับอาการหลักแล้ว)
    let dynamicColumns = [...new Set(rawColumns.map(s => capitalizeFirst(s)))];
    dynamicColumns = dynamicColumns.filter(s => s.toLowerCase() !== 'setup');

    const h = document.getElementById('table-header');
    const b = document.getElementById('table-body');
    
    // 1. แก้ไขหัวตารางให้แสดง (ชิ้น/Kg)
    h.innerHTML = '<th>Machine</th><th>FG (ชิ้น/Kg)</th><th>NG (ชิ้น/Kg)</th><th>% Yield</th>' + dynamicColumns.map(s=>`<th>${s}</th>`).join('');
    b.innerHTML = '';

    // uses shared getKgFromPcs from helpers.js (strict, no fallback)

    for(let i=1; i<=16; i++) {
        const m = `CWM-${String(i).padStart(2,'0')}`;
        const d = (data.machineData && data.machineData[m]) ? data.machineData[m] : {fg:0, ngTotal:0, ngTotalKg:0, ngTotalPcs:0, ngBreakdownKg:{}, ngBreakdownPcs:{}};

        const ngPcs = d.ngTotalPcs !== undefined ? d.ngTotalPcs : (d.ngTotal || 0);
        const ngKg = d.ngTotalKg || 0;

        const t = d.fg + ngPcs;
        const y = t > 0 ? ((d.fg/t)*100).toFixed(1) : "0.0";

        const productAssigned = machineMapping[m] || 'ไม่ได้ระบุรุ่น';

        // แยก Setup data สำหรับเครื่องนี้
        const macSep = window.separateSetupData(d.ngBreakdownPcs || {});
        const macSepKg = window.separateSetupData(d.ngBreakdownKg || {});

        // คำนวณ FG Kg
        const fgKg = getKgFromPcs(productAssigned, d.fg);

        let html = `<td class="p-4 border-b font-bold cursor-pointer text-blue-600 hover:underline" onclick="window.showMachineDetail('${m}')">
                <div class="flex flex-col">
                    <span>👉 ${m}</span>
                    <span class="text-[10px] text-gray-500 font-normal mt-0.5">📦 ${productAssigned}</span>
                </div>
            </td>
            <td class="p-4 border-b font-bold text-gray-800">${d.fg.toLocaleString()} <br><span class="text-[10px] text-gray-500 font-normal">(${window.formatKg ? window.formatKg(fgKg) : fgKg.toFixed(2)} Kg)</span></td>
            <td class="p-4 border-b text-red-600 font-bold">${ngPcs.toLocaleString()} <br><span class="text-[10px] text-gray-500 font-normal">(${window.formatKg ? window.formatKg(ngKg) : ngKg.toFixed(2)} Kg)</span></td>
            <td class="p-4 border-b">${y}%</td>`;

        dynamicColumns.forEach(s => {
            const idx = macSep.labels.findIndex(l => l.toLowerCase() === s.toLowerCase());
            const idxKg = macSepKg.labels.findIndex(l => l.toLowerCase() === s.toLowerCase());

            const totalPcs = idx >= 0 ? macSep.total[idx] : 0;
            const totalKg = idxKg >= 0 ? macSepKg.total[idxKg] : 0;
            const setupPcs = idx >= 0 ? macSep.setup[idx] : 0;
            const prodPcs = idx >= 0 ? macSep.production[idx] : 0;

            let cellContent = '-';
            if (totalPcs > 0) {
                cellContent = totalPcs.toLocaleString() + '<br><span class="text-[10px] text-gray-500 font-normal">(' + (window.formatKg ? window.formatKg(totalKg) : totalKg.toFixed(2)) + ' Kg)</span>';
                if (setupPcs > 0) {
                    cellContent += `<br><span class="text-[9px] text-orange-600 font-medium">Setup: ${setupPcs}</span>`;
                }
            }
            html += `<td class="${totalPcs>0?'bg-red-50 text-red-700 font-bold':''}">${cellContent}</td>`;
        });
        b.innerHTML += `<tr>${html}</tr>`;
    }
};

window.switchMachineChart = function() {
    const val = document.getElementById('machineChartToggle').value;
    const hint = document.getElementById('daily-chart-hint');
    const rangeBar = document.getElementById('machine-daily-range');
    
    if(val === 'hourly') {
        document.getElementById('machine-hourly-wrapper').classList.remove('hidden');
        document.getElementById('machine-daily-wrapper').classList.add('hidden');
        if(hint) hint.classList.add('hidden');
        if(rangeBar) rangeBar.classList.add('hidden');
        
        // ใช้ setTimeout หน่วงเวลา 100ms เพื่อให้ CSS แสดงผลเสร็จก่อนค่อย resize กราฟ
        setTimeout(() => {
            if (typeof machineDetailChart !== 'undefined' && machineDetailChart) {
                machineDetailChart.resize();
                machineDetailChart.update();
            }
        }, 100);
        
    } else {
        document.getElementById('machine-hourly-wrapper').classList.add('hidden');
        document.getElementById('machine-daily-wrapper').classList.remove('hidden');
        if(hint) hint.classList.remove('hidden');
        if(rangeBar) rangeBar.classList.remove('hidden');
        
        setTimeout(() => {
            if (typeof machineDailyChartInst !== 'undefined' && machineDailyChartInst) {
                machineDailyChartInst.resize();
                machineDailyChartInst.update();
            }
        }, 100);
    }
};

window.showMachineDetail = function(machineName) {
    if(!currentDashboardData) return;
    window.currentSelectedMachine = machineName; 
    const modal = document.getElementById('modal-machine-detail');
    const mData = currentDashboardData.machineData[machineName] || { fg: 0, ngTotal: 0, ngTotalKg: 0, ngTotalPcs: 0, hourlyFg: [], hourlyNgPcs: [], hourlyNg: [], hourlyNgKg: [], remarks: [], daily: {}, maintenanceLogs: [] };

    const ngPcs = mData.ngTotalPcs !== undefined ? mData.ngTotalPcs : (mData.ngTotal || 0);
    const ngKg = mData.ngTotalKg || 0;

    document.getElementById('machine-detail-title').innerText = `📊 รายละเอียดเครื่อง ${machineName}`;
    document.getElementById('machine-detail-stats').innerHTML = `<div class="bg-blue-50 p-2 rounded">FG รวม: <b class="text-blue-700 text-xl">${mData.fg.toLocaleString()}</b></div><div class="bg-red-50 p-2 rounded">NG รวม: <b class="text-red-700 text-xl">${ngPcs.toLocaleString()} ชิ้น</b><br><span class="text-xs text-gray-500">(${window.formatKg ? window.formatKg(ngKg) : ngKg.toFixed(2)} Kg)</span></div>`;

    const rList = document.getElementById('machine-remarks-list'); 
    const rSec = document.getElementById('machine-detail-remarks');
    if(mData.remarks && mData.remarks.length > 0) { 
        rSec.classList.remove('hidden'); 
        rList.innerHTML = `<ul class="list-disc pl-5 space-y-1">${mData.remarks.map(r => `<li>${tmEscHtml(r)}</li>`).join('')}</ul>`;
    } else { 
        rSec.classList.add('hidden'); 
    }

    // --- ส่วนที่ดึงข้อมูลแจ้งซ่อม (Maintenance) มาแสดงผล ---
    const maintListContainer = document.getElementById('machine-maintenance-list');
    const downtimeText = document.getElementById('md-total-downtime');
    
    let totalDowntimeMins = 0;
    let maintHtml = '';

    const extractTime = (timeVal) => {
        if (!timeVal) return '-';
        let str = String(timeVal).trim();
        
        // 1. ดักจับรูปแบบที่มี AM / PM โดยเฉพาะ (ไม่ว่าจะมีวินาทีต่อท้ายหรือไม่ เช่น "2:30 PM", "02:30:00 PM")
        const ampmRegex = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/i;
        const ampmMatch = str.match(ampmRegex);
        if (ampmMatch) {
            let h = parseInt(ampmMatch[1], 10);
            let m = ampmMatch[2];
            let ampm = ampmMatch[3].toUpperCase();

            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;

            return `${h.toString().padStart(2, '0')}:${m}`;
        }

        // 2. ดักจับ ISO Date String ที่ Google Sheets ชอบสร้าง (เช่น "1899-12-30T07:30:00.000Z")
        if (str.includes('T') || str.length > 10) {
            try {
                const d = new Date(str);
                if (!isNaN(d.getTime())) {
                    let h = d.getHours().toString().padStart(2, '0');
                    let m = d.getMinutes().toString().padStart(2, '0');
                    return `${h}:${m}`;
                }
            } catch(e) { console.warn("Time parse error", e); }
        }

        // 3. ดักจับข้อความที่เป็นเวลาทั่วไป HH:MM หรือ HH:MM:SS
        const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
            return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
        }
        
        return str.substring(0, 5);
    };

    // --- ส่วนจัดการ กรองวันที่ (Filter) และ เรียงลำดับ (Sort) ---
    let processedLogs = [...(mData.maintenanceLogs || [])];

    // 1. กรองข้อมูลให้อยู่ในช่วงวันที่เลือกบน Dashboard
    const dashStartDate = document.getElementById('start-date')?.value;
    const dashEndDate = document.getElementById('end-date')?.value;
    
    if (dashStartDate && dashEndDate) {
        processedLogs = processedLogs.filter(log => {
            if (!log.date) return false; // row ไม่มีวันที่ → ระบุช่วงไม่ได้ ไม่นับเข้าช่วงที่กรอง
            return log.date >= dashStartDate && log.date <= dashEndDate;
        });
    }

    // 2. เรียงลำดับรายการ (รายการใหม่ล่าสุดอยู่บนสุด)
    processedLogs.sort((a, b) => {
        const dateCompare = (b.date || '').localeCompare(a.date || '');
        if (dateCompare !== 0) return dateCompare; 
        
        const timeA = extractTime(a.startTime) || '00:00';
        const timeB = extractTime(b.startTime) || '00:00';
        return timeB.localeCompare(timeA);
    });

    if (processedLogs.length > 0) {
        processedLogs.forEach(log => {
            let durationStr = 'ยังไม่ระบุเวลาเสร็จสิ้น';
            let mins = 0;
            
            let sTime = extractTime(log.startTime) || '-';
            let eTime = extractTime(log.endTime) || '-';
            
            if (sTime !== '-' && eTime !== '-') {
                try {
                    let s = sTime.split(':');
                    let e = eTime.split(':');
                    let sMins = parseInt(s[0]) * 60 + parseInt(s[1]);
                    let eMins = parseInt(e[0]) * 60 + parseInt(e[1]);
                    mins = eMins - sMins;

                    // กัน NaN จากเวลาที่ผิดรูปแบบ — ไม่ให้ลามเข้ายอดรวม Total Downtime
                    if (isNaN(mins)) {
                        mins = 0;
                    } else {
                        if (mins < 0) mins += 1440;
                        totalDowntimeMins += mins;

                        let h = Math.floor(mins / 60);
                        let m = mins % 60;
                        durationStr = h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`;
                    }
                } catch(err) { console.log("Time calc error:", err); }
            }

            // --- ส่วนสร้าง Thumbnail โดยสกัด File ID ---
            let imgBtn = '';
            if (log.imageUrl) {
                let fileId = '';
                const matchD = log.imageUrl.match(/\/d\/(.+?)\//);
                const matchId = log.imageUrl.match(/id=([^&]+)/);
                if (matchD && matchD[1]) {
                    fileId = matchD[1];
                } else if (matchId && matchId[1]) {
                    fileId = matchId[1];
                }

                if (fileId) {
                    const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
                    const fallbackThumb = `https://lh3.googleusercontent.com/d/${fileId}`;
                    
                    imgBtn = `
                        <div class="mt-3 border border-gray-200 rounded overflow-hidden cursor-pointer relative group" onclick="window.viewMaintImage('${fallbackThumb}', '${tmEscAttr(log.issueType)}')" title="คลิกเพื่อดูรูปใหญ่">
                            <div class="h-32 w-full bg-gray-100 flex items-center justify-center">
                                <img src="${thumbUrl}" onerror="this.onerror=null; this.src='${fallbackThumb}'; this.onerror=function(){ this.style.display='none'; this.nextElementSibling.style.display='flex'; };" class="w-full h-full object-cover" alt="Maintenance Image" loading="lazy">
                                <div class="hidden flex-col items-center justify-center text-gray-500 text-xs w-full h-full">
                                    <span class="text-2xl mb-1">📸</span>
                                    <span>คลิกเพื่อดูรูปภาพ</span>
                                </div>
                            </div>
                            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center pointer-events-none">
                                <span class="bg-black bg-opacity-70 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">🔍 ขยายรูปภาพ</span>
                            </div>
                        </div>
                    `;
                } else {
                    imgBtn = `<button onclick="window.open('${log.imageUrl}', '_blank')" class="mt-2 text-xs bg-orange-50 text-orange-600 px-3 py-1.5 rounded border border-orange-200 hover:bg-orange-100 font-bold w-full text-center">📸 เปิดดูรูปภาพแนบ (แท็บใหม่)</button>`;
                }
            }

            maintHtml += `
                <div class="bg-white border border-gray-200 p-3 rounded-lg shadow-sm">
                    <div class="flex justify-between items-start mb-2">
                        <span class="font-bold text-sm text-orange-700">${tmEscHtml(log.issueType)}</span>
                        <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">${tmEscHtml(log.date)}</span>
                    </div>
                    <div class="text-xs text-gray-600 mb-2 flex justify-between bg-orange-50 p-2 rounded">
                        <span>⏱️ ${tmEscHtml(sTime)} - ${tmEscHtml(eTime)} (<b class="text-gray-800">${durationStr}</b>)</span>
                        <span>👤 ${tmEscHtml(log.recorder) || '-'}</span>
                    </div>
                    <p class="text-sm text-gray-700 p-2 rounded border border-gray-100 bg-gray-50">${log.remark ? tmEscHtml(log.remark) : 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
                    ${imgBtn}
                </div>
            `;
        });

        let totalH = Math.floor(totalDowntimeMins / 60);
        let totalM = totalDowntimeMins % 60;
        downtimeText.innerText = totalH > 0 ? `${totalH} ชม. ${totalM} นาที` : `${totalM} นาที`;
        maintListContainer.innerHTML = maintHtml;

    } else {
        downtimeText.innerText = "0 นาที";
        maintListContainer.innerHTML = '<div class="text-center text-gray-400 py-4 text-sm bg-gray-50 rounded border border-dashed border-gray-200">ไม่พบประวัติการแจ้งซ่อม หรือปัญหาเครื่องจักรในช่วงเวลานี้</div>';
    }

    document.getElementById('machineChartToggle').value = 'hourly';
    window.switchMachineChart();

    // เปิดหน้าต่าง Modal แล้วดัน z-index ให้สูงสุดแบบบังคับเพื่อทะลุโหมด Maximize
    if(modal) {
        modal.classList.remove('hidden');
        modal.style.setProperty('z-index', '999999', 'important');
    }

    if(machineDetailChart) { machineDetailChart.destroy(); machineDetailChart = null; }
    if(machineDailyChartInst) { machineDailyChartInst.destroy(); machineDailyChartInst = null; }

    const hNgPcs = mData.hourlyNgPcs || mData.hourlyNg || [];

    const cleanHourlyLabels = (currentDashboardData.hourlyLabels || []).map(label => {
         const parts = label.split('-');
         if (parts.length > 1) {
             const match = parts[1].match(/(\d{2}):/);
             return match ? match[1] + ":00" : label;
         }
         const fallbackMatch = label.match(/(\d{2}):/);
         return fallbackMatch ? fallbackMatch[1] + ":00" : label;
    });

    machineDetailChart = new Chart(document.getElementById('machineDetailChart').getContext('2d'), { 
        type: 'bar', 
        data: { 
            labels: cleanHourlyLabels, 
            datasets: [
                { label: 'FG (งานดี)', data: mData.hourlyFg || [], backgroundColor: '#3b82f6', borderRadius: 2 }, 
                { label: 'NG (เสียเป็นชิ้น)', data: hNgPcs, backgroundColor: '#ef4444', borderRadius: 2 }
            ] 
        }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: true },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            if (context.dataset.label === 'NG (เสียเป็นชิ้น)') {
                                const idx = context.dataIndex;
                                const breakdown = mData.hourlyNgBreakdown ? mData.hourlyNgBreakdown[idx] : null;
                                
                                if (breakdown && Object.keys(breakdown).length > 0) {
                                    const hSep = window.separateSetupData(breakdown);
                                    let lines = ['----------------------'];
                                    hSep.labels
                                        .map((l, i) => [l, hSep.total[i], hSep.setup[i]])
                                        .filter(x => x[1] > 0)
                                        .sort((a, b) => b[1] - a[1])
                                        .forEach(([k, total, setup]) => {
                                            let sn = setup > 0 ? ` (Setup: ${setup})` : '';
                                            lines.push(`  • ${k}: ${total.toLocaleString()} ชิ้น${sn}`);
                                        });
                                    if (lines.length > 1) return lines;
                                }
                            }
                            return [];
                        }
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'xy' },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }
                },
                datalabels: {
                    display: true,
                    color: '#ffffff',
                    font: { weight: 'bold', size: 11 },
                    formatter: (value) => value > 0 ? value : null
                }
            }, 
            scales: { x: { stacked: true }, y: { beginAtZero: true, stacked: true } } 
        } 
    });
    // กราฟรายวัน — วาดผ่านฟังก์ชันแยก เพื่อให้เลือกช่วงวันที่เองแล้ววาดใหม่ได้
    window.currentMachineDailyData = mData;
    initMachineDailyRangeInputs(mData);
    window.renderMachineDailyTrend();
};

// ===== ตัวเลือกช่วงวันที่ของกราฟเทรนด์รายวัน (ในหน้ารายละเอียดเครื่อง) =====
function initMachineDailyRangeInputs(mData) {
    const keys = Object.keys(mData.daily || {}).sort();
    const fromEl = document.getElementById("md-daily-from");
    const toEl = document.getElementById("md-daily-to");
    if (!fromEl || !toEl) return;
    if (keys.length === 0) {
        fromEl.value = ""; toEl.value = "";
        fromEl.min = toEl.min = ""; fromEl.max = toEl.max = "";
        return;
    }
    // จำกัดให้เลือกได้เฉพาะช่วงที่โหลดข้อมูลมาแล้ว (ตามช่วงวันที่ของ Dashboard)
    fromEl.min = toEl.min = keys[0];
    fromEl.max = toEl.max = keys[keys.length - 1];
    fromEl.value = keys[0];
    toEl.value = keys[keys.length - 1];
}

window.setMachineDailyRangePreset = function(days) {
    const mData = window.currentMachineDailyData;
    if (!mData) return;
    const keys = Object.keys(mData.daily || {}).sort();
    if (keys.length === 0) return;
    const last = keys[keys.length - 1];
    const fromEl = document.getElementById("md-daily-from");
    const toEl = document.getElementById("md-daily-to");
    if (!days) {              // "ทั้งหมด"
        fromEl.value = keys[0];
    } else {
        const d = new Date(last + "T00:00:00");
        d.setDate(d.getDate() - (days - 1));
        const pad = (n) => String(n).padStart(2, "0");
        const start = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        fromEl.value = start < keys[0] ? keys[0] : start;
    }
    toEl.value = last;
    window.renderMachineDailyTrend();
};

window.renderMachineDailyTrend = function() {
    const mData = window.currentMachineDailyData;
    if (!mData || !document.getElementById("machineDailyTrendChart")) return;
    const fromEl = document.getElementById("md-daily-from");
    const toEl = document.getElementById("md-daily-to");
    let fromDate = fromEl ? fromEl.value : "";
    let toDate = toEl ? toEl.value : "";
    if (fromDate && toDate && fromDate > toDate) { const t = fromDate; fromDate = toDate; toDate = t; }
    if (machineDailyChartInst) { machineDailyChartInst.destroy(); machineDailyChartInst = null; }

    let dailyData = mData.daily || {};
    const allKeys = Object.keys(dailyData).sort();
    let dailyKeys = allKeys.filter(k => (!fromDate || k >= fromDate) && (!toDate || k <= toDate));
    const dayCount = dailyKeys.length;

    let sortData = mData.sortData || {};

    // 📅 รวมเป็นรายสัปดาห์ / เดือน / ไตรมาส / ปี (แบบกราฟหุ้น) — รวมยอดทุกวันในช่วง แล้วคำนวณ % ใหม่จากยอดรวม
    const mdPeriod = window.getChartPeriod ? window.getChartPeriod('machineDaily') : 'day';
    let periodRows = null;
    if (mdPeriod !== 'day' && window.groupRowsByPeriod) {
        const srcDaily = dailyData, srcSort = sortData;
        periodRows = window.groupRowsByPeriod(dailyKeys, mdPeriod, k => k,
            () => ({ d: { fg: 0, ngPcs: 0, ngBreakdown: {} }, sd: { pendingPcs: 0, fgPcs: 0, ngPcs: 0 } }),
            (acc, k) => {
                const d = srcDaily[k] || {};
                acc.d.fg += d.fg || 0;
                acc.d.ngPcs += d.ngPcs !== undefined ? d.ngPcs : (d.ng || 0);
                window.mergeNumberMap(acc.d.ngBreakdown, d.ngBreakdown);
                const sd = srcSort[k];
                if (sd) {
                    acc.sd.pendingPcs += sd.pendingPcs || 0;
                    acc.sd.fgPcs += sd.fgPcs || 0;
                    acc.sd.ngPcs += sd.ngPcs || 0;
                }
            });
        dailyData = {}; sortData = {};
        periodRows.forEach(r => { dailyData[r.key] = r.d; sortData[r.key] = r.sd; });
        dailyKeys = periodRows.map(r => r.key);
    }
    // 🔴 แก้ไข data.globalSortNgRatio เป็น currentDashboardData
    const globalSortNgRatio = ((typeof currentDashboardData !== 'undefined' && currentDashboardData.globalSortNgRatio) ? currentDashboardData.globalSortNgRatio : 50) / 100;

    // 🟢 สร้างฟังก์ชันดักค่า undefined ป้องกันกราฟพังเป็น NaN
    const getFg = (d) => d ? (d.fg || 0) : 0;
    const getNg = (d) => d ? (d.ngPcs !== undefined ? d.ngPcs : (d.ng || 0)) : 0;

    const dailyYields = dailyKeys.map(k => {
        const d = dailyData[k];
        const t = getFg(d) + getNg(d);
        return t > 0 ? parseFloat(((getFg(d) / t) * 100).toFixed(1)) : 0;
    });

    // เส้นประ projection: NG Rate (inverse of yield)
    const worstYield = dailyKeys.map(k => {
        const sd = sortData[k];
        const pending = sd ? (sd.pendingPcs || 0) : 0;
        if (pending <= 0) return null;
        const d = dailyData[k];
        const total = getFg(d) + getNg(d) + pending;
        // NG 100%: pending ทั้งหมดเป็น NG → yield ลดลง
        return total > 0 ? parseFloat(((getFg(d) / total) * 100).toFixed(1)) : null;
    });

    const bestYield = dailyKeys.map(k => {
        const sd = sortData[k];
        const pending = sd ? (sd.pendingPcs || 0) : 0;
        if (pending <= 0) return null;
        const d = dailyData[k];
        const total = getFg(d) + getNg(d) + pending;
        // FG 100%: pending ทั้งหมดเป็น FG → yield เพิ่ม
        return total > 0 ? parseFloat((((getFg(d) + pending) / total) * 100).toFixed(1)) : null;
    });

   // 🌟 1. ดึง "ค่าน้ำหนัก" ที่วิเคราะห์จากประวัติงาน Sort จริงจาก Backend
    const dynamicSymptomWeights = (typeof currentDashboardData !== 'undefined' && currentDashboardData.dynamicSymptomWeights) ? currentDashboardData.dynamicSymptomWeights : {};

    const forecastYield = dailyKeys.map(k => {
        const sd = sortData[k];
        const pending = sd ? (sd.pendingPcs || 0) : 0;
        if (pending <= 0) return null;
        
        const d = dailyData[k];
        const total = getFg(d) + getNg(d) + pending;
        if (total <= 0) return null;

        let projectedFgFromSort = 0;

        // 🌟 2. คำนวณ Forecast ด้วยข้อมูลจริงแยกตามสัดส่วนอาการ (Data-driven forecasting)
        if (d.ngBreakdown && Object.keys(d.ngBreakdown).length > 0 && getNg(d) > 0) {
            let totalWeightedFgRatio = 0;
            const dailyNg = getNg(d);
            
            for (const [symptom, pcs] of Object.entries(d.ngBreakdown)) {
                // ถ้าประวัติเคยบันทึกอาการนี้ไว้ จะใช้อัตราการได้งานดี(FG) จริง แต่ถ้าไม่เคยเจออาการนี้ให้ใช้ค่าเฉลี่ยรวม
                const fgRate = dynamicSymptomWeights[symptom] !== undefined ? dynamicSymptomWeights[symptom] : (1 - globalSortNgRatio);
                
                // หาว่าอาการนี้คิดเป็นสัดส่วนกี่ % ของของเสียในวันนั้น
                const proportion = pcs / dailyNg; 
                totalWeightedFgRatio += (proportion * fgRate); 
            }
            
            projectedFgFromSort = Math.round(pending * totalWeightedFgRatio);
            
        } else {
            // กรณีไม่มีข้อมูล Breakdown ให้ใช้อัตราส่วนเฉลี่ยรวมเหมือนเดิม
            let ngRatio = globalSortNgRatio;
            if (sd && (sd.fgPcs + sd.ngPcs) > 0) {
                ngRatio = sd.ngPcs / (sd.fgPcs + sd.ngPcs);
            }
            projectedFgFromSort = Math.round(pending * (1 - ngRatio));
        }

        const projFg = getFg(d) + projectedFgFromSort;
        return parseFloat(((projFg / total) * 100).toFixed(1));
    });

    const hasPending = worstYield.some(v => v !== null);

    const dailyDatasets = [
        {
            type: 'line', label: mdPeriod === 'day' ? '% Yield รายวัน' : '% Yield ' + ((window.CHART_PERIODS || []).find(p => p.value === mdPeriod) || {}).title, data: dailyYields,
            borderColor: '#10b981', backgroundColor: '#10b981', yAxisID: 'y1', tension: 0.3, borderWidth: 2
        }
    ];

    if (hasPending) {
        dailyDatasets.push({
            type: 'line', label: 'NG100% (Worst)', data: worstYield,
            borderColor: 'rgba(239, 68, 68, 0.4)', yAxisID: 'y1', tension: 0.3,
            borderWidth: 2, borderDash: [6, 4], pointRadius: 2, fill: false, spanGaps: false
        });
        dailyDatasets.push({
            type: 'line', label: 'FG100% (Best)', data: bestYield,
            borderColor: 'rgba(34, 197, 94, 0.4)', yAxisID: 'y1', tension: 0.3,
            borderWidth: 2, borderDash: [6, 4], pointRadius: 2, fill: false, spanGaps: false
        });
        dailyDatasets.push({
            type: 'line', label: '📊 Forecast', data: forecastYield,
            borderColor: 'rgba(139, 92, 246, 0.7)', yAxisID: 'y1', tension: 0.3,
            borderWidth: 2.5, borderDash: [8, 3], pointRadius: 3, pointStyle: 'triangle', fill: false, spanGaps: false
        });
    }

    dailyDatasets.push(
        { label: 'FG (งานดี)', data: dailyKeys.map(k => getFg(dailyData[k])), backgroundColor: '#3b82f6', yAxisID: 'y', stack: 'Stack 0' },
        { label: 'NG (เสียเป็นชิ้น)', data: dailyKeys.map(k => getNg(dailyData[k])), backgroundColor: '#ef4444', yAxisID: 'y', stack: 'Stack 0' }
    );

    machineDailyChartInst = new Chart(document.getElementById('machineDailyTrendChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: periodRows ? periodRows.map(r => r.label) : dailyKeys,
            datasets: dailyDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (e, elements, chart) => {
                if (!elements || elements.length === 0) return;
                const element = elements[0];
                const datasetIndex = element.datasetIndex;
                const index = element.index;
                
                if (chart.data.datasets[datasetIndex].label === 'NG (เสียเป็นชิ้น)') {
                    if (periodRows) {
                        const r = periodRows[index];
                        if (r) window.showDailyNgBreakdown(window.currentSelectedMachine, r.dates, r.title);
                    } else {
                        window.showDailyNgBreakdown(window.currentSelectedMachine, chart.data.labels[index]);
                    }
                }
            },
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true, position: 'left' },
                y1: { beginAtZero: true, max: 100, position: 'right', grid: { display: false } }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: function(items) {
                            if (!items.length) return '';
                            const r = periodRows ? periodRows[items[0].dataIndex] : null;
                            return r ? r.title : items[0].label;
                        }
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'xy' },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }
                },
                datalabels: {
                    display: function(context) {
                        return context.dataset.type === 'line' && context.dataset.data[context.dataIndex] > 0;
                    },
                    align: 'top',
                    color: '#065f46',
                    font: { weight: 'bold', size: 10 },
                    formatter: (v) => v + '%'
                }
            }
        }
    });

    const info = document.getElementById("md-daily-range-info");
    if (info) {
        info.innerHTML = dailyKeys.length === 0
            ? '<span class="text-red-600 font-bold">ไม่มีข้อมูลในช่วงที่เลือก</span>'
            : `แสดง <b>${dayCount}</b> วัน${periodRows ? ` รวมเป็น <b>${periodRows.length}</b> ช่วง` : ''} (จากทั้งหมด ${allKeys.length} วันที่โหลดไว้)`;
    }
};


// 📅 ปุ่มสลับ วัน/สัปดาห์/เดือน/ไตรมาส/ปี ของกราฟเทรนด์ในหน้ารายละเอียดเครื่อง
if (window.registerChartPeriod) window.registerChartPeriod('machineDaily', () => window.renderMachineDailyTrend());
