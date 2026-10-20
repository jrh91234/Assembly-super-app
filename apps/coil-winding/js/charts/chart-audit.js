// ==========================================
// Generic Chart Audit Framework (calculation evidence)
// แต่ละกราฟลงทะเบียน "builder" ที่คืนค่า spec แล้ว renderer กลางสร้าง popup + พิมพ์ + CSV
// เพิ่มกราฟใหม่: เขียน window.buildXxxAudit() คืน spec แล้วผูกใน showChartAudit()
// ==========================================
window._chartAuditSpec = null;

// ---- ตัวช่วย format ค่าในตาราง ----
const _ca_fmt = (v, type) => {
    if (v === null || v === undefined || v === '') return '-';
    if (type === 'int') return Math.round(v).toLocaleString();
    if (type === 'num1') return (Math.round(v * 10) / 10).toLocaleString();
    if (type === 'num2') return Number(v).toFixed(2);
    if (type === 'pct') return Number(v).toFixed(2) + '%';
    return v;
};

// ---- Dispatcher: เลือก builder ตามชื่อกราฟ ----
window.showChartAudit = function(key) {
    if (!currentDashboardData) { alert('กรุณาโหลดข้อมูลก่อน'); return; }
    let spec = null;
    if (key === 'dailyOutput' && typeof window.buildDailyOutputAudit === 'function') {
        spec = window.buildDailyOutputAudit();
    }
    // (กราฟอื่นๆ จะเพิ่ม builder ที่นี่ในรอบถัดไป)
    if (!spec) { alert('ยังไม่รองรับรายการคำนวณ (Audit) ของกราฟนี้'); return; }
    window.renderChartAudit(spec);
};

// ---- Renderer กลาง: spec -> HTML ใน modal ----
window.renderChartAudit = function(spec) {
    window._chartAuditSpec = spec;
    const container = document.getElementById('chart-audit-content');
    if (!container) return;
    const now = new Date().toLocaleString('th-TH');

    let html = '';

    // Header + ตัวกรองที่ใช้
    html += `<div class="bg-white border rounded-lg p-4 mb-4 shadow-sm">
        <h2 class="text-lg font-black text-gray-800 mb-2">${spec.title}</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600">
            <div><b>สร้างเมื่อ:</b> ${now}</div>`;
    (spec.filters || []).forEach(f => { html += `<div><b>${f.label}:</b> ${f.value}</div>`; });
    html += `</div></div>`;

    // สูตร & หลักการคำนวณ
    if (spec.methodology && spec.methodology.length) {
        html += `<div class="bg-white border rounded-lg p-4 mb-4 shadow-sm">
            <h3 class="font-bold text-sm text-blue-800 border-b pb-1 mb-2">สูตร &amp; หลักการคำนวณ</h3>
            <div class="text-xs text-gray-700 space-y-1">`;
        spec.methodology.forEach(m => { html += `<p>${m}</p>`; });
        html += `</div></div>`;
    }

    // สรุปยอด (การ์ดเล็ก)
    if (spec.summary && spec.summary.length) {
        html += `<div class="bg-white border rounded-lg p-4 mb-4 shadow-sm">
            <h3 class="font-bold text-sm text-blue-800 border-b pb-1 mb-2">สรุป</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">`;
        spec.summary.forEach(s => {
            html += `<div class="bg-gray-50 rounded p-2"><b>${s.label}:</b><br><span class="text-lg font-bold ${s.color || ''}">${s.value}</span></div>`;
        });
        html += `</div></div>`;
    }

    // ตารางคำนวณ (หลักฐาน)
    html += `<div class="bg-white border rounded-lg p-4 mb-4 shadow-sm">
        <h3 class="font-bold text-sm text-blue-800 border-b pb-1 mb-2">ตารางคำนวณ (หลักฐาน)</h3>
        <div class="overflow-x-auto"><table class="w-full text-xs border-collapse"><thead><tr class="bg-blue-50">`;
    spec.columns.forEach(c => { html += `<th class="border p-1 text-${c.align || 'left'}">${c.label}</th>`; });
    html += `</tr></thead><tbody>`;
    if (!spec.rows.length) {
        html += `<tr><td class="border p-2 text-center text-gray-400" colspan="${spec.columns.length}">ไม่มีข้อมูลในช่วงที่เลือก</td></tr>`;
    }
    spec.rows.forEach(r => {
        html += `<tr>`;
        spec.columns.forEach(c => { html += `<td class="border p-1 text-${c.align || 'left'} ${c.mono ? 'font-mono' : ''}">${_ca_fmt(r[c.key], c.type)}</td>`; });
        html += `</tr>`;
    });
    if (spec.totals) {
        html += `<tr class="bg-gray-100 font-bold">`;
        spec.columns.forEach((c, i) => {
            const val = spec.totals[c.key];
            const cell = (val === undefined) ? (i === 0 ? 'รวม' : '') : _ca_fmt(val, c.type);
            html += `<td class="border p-1 text-${c.align || 'left'} ${c.mono ? 'font-mono' : ''}">${cell}</td>`;
        });
        html += `</tr>`;
    }
    html += `</tbody></table></div></div>`;

    // หมายเหตุ / verification
    if (spec.notes && spec.notes.length) {
        html += `<div class="bg-white border rounded-lg p-4 mb-4 shadow-sm">
            <h3 class="font-bold text-sm text-blue-800 border-b pb-1 mb-2">หมายเหตุ / Verification</h3>
            <ul class="text-xs text-gray-700 space-y-1 list-disc pl-5">`;
        spec.notes.forEach(n => { html += `<li>${n}</li>`; });
        html += `</ul></div>`;
    }

    container.innerHTML = html;
    const modal = document.getElementById('modal-chart-audit');
    if (modal) modal.classList.remove('hidden');
};

window.closeChartAudit = function() {
    const m = document.getElementById('modal-chart-audit');
    if (m) m.classList.add('hidden');
};

// ---- ดาวน์โหลด CSV จาก spec ปัจจุบัน ----
window.downloadChartAuditCSV = function() {
    const spec = window._chartAuditSpec;
    if (!spec) return;
    const esc = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    let csv = spec.columns.map(c => esc(c.label)).join(',') + '\n';
    spec.rows.forEach(r => {
        csv += spec.columns.map(c => esc(r[c.key])).join(',') + '\n';
    });
    if (spec.totals) {
        csv += spec.columns.map((c, i) => esc(spec.totals[c.key] !== undefined ? spec.totals[c.key] : (i === 0 ? 'รวม' : ''))).join(',') + '\n';
    }
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${spec.fileName || 'Chart_Audit'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

// ---- พิมพ์รายงาน ----
window.printChartAudit = function() {
    const content = document.getElementById('chart-audit-content');
    if (!content) return;
    const w = window.open('', '_blank');
    if (!w) { alert('กรุณาอนุญาต Popup ในเบราว์เซอร์เพื่อพิมพ์รายงาน'); return; }
    w.document.write(`<html><head><title>Chart Audit Report</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        <style>body{padding:20px;font-size:11px} table{page-break-inside:auto} tr{page-break-inside:avoid} @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
    </head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 500);
};

// ==========================================
// Builder: Daily Output (ใช้ getDailyOutputSeries — แหล่งข้อมูลเดียวกับกราฟ)
// ==========================================
window.buildDailyOutputAudit = function() {
    if (typeof window.getDailyOutputSeries !== 'function') return null;
    const S = window.getDailyOutputSeries();
    if (!S) return null;

    // ใช้เงื่อนไขที่โหลดข้อมูลชุดนี้มาจริง (ช่องกรองอาจถูกเปลี่ยนไปแล้วโดยยังไม่ได้กดค้นหา)
    const qMeta = (typeof window.getLoadedQueryMeta === 'function') ? window.getLoadedQueryMeta() : null;
    const startDate = qMeta ? qMeta.start : (document.getElementById('startDate')?.value || '-');
    const endDate = qMeta ? qMeta.end : (document.getElementById('endDate')?.value || '-');
    const shiftFilter = qMeta ? qMeta.shift : (document.getElementById('filterShift')?.value || 'All');
    const shiftTypeFilter = qMeta ? qMeta.shiftType : (document.getElementById('filterShiftType')?.value || 'All');
    const isStale = (typeof window.isFilterStale === 'function') && window.isFilterStale();
    const periodLabelMap = { day: 'รายวัน', week: 'รายสัปดาห์ (เริ่มจันทร์)', month: 'รายเดือน', quarter: 'รายไตรมาส', year: 'รายปี' };
    const modeLabelMap = { pcs: 'จำนวน (ชิ้น)', percent: 'สัดส่วน (%)' };

    const columns = [
        { key: 'period', label: 'ช่วงเวลา', align: 'left' },
        { key: 'fg', label: 'FG ผลิต (ชิ้น)', align: 'right', type: 'int', mono: true },
        { key: 'ng', label: 'NG ผลิต (ชิ้น)', align: 'right', type: 'int', mono: true },
        { key: 'sFg', label: 'FG คัดแยก (ชิ้น)', align: 'right', type: 'int', mono: true },
        { key: 'sNg', label: 'NG คัดแยก (ชิ้น)', align: 'right', type: 'int', mono: true },
        { key: 'pending', label: 'รอ Sort (ชิ้น)', align: 'right', type: 'int', mono: true },
        { key: 'total', label: 'รวมทั้งหมด (ชิ้น)', align: 'right', type: 'int', mono: true },
        { key: 'fgGood', label: 'FG รวม/ดี (ชิ้น)', align: 'right', type: 'int', mono: true },
        { key: 'hours', label: 'ชม.-เครื่อง', align: 'right', type: 'num1', mono: true }
    ];

    const rows = S.periods.map(p => ({
        period: window.formatPeriodTitle ? window.formatPeriodTitle(p.key, S.period) : p.key, fg: p.fg, ng: p.ng, sFg: p.sFg, sNg: p.sNg,
        pending: p.pending || 0,
        total: p.total, fgGood: p.fgGood, hours: p.hours
    }));

    const sum = (sel) => S.periods.reduce((a, p) => a + sel(p), 0);
    const totals = {
        period: 'รวม',
        fg: sum(p => p.fg), ng: sum(p => p.ng), sFg: sum(p => p.sFg), sNg: sum(p => p.sNg),
        pending: sum(p => p.pending || 0),
        total: sum(p => p.total), fgGood: sum(p => p.fgGood),
        hours: Math.round(sum(p => p.hours) * 10) / 10
    };

    const methodology = [
        '<b>รวมทั้งหมด (ต่อช่วง)</b> = <code class="bg-gray-100 px-1 rounded">FG ผลิต + NG ผลิต + FG คัดแยก + NG คัดแยก + รอ Sort</code> (นับเป็นชิ้น) = ความสูงของแท่ง stack · แถว Production_Data ที่มาจาก Batch_ID SORT-* จะไม่ถูกนับซ้ำในฝั่งงานผลิตของกราฟนี้',
        S.pendingMode !== 'merge'
            ? '<b>รอ Sort (ยังไม่รู้ผล)</b> แยกตาม <u>ขั้นตอนที่พบ</u>: ใบที่ <b>พบระหว่างผลิต</b> ยังไม่เคยถูกบันทึกเป็น FG หรือ NG มาก่อน จึงเป็นก้อนใหม่ (ไม่หักจากที่ไหน) ส่วนใบที่ <b>พบที่ FG/RTV</b> เคยนับเป็น FG ไปแล้ว จึง<u>หักออกจาก FG ผลิต</u> ของช่วงนั้น (หักได้ไม่เกินยอด FG ของช่วงนั้น)'
            : '<b>โหมดรวมใน FG/NG (เดิม)</b> — งานรอ Sort ยังถูกนับรวมอยู่ใน FG/NG ตามที่บันทึกไว้ ไม่มีการแยกก้อน',
        '<b>FG รวม/ดี</b> = <code class="bg-gray-100 px-1 rounded">FG ผลิต + FG คัดแยก</code>',
        '<b>NG (ชิ้น)</b> แปลงจากน้ำหนัก: <code class="bg-gray-100 px-1 rounded">NG ชิ้น = NG Kg ÷ WPP ของรุ่น</code>',
        '<b>ชั่วโมง-เครื่อง</b> = รวม (เครื่อง × ช่วงชั่วโมงที่เดินจริง) ถ่วงด้วยความยาวช่วง (เช่น OT 17:30-18:00 = 0.5 ชม.)',
        `<b>เส้นเฉลี่ย</b> = ค่าเฉลี่ยทุกช่วงที่แสดง → เฉลี่ยรวม = <b>${Math.round(S.avgTotal).toLocaleString()}</b> ชิ้น, เฉลี่ย FG = <b>${Math.round(S.avgFg).toLocaleString()}</b> ชิ้น`,
        'การแบ่งวันยึด <b>กะ 08:00</b> (ก่อน 8 โมงเช้านับเป็นวันก่อนหน้า) · สัปดาห์เริ่มวันจันทร์ · เดือนตาม yyyy-MM · ไตรมาส Q1=ม.ค.-มี.ค. · ปีตามปฏิทิน'
    ];

    const summary = [
        { label: 'รวมทั้งหมด (ชิ้น)', value: totals.total.toLocaleString(), color: 'text-gray-800' },
        { label: 'FG รวม/ดี (ชิ้น)', value: totals.fgGood.toLocaleString(), color: 'text-blue-700' },
        { label: 'ชั่วโมง-เครื่องรวม', value: totals.hours.toLocaleString() + ' ชม.', color: 'text-sky-700' },
        { label: 'เฉลี่ยรวม/ช่วง', value: Math.round(S.avgTotal).toLocaleString() + ' ชิ้น', color: 'text-purple-700' }
    ];

    const notes = [
        'ตัวเลขทุกคอลัมน์มาจากฟังก์ชันคำนวณเดียวกับที่กราฟใช้วาด (getDailyOutputSeries) จึงตรงกับกราฟเสมอ',
        'NG ชิ้นปัดจากน้ำหนัก ÷ WPP อาจมีปัดเศษเล็กน้อยเมื่อเทียบกับยอดน้ำหนักดิบ',
        'งานคัดแยกที่ Completed/Wait QC แสดงเป็น FG/NG คัดแยก ส่วนงาน Pending/Rejected เท่านั้นที่ถือเป็นงานรอคัดใน forecast; แถว SORT-* ที่ sync เข้า Production_Data ถูกกันออกจากฝั่งงานผลิตของ Daily Output เพื่อไม่ให้นับซ้ำ',
        S.model !== 'all'
            ? `กำลังดูเฉพาะรุ่น ${S.model} — ยอด sort รายรุ่นอาศัยชื่อรุ่นในชีต Sorting ตรงกับฝั่งผลิต`
            : 'ดูรายรุ่นได้โดยเลือกรุ่นที่ dropdown แล้วเปิด Audit ใหม่',
        'ตาราง KPI แยกรุ่นในรายงานอัตโนมัติเป็น "ยอดรวมทั้งช่วง" และรวมแถว SORT-* ด้วย จึงมากกว่าแท่งรายวันของกราฟนี้ — ให้เทียบกับแถว "รวม" ด้านล่าง (FG ผลิต + FG คัดแยก)'
    ];
    if (isStale) {
        notes.unshift('⚠️ ตัวกรองบนหน้าจอถูกเปลี่ยนหลังโหลดข้อมูล — ตัวเลขชุดนี้ยังเป็นของช่วงที่ระบุไว้ด้านบน กด 🔍 ค้นหา เพื่อโหลดใหม่');
    }

    return {
        title: 'Audit: Daily Output — รายการคำนวณ',
        fileName: 'DailyOutput_Audit',
        filters: [
            { label: 'ช่วงวันที่', value: `${startDate} ~ ${endDate}` },
            { label: 'กะ', value: `${shiftFilter} / ${shiftTypeFilter}` },
            { label: 'รุ่น', value: S.model === 'all' ? 'ทุกรุ่น' : S.model },
            { label: 'มุมมอง', value: `${periodLabelMap[S.period] || S.period} · ${modeLabelMap[S.mode] || S.mode}` }
        ],
        methodology, summary, columns, rows, totals, notes
    };
};
