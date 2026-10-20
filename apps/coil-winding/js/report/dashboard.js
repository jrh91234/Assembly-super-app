let _dashboardAbort = null;
let _dashboardTimer = null;

// ข้อความที่แสดงอยู่ใน dropdown (ใช้ทำ label ของช่วงข้อมูล)
function getSelectedText(id) {
    const el = document.getElementById(id);
    if (!el || el.selectedIndex < 0) return '';
    return el.options[el.selectedIndex].text;
}

window.loadDashboard = async function() {
    if(!SCRIPT_URL) return;

    if (_dashboardAbort) _dashboardAbort.abort();
    if (_dashboardTimer) clearInterval(_dashboardTimer);
    _dashboardAbort = new AbortController();
    const signal = _dashboardAbort.signal;

    document.getElementById('dashboard-content').classList.add('hidden');
    document.getElementById('dashboard-loader').classList.remove('hidden');
    const debugPanel = document.getElementById('debug-panel');
    const debugOut = document.getElementById('debug-output');

    const allTime = typeof window.isAllTimeActive === 'function' && window.isAllTimeActive();
    const start = allTime ? '2000-01-01' : document.getElementById('startDate').value.trim();
    const end = allTime ? '2099-12-31' : document.getElementById('endDate').value.trim();
    const shift = document.getElementById('filterShift').value.trim();
    const shiftType = document.getElementById('filterShiftType').value.trim();

    const isPartialView = (shift !== 'All' || shiftType !== 'All');

    // แสดงเงื่อนไขที่กำลังดึงข้อมูล
    const infoEl = document.getElementById('loader-query-info');
    const timerEl = document.getElementById('loader-timer');
    if (infoEl) {
        const dateLabel = allTime ? 'All Time (ข้อมูลทั้งหมด)' : `${start} → ${end}`;
        const filterLabel = (shift === 'All' && shiftType === 'All') ? '' : ` | ${shift !== 'All' ? 'Shift ' + shift : ''} ${shiftType !== 'All' ? shiftType : ''}`.trim();
        infoEl.textContent = dateLabel + filterLabel;
    }
    const t0 = Date.now();
    if (timerEl) {
        timerEl.textContent = '0.0 วินาที';
        _dashboardTimer = setInterval(() => {
            timerEl.textContent = ((Date.now() - t0) / 1000).toFixed(1) + ' วินาที';
        }, 100);
    }

    const ngTrendSel = document.getElementById('ngTrendSelector');
    if(ngTrendSel) ngTrendSel.value = 'percent';

    let rawText = "";
    try {
        debugOut.innerText = `[Dashboard] Loading data for ${start} to ${end}...`;

        const fetchUrl = `${SCRIPT_URL}?action=GET_DASHBOARD&start=${start}&end=${end}&shift=${shift}&shiftType=${shiftType}&_t=${Date.now()}`;
        const res = await fetch(fetchUrl, { signal });
        
        rawText = await res.text();
        
        let data;
        try {
            data = JSON.parse(rawText);
        } catch(parseError) {
            throw new Error("ระบบหลังบ้านส่งข้อมูลกลับมาไม่ถูกต้อง (ไม่ใช่ JSON)\nรายละเอียด:\n" + rawText.substring(0, 500));
        }

        if (data.error) {
            throw new Error("ข้อผิดพลาดจากเซิร์ฟเวอร์: " + data.error);
        }

        const normalizedNgMapPcs = {};
        const normalizedNgMapKg = {};
        
        (data.ngLabels || []).forEach((label, i) => {
            const stdLabel = ngSymptoms.find(s => s.toLowerCase() === label.trim().toLowerCase()) || capitalizeFirst(label.trim());
            const vPcs = data.ngValuesPcs ? data.ngValuesPcs[i] : (data.ngValues ? data.ngValues[i] : 0);
            const vKg = data.ngValuesKg ? data.ngValuesKg[i] : 0;
            
            normalizedNgMapPcs[stdLabel] = (normalizedNgMapPcs[stdLabel] || 0) + vPcs;
            normalizedNgMapKg[stdLabel] = (normalizedNgMapKg[stdLabel] || 0) + vKg;
        });
        
        data.ngLabels = Object.keys(normalizedNgMapPcs);
        data.ngValuesPcs = Object.values(normalizedNgMapPcs);
        data.ngValuesKg = data.ngLabels.map(l => normalizedNgMapKg[l]);

        if (data.machineData) {
            for (let m in data.machineData) {
                const mData = data.machineData[m];
                const newBreakdownPcs = {};
                const newBreakdownKg = {};
                
                const oldPcs = mData.ngBreakdownPcs || mData.ngBreakdown || {};
                for (let k in oldPcs) {
                    const stdLabel = capitalizeFirst(k);
                    newBreakdownPcs[stdLabel] = (newBreakdownPcs[stdLabel] || 0) + oldPcs[k];
                }
                
                const oldKg = mData.ngBreakdownKg || {};
                for (let k in oldKg) {
                    const stdLabel = capitalizeFirst(k);
                    newBreakdownKg[stdLabel] = (newBreakdownKg[stdLabel] || 0) + oldKg[k];
                }
                
                mData.ngBreakdownPcs = newBreakdownPcs;
                mData.ngBreakdownKg = newBreakdownKg;
            }
        }
        
        if (data.productData) {
            for (let p in data.productData) {
                const pData = data.productData[p];
                const newBreakdownPcs = {};
                
                const oldPcs = pData.ngBreakdownPcs || {};
                for (let k in oldPcs) {
                    const stdLabel = capitalizeFirst(k);
                    newBreakdownPcs[stdLabel] = (newBreakdownPcs[stdLabel] || 0) + oldPcs[k];
                }
                
                pData.ngBreakdownPcs = newBreakdownPcs;
            }
        }

        if (data.dailyTrend) {
            data.dailyTrend.forEach(d => {
                if (d.ngBreakdown) {
                    const newBd = {};
                    for (let k in d.ngBreakdown) {
                        const stdLabel = ngSymptoms.find(s => s.toLowerCase() === k.trim().toLowerCase()) || capitalizeFirst(k.trim());
                        newBd[stdLabel] = (newBd[stdLabel] || 0) + d.ngBreakdown[k];
                    }
                    d.ngBreakdown = newBd;
                }
            });
        }
        
        const fg = data.totalFg || 0;
        const target = data.productionTarget || 0;
        const ngPcs = data.totalNgPcs !== undefined ? data.totalNgPcs : (data.totalNg || 0);
        const ngKg = data.totalNgKg || 0;
        
        if (fg === 0 && ngPcs === 0 && target === 0) {
            debugOut.innerText += `\n[Warning] ข้อมูลในวันที่ ${start} เป็น 0 ทั้งหมด`;
        } else {
            debugOut.innerText += `\n[Success] พบข้อมูล FG=${fg}, NG=${ngPcs}`;
        }

        document.getElementById('stat-fg').innerText = fg.toLocaleString();
        const fgKg = data.totalFgKg || 0;
        const fgSubEl = document.getElementById('stat-fg-sub');
        if (fgSubEl) fgSubEl.innerText = fgKg > 0 ? `${fg.toLocaleString()} ชิ้น (${window.formatKg ? window.formatKg(fgKg) : fgKg.toFixed(2)} Kg)` : 'ชิ้น';
        
        let targetDisplay = target.toLocaleString();
        if (isPartialView && target > 0) {
            targetDisplay += ` <span class="text-sm text-gray-500 font-medium">/day</span>`;
        }
        document.getElementById('stat-target').innerHTML = targetDisplay;
        
        document.getElementById('stat-ng').innerText = `${ngPcs.toLocaleString()} ชิ้น`;
        document.getElementById('stat-ng-sub').innerText = `(${window.formatKg ? window.formatKg(ngKg) : ngKg.toFixed(2)} Kg)`;
        
        const ach = target > 0 ? ((fg / target) * 100).toFixed(1) : 0;
        document.getElementById('stat-achievement').innerText = ach + "%";
        document.getElementById('progress-achievement').style.width = Math.min(ach, 100) + "%";
        
        // Yield ถ่วงน้ำหนัก Kg (ตรงกับ NG Rate ในกราฟ) — ถ้าไม่มีข้อมูล Kg ใช้จำนวนชิ้นแทน
        const totalKg = fgKg + ngKg;
        const useKg = totalKg > 0;
        const total = fg + ngPcs;
        const yieldVal = useKg
            ? ((fgKg / totalKg) * 100).toFixed(2)
            : (total > 0 ? ((fg / total) * 100).toFixed(2) : 0);
        document.getElementById('stat-yield').innerText = yieldVal + "%";
        const yieldSubEl = document.getElementById('stat-yield-sub');
        if (yieldSubEl) yieldSubEl.innerText = useKg ? 'ถ่วงน้ำหนัก Kg' : 'จากชิ้นงานทั้งหมด';
        
        let workDays = data.datesFound ? Object.keys(data.datesFound).length : 0;
        if (workDays === 0) {
            const sDate = new Date(start);
            const eDate = new Date(end);
            workDays = Math.round((eDate - sDate) / (1000 * 60 * 60 * 24)) + 1;
        }
        if (workDays <= 0 || isNaN(workDays)) workDays = 1;

        let activeSlots = 0; 
        if(data.hourlyData) activeSlots = data.hourlyData.filter(v => v > 0).length;
        if(activeSlots === 0) activeSlots = 1;

        const uph = (fg / (workDays * activeSlots)).toFixed(0);
        document.getElementById('stat-uph').innerText = uph;

        // บันทึกเงื่อนไขที่ "ดึงข้อมูลชุดนี้มาจริง" ติดไว้กับข้อมูล
        // เพื่อให้กราฟ/รายงานแสดงช่วงวันที่ของข้อมูลจริง ไม่ใช่ค่าที่อยู่ในช่องกรอง ณ ตอนเปิดดู
        const trendDates = (data.dailyTrend || []).map(d => d.date).filter(Boolean).sort();
        data.queryMeta = {
            start: start,
            end: end,
            shift: shift,
            shiftType: shiftType,
            allTime: allTime,
            shiftLabel: getSelectedText('filterShift'),
            shiftTypeLabel: getSelectedText('filterShiftType'),
            dataStart: trendDates.length ? trendDates[0] : '',
            dataEnd: trendDates.length ? trendDates[trendDates.length - 1] : '',
            dayCount: new Set(trendDates).size,
            loadedAt: Date.now()
        };

        currentDashboardData = data;

        if (typeof window.renderJobOrderDashCard === 'function') {
            window.renderJobOrderDashCard(data);
        }
        // เก็บรายการ Job Order ล่าสุดไว้ให้ฟอร์มบันทึกผลิตใช้เลือกได้ทันที
        if (data.jobOrders && data.jobOrders.length > 0) {
            window.jobOrderList = data.jobOrders;
            if (typeof window.refreshAllJobOrderSelects === 'function') window.refreshAllJobOrderSelects();
        }

        if (typeof window.renderCharts === 'function') {
            window.renderCharts(data); 
            window.renderTable(data); 
            window.renderFgByModel(data, isPartialView);
            window.renderSimulator(data); 
        }

    } catch(e) {
        if (e.name === 'AbortError') return;
        console.error("Dashboard Load Error: ", e);
        debugPanel.classList.remove('hidden');
        debugOut.innerText += `\n[Error Message]\n${e.message}\n\n[Stack Trace]\n${e.stack || "No Stack Trace"}\n\n[Raw Response Text]\n${rawText.substring(0, 500)}`;
        alert("เกิดข้อผิดพลาดในการดึงข้อมูล กรุณาตรวจสอบที่แผง Debug สีแดงด้านบน");
    } finally {
        if (!signal.aborted) {
            if (_dashboardTimer) { clearInterval(_dashboardTimer); _dashboardTimer = null; }
            document.getElementById('dashboard-loader').classList.add('hidden');
            document.getElementById('dashboard-content').classList.remove('hidden');
        }
    }
};
