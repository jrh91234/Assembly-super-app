// date = วันที่เดียว หรือ array ของวันที่ (กราฟที่รวมเป็นสัปดาห์/เดือน/ไตรมาส/ปี) · titleLabel = ชื่อช่วงที่แสดงบนหัว popup
window.showDailyNgBreakdown = function(machine, date, titleLabel) {
    if (!currentDashboardData || !currentDashboardData.machineData[machine]) return;
    const mDaily = currentDashboardData.machineData[machine].daily || {};
    const dates = Array.isArray(date) ? date : [date];
    let breakdown = null;
    dates.forEach(dt => {
        const day = mDaily[dt];
        if (day && day.ngBreakdown) breakdown = window.mergeNumberMap(breakdown || {}, day.ngBreakdown);
    });

    if (!breakdown) {
        alert("ไม่พบข้อมูล Breakdown สำหรับวันนี้ (อาจเป็นข้อมูลเก่าก่อนการอัปเดตระบบ)");
        return;
    }

    const container = document.getElementById('daily-ng-content');
    document.getElementById('daily-ng-title').innerText = `🗑️ NG Breakdown: ${machine} (${titleLabel || dates.join(', ')})`;

    // รวม Setup เข้ากับอาการหลัก
    const bdSep = window.separateSetupData(breakdown);

    let html = '<ul class="divide-y divide-gray-200">';
    let total = 0;

    const sortedItems = bdSep.labels
        .map((l, i) => [l, bdSep.total[i], bdSep.setup[i], bdSep.production[i]])
        .filter(x => x[1] > 0)
        .sort((a, b) => b[1] - a[1]);

    if (sortedItems.length === 0) {
        html += '<li class="py-3 text-center text-gray-500">🎉 ไม่มีของเสียในวันนี้</li>';
    } else {
        sortedItems.forEach(([type, totalPcs, setupPcs, prodPcs]) => {
            total += totalPcs;
            let setupNote = setupPcs > 0 ? `<span class="text-[10px] text-orange-600 ml-2">(Setup: ${setupPcs.toLocaleString()})</span>` : '';
            html += `
            <li class="py-3 flex justify-between items-center">
                <span class="text-sm font-medium text-gray-700">${type}${setupNote}</span>
                <span class="text-sm font-bold text-red-600">${totalPcs.toLocaleString()} ชิ้น</span>
            </li>`;
        });
        html += `
        <li class="py-3 flex justify-between items-center bg-red-50 mt-2 px-3 rounded-lg font-bold border border-red-100">
            <span class="text-red-800">รวมของเสียทั้งหมด</span>
            <span class="text-red-800 text-lg">${total.toLocaleString()} ชิ้น</span>
        </li>`;
    }

    html += '</ul>';
    container.innerHTML = html;

    const modalWindow = document.getElementById('modal-daily-ng-breakdown');
    if(modalWindow) {
        modalWindow.classList.remove('hidden');
        // ดัน z-index ให้สูงสุดแบบบังคับเพื่อทะลุโหมด Maximize
        modalWindow.style.setProperty('z-index', '999999', 'important');
    }
};

window.showTrendDayBreakdown = function(d) {
    const container = document.getElementById('daily-ng-content');
    const titleEl = document.getElementById('daily-ng-title');
    if (!container || !titleEl) return;

    titleEl.innerText = `📋 รายละเอียด: ${d.date}`;
    let html = '';

    // หน่วยช่วงเวลา: วัน / สัปดาห์ / เดือน / ไตรมาส / ปี (กราฟที่รวมเป็นช่วงส่ง d.periodWord มา)
    const periodWord = d.periodWord || 'วัน';

    // === ส่วนที่ 1: สรุปยอดรวมของช่วงนี้ ===
    html += `<div class="bg-gray-50 rounded-lg p-3 mb-3 grid grid-cols-2 gap-2 text-xs">
        <div><span class="text-gray-500">FG:</span> <b class="text-blue-700">${(d.fgPcs || 0).toLocaleString()} ชิ้น</b></div>
        <div><span class="text-gray-500">NG:</span> <b class="text-red-700">${(d.ngPcs || 0).toLocaleString()} ชิ้น</b></div>
        <div><span class="text-gray-500">NG Rate:</span> <b class="text-orange-700">${d.ngRate.toFixed(2)}%</b></div>
        <div><span class="text-gray-500">รอ Sort:</span> <b class="text-amber-700">${(d.pendingSortQty || 0).toLocaleString()} ชิ้น</b></div>
        <div><span class="text-gray-500">🔄 เปลี่ยนม้วน:</span> <b class="text-blue-700">${(d.coilChanges || 0)} ม้วน</b></div>
    </div>`;

    // === ส่วนที่ 2: NG แยกตามเครื่อง + ข้อมูลเปลี่ยนม้วน ===
    const coilByMac = d.coilChangesByMachine || {};
    const totalCoil = d.coilChanges || 0;

    if (d.ngByMachine && d.ngByMachine.length > 0) {
        html += `<h4 class="font-bold text-sm text-red-800 mb-1 border-b pb-1">🗑️ งาน NG แยกตามเครื่อง (${(d.ngPcs || 0).toLocaleString()} ชิ้น)</h4>`;

        const sortedNg = [...d.ngByMachine].sort((a, b) => b.ngPcs - a.ngPcs);
        sortedNg.forEach(item => {
            const sympEntries = Object.entries(item.symptoms || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
            const macCoils = coilByMac[item.machine] || 0;

            html += `<div class="border rounded-lg mb-2 overflow-hidden">
                <div class="bg-red-50 px-3 py-2 flex justify-between items-center">
                    <span class="font-bold text-sm text-gray-800">${item.machine}</span>
                    <span class="text-sm font-bold text-red-600">${item.ngPcs.toLocaleString()} ชิ้น</span>
                </div>`;
            if (sympEntries.length > 0) {
                html += '<div class="px-3 py-1 space-y-1">';
                sympEntries.forEach(([symp, pcs]) => {
                    const pct = item.ngPcs > 0 ? ((pcs / item.ngPcs) * 100).toFixed(0) : 0;
                    const pctDay = d.ngPcs > 0 ? ((pcs / d.ngPcs) * 100).toFixed(1) : '0.0';
                    const isRollChange = symp.toLowerCase().includes('เปลี่ยนม้วน') || symp.toLowerCase().includes('roll change');
                    html += `<div class="flex justify-between text-xs text-gray-600">
                        <span>${symp}</span>
                        <span class="font-mono whitespace-nowrap ml-2">${pcs.toLocaleString()} ชิ้น <span class="text-gray-400">(${pct}% เครื่อง)</span> <span class="text-red-500">(${pctDay}% ของ${periodWord})</span></span>
                    </div>`;
                    if (isRollChange && macCoils > 0) {
                        const avg = (pcs / macCoils).toFixed(1);
                        html += `<div class="text-xs text-blue-600 pl-3 -mt-0.5 mb-0.5">🔄 เปลี่ยน ${macCoils} ม้วน → เฉลี่ย ${avg} ชิ้น/ม้วน</div>`;
                    }
                });
                html += '</div>';
            }
            html += '</div>';
        });
    }

    // === ส่วนที่ 3: งานรอ Sort แยกตามเครื่อง ===
    if (d.pendingByMachine && d.pendingByMachine.length > 0) {
        html += `<h4 class="font-bold text-sm text-amber-800 mb-1 mt-3 border-b pb-1">⏳ งานรอ Sort แยกตามเครื่อง (${(d.pendingSortQty || 0).toLocaleString()} ชิ้น)</h4>`;
        const sortedPending = [...d.pendingByMachine].sort((a, b) => b.pendingPcs - a.pendingPcs);
        sortedPending.forEach(item => {
            const sympEntries = Object.entries(item.symptoms || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
            const estLabel = item.estimated ? ' <span class="text-[10px] text-orange-500 font-normal">(ประมาณการจาก NG)</span>' : '';
            html += `<div class="border rounded-lg mb-2 overflow-hidden">
                <div class="bg-amber-50 px-3 py-2 flex justify-between items-center">
                    <span class="font-bold text-sm text-gray-800">${item.machine}${estLabel}</span>
                    <span class="text-sm font-bold text-amber-700">${item.pendingPcs.toLocaleString()} ชิ้น</span>
                </div>`;
            if (sympEntries.length > 0) {
                html += '<div class="px-3 py-1 space-y-1">';
                sympEntries.forEach(([symp, pcs]) => {
                    const pct = item.pendingPcs > 0 ? ((pcs / item.pendingPcs) * 100).toFixed(0) : 0;
                    html += `<div class="flex justify-between text-xs text-gray-600">
                        <span>${symp}</span>
                        <span class="font-mono">${pcs.toLocaleString()} ชิ้น <span class="text-gray-400">(${pct}%)</span></span>
                    </div>`;
                });
                html += '</div>';
            } else {
                html += '<div class="px-3 py-1 text-xs text-gray-400">ไม่มีข้อมูลอาการ (ยังไม่ได้ Deploy Backend)</div>';
            }
            html += '</div>';
        });
    }

    if ((!d.ngByMachine || d.ngByMachine.length === 0) && (!d.pendingByMachine || d.pendingByMachine.length === 0)) {
        html = `<div class="text-center text-gray-500 py-4">ไม่มีข้อมูลใน${periodWord}นี้</div>`;
    }

    container.innerHTML = html;
    const modalWindow = document.getElementById('modal-daily-ng-breakdown');
    if (modalWindow) {
        modalWindow.classList.remove('hidden');
        modalWindow.style.setProperty('z-index', '999999', 'important');
    }
};

window.viewMaintImage = function(url, caption) {
    const modal = document.getElementById('modal-image-viewer');
    const img = document.getElementById('viewer-img');
    const cap = document.getElementById('viewer-caption');

    if (modal && img) {
        img.src = url;
        if (cap) cap.innerText = caption || 'ภาพแนบการแจ้งซ่อม';
        modal.classList.remove('hidden');
        // ดัน z-index ให้สูงสุดแบบบังคับเพื่อทะลุโหมด Maximize
        modal.style.setProperty('z-index', '999999', 'important');
    } else {
        window.open(url, '_blank');
    }
};
// 🌟 ฟังก์ชันสำหรับ ขยาย/ย่อ หน้าต่าง Modal ให้เต็มจอ
        window.toggleModalFullscreen = function(contentId, btn) {
            const content = document.getElementById(contentId);
            if (!content) return;

            const isMaximized = content.classList.contains('max-w-full');

            if (isMaximized) {
                // ย่อกลับขนาดเดิม
                content.classList.remove('max-w-full', 'h-full', 'w-full', 'max-h-screen', 'rounded-none');
                content.classList.add('max-w-3xl', 'max-h-[90vh]', 'rounded-xl');
                btn.innerHTML = '⛶'; 
                btn.title = "ขยายเต็มจอ";
            } else {
                // ขยายเต็มจอ
                content.classList.remove('max-w-3xl', 'max-h-[90vh]', 'rounded-xl');
                content.classList.add('max-w-full', 'h-full', 'w-full', 'max-h-screen', 'rounded-none');
                btn.innerHTML = '🗗'; 
                btn.title = "ย่อหน้าต่าง";
            }

            // บังคับให้กราฟคำนวณสเกลตัวเองใหม่เมื่อขนาดหน้าต่างเปลี่ยน
            setTimeout(() => {
                if (typeof machineDetailChart !== 'undefined' && machineDetailChart) {
                    machineDetailChart.resize();
                }
                if (typeof machineDailyChartInst !== 'undefined' && machineDailyChartInst) {
                    machineDailyChartInst.resize();
                }
            }, 350); // รอให้ CSS Transition ขยายเสร็จก่อนค่อย Resize กราฟ
        };

