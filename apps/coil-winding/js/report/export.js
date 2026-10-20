// =========================================================
// 🌟 แก้ปัญหา Android Mobile Chrome พิมพ์หน้าจอไม่ได้ 🌟
// =========================================================
window.printAutoReport = function() {
    const sDate = document.getElementById('startDate').value;
    const eDate = document.getElementById('endDate').value;
    const shiftElement = document.getElementById('filterShift');
    const shift = shiftElement.options[shiftElement.selectedIndex].text;
    
    let dateStr = "";
    if (sDate) {
        const dateObj = new Date(sDate);
        if (!isNaN(dateObj.getTime())) { 
            const options = { day: 'numeric', month: 'short', year: 'numeric' };
            dateStr = dateObj.toLocaleDateString('en-GB', options);
        } else {
             dateStr = sDate; 
        }
    } else {
         dateStr = "Unknown Date";
    }

    if (eDate && eDate !== sDate) {
         const eDateObj = new Date(eDate);
         if (!isNaN(eDateObj.getTime())) {
             const eOptions = { day: 'numeric', month: 'short', year: 'numeric' };
             dateStr += ` to ${eDateObj.toLocaleDateString('en-GB', eOptions)}`;
         }
    }

    const targetTitle = `CWM_Report_Shift_${shift}_${dateStr.replace(/ /g, '_')}`;
    const originalTitle = document.title;
    document.title = targetTitle;

    const modal = document.getElementById('modal-auto-report');
    
    // เก็บ Class ดั้งเดิมไว้
    const originalModalClasses = modal.className;

    // ถอดความเป็น Modal ชั่วคราว (ทิ้ง Fixed / inset-0) เพราะ Android จะงงเวลา Spool PDF
    document.body.classList.add('printing-auto-report');
    modal.className = 'block w-full bg-white z-50'; // กำหนดให้เป็นเอกสารธรรมดา
    document.body.style.overflow = 'visible'; // บังคับให้ Scroll ได้ขณะพิมพ์

    // เลื่อนจอขึ้นบนสุดเพื่อให้ระบบ Spooler ของมือถือเก็บภาพได้ครบถ้วน
    window.scrollTo(0, 0);
    
    // หน่วงเวลาให้เบราว์เซอร์จัดเรียง DOM ใหม่ (Reflow) ก่อนสั่งพิมพ์
    setTimeout(() => {
        window.print();
        
        // คืนค่าเดิมหลังจากพิมพ์เสร็จ
        setTimeout(() => { 
            document.body.classList.remove('printing-auto-report'); 
            modal.className = originalModalClasses; // สวมชุด Modal กลับคืน
            document.title = originalTitle;
            document.body.style.overflow = '';
        }, 1000);
    }, 800); // ดีเลย์ 800ms ให้ Canvas และ Layout วาดตัวเสร็จ
};

window.exportCSV = function() {
    if (!currentDashboardData) {
        alert("⚠️ กรุณากดปุ่มค้นหาข้อมูล (ดึง Dashboard) ก่อนทำการส่งออก Excel");
        return;
    }
    
    const data = currentDashboardData;
    let csvContent = "\ufeff";
    // escape \u0e04\u0e48\u0e32\u0e43\u0e19 CSV: \u0e04\u0e23\u0e2d\u0e1a quote \u0e40\u0e21\u0e37\u0e48\u0e2d\u0e21\u0e35 comma/quote/newline + \u0e01\u0e31\u0e19 formula injection (= + - @)
    const csvCell = (v) => {
        let s = (v === null || v === undefined) ? '' : String(v);
        if (/^[=+\-@]/.test(s)) s = "'" + s;
        if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
    };

    csvContent += "--- Overall Summary ---\n";
    csvContent += "Machine,Product Assigned,FG (Pcs),NG (Pcs),NG (Kg),% Yield\n";

    for(let i=1; i<=16; i++) {
        const m = `CWM-${String(i).padStart(2,'0')}`;
        const d = (data.machineData && data.machineData[m]) ? data.machineData[m] : {fg:0, ngTotal:0, ngTotalKg:0, ngTotalPcs:0};
        const ngPcs = d.ngTotalPcs !== undefined ? d.ngTotalPcs : (d.ngTotal || 0);
        const ngKg = d.ngTotalKg || 0;
        const t = d.fg + ngPcs;
        const y = t > 0 ? ((d.fg/t)*100).toFixed(2) : "0.00";
        const productAssigned = machineMapping[m] || 'Unassigned';
        csvContent += [m, productAssigned, d.fg, ngPcs, ngKg.toFixed(2), y + '%'].map(csvCell).join(',') + '\n';
    }

    csvContent += "\n--- Daily Breakdown ---\n";
    csvContent += "Date,Machine,Product Assigned,FG (Pcs),NG (Pcs),NG (Kg),% Yield\n";

    const datesSet = new Set();
    if (data.machineData) {
        Object.values(data.machineData).forEach(mData => {
            if (mData.daily) Object.keys(mData.daily).forEach(d => datesSet.add(d));
        });
    }
    const sortedDates = Array.from(datesSet).sort();

    sortedDates.forEach(date => {
        for(let i=1; i<=16; i++) {
            const m = `CWM-${String(i).padStart(2,'0')}`;
            const productAssigned = machineMapping[m] || 'Unassigned';
            const mData = data.machineData ? data.machineData[m] : null;
            
            if (mData && mData.daily && mData.daily[date]) {
                const daily = mData.daily[date];
                const fg = daily.fg || 0;
                const ngPcs = daily.ngPcs || 0;

                // ใช้ helper กลาง (strict, no fallback) แทนการคำนวณ WPP ซ้ำ — ตรงกับ dashboard
                const ngKg = (typeof getKgFromPcs === 'function' ? getKgFromPcs(productAssigned, ngPcs) : 0).toFixed(2);
                const total = fg + ngPcs;
                const y = total > 0 ? ((fg/total)*100).toFixed(2) : "0.00";

                if (total > 0) csvContent += [date, m, productAssigned, fg, ngPcs, ngKg, y + '%'].map(csvCell).join(',') + '\n';
            }
        }
    });
    
    // --- Job Order (แผนการผลิต + ความคืบหน้า) ---
    const jobOrders = (data.jobOrders || []);
    if (jobOrders.length > 0) {
        const joActual = data.jobOrderData || {};
        csvContent += "\n--- Job Order Progress ---\n";
        csvContent += "Job Order,Plan Date,Product,Shift,Target Qty,Produced (Total),Produced (This Range),NG Net (Pcs),Pending Sorting (Pcs),Accounted (FG+NG Net),Qty Complete,Remaining,% Progress,Status\n";
        jobOrders.forEach(j => {
            const inRange = joActual[j.jobOrder] || { fg: 0, ngPcs: 0 };
            const q = (typeof window.getJobOrderQty === 'function')
                ? window.getJobOrderQty(j)
                : { ngNet: j.producedNgPcs || 0, sortingOpen: j.sortingOpenPcs || 0, accounted: j.accountedPcs || 0, complete: false };
            csvContent += [
                j.jobOrder, j.planDate, j.product, j.shift,
                j.targetQty, j.producedFg, inRange.fg || 0, q.ngNet, q.sortingOpen, q.accounted,
                q.complete ? 'Yes' : 'No',
                j.remainingQty, (j.progressPct || 0).toFixed(1) + '%', j.status
            ].map(csvCell).join(',') + '\n';
        });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `CWM_Report_${document.getElementById('startDate').value}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

