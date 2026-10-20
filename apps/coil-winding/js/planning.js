// =========================================================
// 📅 ระบบวางแผนการผลิต / Job Order (Plan_Data)
// - บันทึกแผนการผลิตพร้อมเลข Job Order (สร้างอัตโนมัติได้)
// - ติดตามความคืบหน้าเทียบยอดผลิตจริงจาก Production_Data
// - ส่งรายการ Job Order ที่ยังเปิดอยู่ให้ฟอร์มบันทึกผลิตเลือกใช้
// =========================================================

window.jobOrderList = window.jobOrderList || [];
window.jobOrderLoading = false;
window.editingJobOrder = null;
window.unlinkedSorting = null;   // งาน Sorting ที่ยังไม่ผูกเลข Job Order

const JOB_ORDER_STATUS_LABEL = {
    'Open': 'รอผลิต',
    'In Progress': 'กำลังผลิต',
    'Completed': 'ผลิตครบแล้ว',
    'Closed': 'ปิดงาน',
    'Cancelled': 'ยกเลิก'
};

const JOB_ORDER_STATUS_CLASS = {
    'Open': 'bg-gray-100 text-gray-700 border-gray-200',
    'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
    'Completed': 'bg-green-50 text-green-700 border-green-200',
    'Closed': 'bg-slate-200 text-slate-700 border-slate-300',
    'Cancelled': 'bg-red-50 text-red-600 border-red-200'
};

// -------------------- ยอดของ Job Order (กันนับซ้ำ) --------------------
// ยึด "ขั้นตอนที่พบของเสีย" เป็นตัวตัดสิน (backend คำนวณมาให้แล้ว — ที่นี่มี fallback สำหรับ payload เก่า)
//   พบระหว่างผลิต → ยังไม่เคยบันทึกที่ไหน → ยอดรอคัดเป็นก้อนใหม่ ไม่หักจาก FG/NG
//   พบที่ FG/RTV  → เคยนับเป็น FG แล้ว → หักออกจาก FG ของจ๊อบนั้น
//   คัดเสร็จ      → กลายเป็น FG (คัดกลับได้) + NG (ของเสียจริง) และออกจากก้อนรอคัด
//   รวมนับได้ = FG + NG + รอ Sorting  (สามก้อนไม่ซ้ำกัน)
window.getJobOrderQty = function(j) {
    j = j || {};
    const fgSort = j.producedFgFromSort || 0;
    const pending = j.pendingSortPcs || 0;
    const waitQc = j.waitQcPcs || 0;
    const sortingOpen = (j.sortingOpenPcs !== undefined) ? j.sortingOpenPcs : (pending + waitQc);
    const openFromFg = j.sortingOpenFromFg || 0;
    const openFromLine = (j.sortingOpenFromLine !== undefined)
        ? j.sortingOpenFromLine
        : Math.max(0, sortingOpen - openFromFg);
    const fgBooked = (j.producedFgBooked !== undefined) ? j.producedFgBooked : (j.producedFg || 0);
    const fg = (j.producedFgBooked !== undefined) ? (j.producedFg || 0) : Math.max(0, fgBooked - openFromFg);
    const ngMachine = (j.ngPcsFromMachine !== undefined) ? j.ngPcsFromMachine : (j.producedNgPcs || 0);
    const ngFromSort = j.ngPcsFromSort || 0;
    const ngNet = (j.ngPcsFromMachine !== undefined) ? (ngMachine + ngFromSort) : (j.producedNgPcs || 0);
    const accounted = (j.accountedPcs !== undefined) ? j.accountedPcs : (fg + ngNet + sortingOpen);
    const target = j.targetQty || 0;
    return {
        fg: fg,
        fgBooked: fgBooked,
        fgFromSort: fgSort,
        ngNet: ngNet,
        ngMachine: ngMachine,
        ngFromSort: ngFromSort,
        pending: pending,
        waitQc: waitQc,
        sortingOpen: sortingOpen,
        openFromFg: openFromFg,
        openFromLine: openFromLine,
        accounted: accounted,
        target: target,
        shortage: Math.max(0, target - accounted),
        complete: target > 0 && accounted >= target
    };
};

// Job Order ที่ยังรับยอดผลิตได้ (ยังไม่ปิด / ไม่ยกเลิก)
window.getActiveJobOrders = function() {
    return (window.jobOrderList || []).filter(j =>
        j.jobOrder && j.status !== 'Cancelled' && j.status !== 'Closed'
    );
};

window.getJobOrderByNo = function(no) {
    if (!no) return null;
    return (window.jobOrderList || []).find(j => j.jobOrder === no) || null;
};

// -------------------- โหลดข้อมูล --------------------
window.loadJobOrders = async function(silent) {
    if (window.jobOrderLoading) return window.jobOrderList;
    window.jobOrderLoading = true;
    const tbody = document.getElementById('joTableBody');
    if (tbody && !silent) {
        tbody.innerHTML = `<tr><td colspan="12" class="p-6 text-center text-gray-400 text-sm">⏳ กำลังโหลดรายการ Job Order...</td></tr>`;
    }
    try {
        const res = await fetch(`${SCRIPT_URL}?action=GET_JOB_ORDERS&_t=${Date.now()}`);
        const data = await res.json();
        window.jobOrderList = (data && data.jobOrders) ? data.jobOrders : [];
        window.unlinkedSorting = (data && data.unlinkedSorting) ? data.unlinkedSorting : null;
    } catch (e) {
        console.log('Load job orders error:', e);
        if (tbody && !silent) {
            tbody.innerHTML = `<tr><td colspan="12" class="p-6 text-center text-red-500 text-sm">❌ โหลดรายการไม่สำเร็จ: ${e.message}</td></tr>`;
        }
    } finally {
        window.jobOrderLoading = false;
    }
    window.renderJobOrderTable();
    window.refreshAllJobOrderSelects();
    return window.jobOrderList;
};

// -------------------- ตัวเลือก Job Order ในฟอร์มบันทึกผลิต --------------------
// สร้าง <option> ของ Job Order ที่ยังเปิดอยู่ (กรองตามรุ่นได้)
window.buildJobOrderOptions = function(selectedValue, productFilter) {
    let opts = `<option value="">— ไม่ระบุ Job Order —</option>`;
    const list = window.getActiveJobOrders();
    let matched = false;

    list.forEach(j => {
        if (productFilter && j.product && j.product !== productFilter) return;
        const remain = (j.remainingQty !== undefined) ? j.remainingQty : '-';
        const sel = (selectedValue && selectedValue === j.jobOrder) ? 'selected' : '';
        if (sel) matched = true;
        opts += `<option value="${j.jobOrder}" data-product="${j.product || ''}" ${sel}>${j.jobOrder} | ${j.product || '-'} | คงเหลือ ${remain}</option>`;
    });

    // ถ้าเลข Job Order ที่เลือกไว้ไม่อยู่ในรายการที่กรอง ให้คงตัวเลือกนั้นไว้ (กันข้อมูลหาย)
    if (selectedValue && !matched) {
        opts += `<option value="${selectedValue}" selected>${selectedValue}</option>`;
    }
    return opts;
};

window.refreshAllJobOrderSelects = function() {
    document.querySelectorAll('.job-order-select-target').forEach(sel => {
        const row = sel.closest('[data-row-id]') || sel.parentElement.parentElement;
        const prodSel = row ? row.querySelector('.product-select-target') : null;
        const product = prodSel ? prodSel.value : '';
        sel.innerHTML = window.buildJobOrderOptions(sel.value, product);
    });
};

// -------------------- ตารางรายการ Job Order --------------------
window.renderJobOrderTable = function() {
    const tbody = document.getElementById('joTableBody');
    if (!tbody) return;

    const statusFilter = (document.getElementById('joFilterStatus')?.value) || 'Active';
    const keyword = ((document.getElementById('joFilterKeyword')?.value) || '').trim().toLowerCase();

    let list = (window.jobOrderList || []).slice();

    if (statusFilter === 'Active') {
        list = list.filter(j => j.status === 'Open' || j.status === 'In Progress');
    } else if (statusFilter !== 'All') {
        list = list.filter(j => j.status === statusFilter);
    }

    if (keyword) {
        list = list.filter(j =>
            [j.jobOrder, j.product].some(v => String(v || '').toLowerCase().includes(keyword))
        );
    }

    // เรียงตามวันที่แผน จากเก่าไปใหม่
    list.sort((a, b) => {
        const da = a.planDate || '9999-12-31';
        const db = b.planDate || '9999-12-31';
        if (da !== db) return da < db ? -1 : 1;
        return String(a.jobOrder).localeCompare(String(b.jobOrder));
    });

    const summary = document.getElementById('joSummary');
    if (summary) {
        const q = list.map(j => window.getJobOrderQty(j));
        const sum = (key) => q.reduce((s, x) => s + (x[key] || 0), 0);
        const totalTarget = sum('target');
        const totalDone = sum('fg');
        const totalNg = sum('ngNet');
        const totalPending = sum('sortingOpen');
        const totalAccounted = sum('accounted');
        const pct = totalTarget > 0 ? ((totalDone / totalTarget) * 100).toFixed(1) : '0.0';
        const accPct = totalTarget > 0 ? ((totalAccounted / totalTarget) * 100).toFixed(1) : '0.0';
        summary.innerHTML = `${list.length} รายการ · เป้า ${totalTarget.toLocaleString()} ชิ้น · ผลิตแล้ว ${totalDone.toLocaleString()} ชิ้น (${pct}%)`
            + ` · NG สุทธิ ${totalNg.toLocaleString()} ชิ้น · รอ Sorting ${totalPending.toLocaleString()} ชิ้น`
            + ` · <span class="font-bold text-indigo-700">รวมนับได้ ${totalAccounted.toLocaleString()} ชิ้น (${accPct}%)</span>`;

        const u = window.unlinkedSorting;
        const unlinkedPcs = u ? ((u.pendingPcs || 0) + (u.waitQcPcs || 0)) : 0;
        if (unlinkedPcs > 0) {
            summary.innerHTML += `<div class="text-[11px] text-amber-700 mt-0.5">`
                + `⚠️ มีงาน Sorting ที่ยังไม่ผูกเลข Job Order อีก ${unlinkedPcs.toLocaleString()} ชิ้น (ไม่ถูกรวมในตารางนี้)`
                + `</div>`;
        }
    }

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" class="p-6 text-center text-gray-400 text-sm">ไม่พบ Job Order ตามเงื่อนไขที่เลือก</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(j => {
        const pct = Math.min(100, j.progressPct || 0);
        const barColor = pct >= 100 ? 'bg-green-500' : (pct >= 50 ? 'bg-blue-500' : 'bg-amber-500');
        const statusCls = JOB_ORDER_STATUS_CLASS[j.status] || 'bg-gray-100 text-gray-700 border-gray-200';
        const statusText = JOB_ORDER_STATUS_LABEL[j.status] || j.status;
        const canDelete = (j.producedFg || 0) === 0;
        const q = window.getJobOrderQty(j);
        const ngTitle = `NG หน้าเครื่อง ${q.ngMachine.toLocaleString()} ชิ้น`
            + ` · NG หลังคัด ${q.ngFromSort.toLocaleString()} ชิ้น (คนละก้อน ไม่ทับกัน)`;
        const pendingTitle = `รอคัด ${q.pending.toLocaleString()} ชิ้น · คัดแล้วรอ QC ${q.waitQc.toLocaleString()} ชิ้น`
            + ` — พบระหว่างผลิต ${q.openFromLine.toLocaleString()} (ยอดใหม่)`
            + ` · พบที่ FG/RTV ${q.openFromFg.toLocaleString()} (หักออกจาก FG แล้ว)`;
        const accBadge = q.target <= 0
            ? '<span class="text-[10px] text-gray-400">ไม่ได้ตั้งเป้า</span>'
            : (q.complete
                ? '<span class="text-[10px] font-bold text-green-600">ครบยอด ✓</span>'
                : `<span class="text-[10px] font-bold text-red-500">ขาด ${q.shortage.toLocaleString()}</span>`);

        return `
        <tr class="hover:bg-indigo-50/40">
            <td class="px-3 py-2 font-bold text-indigo-700 whitespace-nowrap">${j.jobOrder}</td>
            <td class="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">${j.planDate || '-'}
                <div class="text-[10px] text-gray-400">กะ ${j.shift || 'All'}</div>
            </td>
            <td class="px-3 py-2 text-sm text-gray-800">${j.product || '-'}</td>
            <td class="px-3 py-2 text-right font-bold text-gray-700">${(j.targetQty || 0).toLocaleString()}</td>
            <td class="px-3 py-2 text-right font-bold text-green-700" title="บันทึกไว้ ${q.fgBooked.toLocaleString()} ชิ้น${q.openFromFg ? ` · หักที่ส่งคัด (พบที่ FG/RTV) ${q.openFromFg.toLocaleString()} ชิ้น` : ''}">${q.fg.toLocaleString()}
                ${q.fgFromSort ? `<div class="text-[10px] font-normal text-gray-400">รวมคัดกลับ ${q.fgFromSort.toLocaleString()}</div>` : ''}
                ${q.openFromFg ? `<div class="text-[10px] font-normal text-amber-600">หักส่งคัด -${q.openFromFg.toLocaleString()}</div>` : ''}
            </td>
            <td class="px-3 py-2 text-right font-bold ${q.ngNet > 0 ? 'text-red-600' : 'text-gray-400'}" title="${ngTitle}">${q.ngNet.toLocaleString()}</td>
            <td class="px-3 py-2 text-right font-bold ${q.sortingOpen > 0 ? 'text-amber-600' : 'text-gray-400'}" title="${pendingTitle}">${q.sortingOpen.toLocaleString()}
                ${q.waitQc ? `<div class="text-[10px] font-normal text-gray-400">รอ QC ${q.waitQc.toLocaleString()}</div>` : ''}
            </td>
            <td class="px-3 py-2 text-right font-bold text-indigo-700" title="FG + NG + รอ Sorting = ยอดที่ออกจากเครื่องจริง (สามก้อนไม่ซ้ำกัน)">${q.accounted.toLocaleString()}
                <div class="mt-0.5">${accBadge}</div>
            </td>
            <td class="px-3 py-2 text-right font-bold ${j.remainingQty > 0 ? 'text-amber-700' : 'text-gray-400'}">${(j.remainingQty || 0).toLocaleString()}</td>
            <td class="px-3 py-2 w-32">
                <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div class="${barColor} h-2" style="width:${pct}%"></div>
                </div>
                <div class="text-[10px] text-gray-500 text-center mt-0.5">${(j.progressPct || 0).toFixed(1)}%</div>
            </td>
            <td class="px-3 py-2 text-center">
                <span class="inline-block px-2 py-0.5 rounded-full border text-[11px] font-bold ${statusCls}">${statusText}</span>
            </td>
            <td class="px-3 py-2 text-center whitespace-nowrap">
                <button type="button" onclick="window.editJobOrder('${j.jobOrder}')" class="text-blue-600 hover:text-blue-800 px-1" title="แก้ไข">✏️</button>
                ${(j.status === 'Closed' || j.status === 'Cancelled')
                    ? `<button type="button" onclick="window.setJobOrderStatus('${j.jobOrder}','Open')" class="text-green-600 hover:text-green-800 px-1" title="เปิดงานใหม่">↩️</button>`
                    : `<button type="button" onclick="window.setJobOrderStatus('${j.jobOrder}','Closed')" class="text-slate-600 hover:text-slate-800 px-1" title="ปิดงาน">✅</button>
                       <button type="button" onclick="window.setJobOrderStatus('${j.jobOrder}','Cancelled')" class="text-red-500 hover:text-red-700 px-1" title="ยกเลิก">🚫</button>`}
                ${canDelete ? `<button type="button" onclick="window.deleteJobOrder('${j.jobOrder}')" class="text-gray-400 hover:text-red-600 px-1" title="ลบ">🗑️</button>` : ''}
            </td>
        </tr>`;
    }).join('');
};

// -------------------- บันทึก / แก้ไข --------------------
window.postPlanAction = async function(payload) {
    try {
        const res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
        return await res.json();
    } catch (e) {
        // บาง environment อ่าน response ไม่ได้ (CORS) → ยิงซ้ำแบบ no-cors แล้วถือว่าสำเร็จ
        try {
            await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
            return { status: 'success', message: 'sent' };
        } catch (err) {
            return { status: 'error', message: err.message };
        }
    }
};

window.editJobOrder = function(no) {
    const j = window.getJobOrderByNo(no);
    if (!j) return;
    window.editingJobOrder = no;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('planJobOrder', j.jobOrder);
    set('planDate', j.planDate);
    set('planProduct', j.product);
    set('planQty', j.targetQty);
    set('planShift', j.shift || 'All');

    const jobInput = document.getElementById('planJobOrder');
    if (jobInput) jobInput.readOnly = true;

    const btn = document.getElementById('planSubmitBtn');
    if (btn) btn.innerText = '💾 บันทึกการแก้ไข Job Order';
    const cancelBtn = document.getElementById('planCancelEditBtn');
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    document.getElementById('planningForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.cancelEditJobOrder = function() {
    window.editingJobOrder = null;
    const form = document.getElementById('planningForm');
    if (form) form.reset();
    const jobInput = document.getElementById('planJobOrder');
    if (jobInput) { jobInput.readOnly = false; jobInput.value = ''; }
    const el = document.getElementById('planDate');
    if (el && typeof getShiftDateStr === 'function') el.value = getShiftDateStr();
    const btn = document.getElementById('planSubmitBtn');
    if (btn) btn.innerText = '💾 บันทึกแผน / สร้าง Job Order';
    const cancelBtn = document.getElementById('planCancelEditBtn');
    if (cancelBtn) cancelBtn.classList.add('hidden');
};

window.setJobOrderStatus = async function(no, status) {
    const label = JOB_ORDER_STATUS_LABEL[status] || status;
    if (!confirm(`ยืนยันเปลี่ยนสถานะ ${no} เป็น "${label}" ?`)) return;
    const result = await window.postPlanAction({ action: 'UPDATE_PLAN', jobOrder: no, status: status });
    if (result.status === 'error') { alert('❌ ' + result.message); return; }
    if (typeof systemLog === 'function') systemLog('UPDATE_PLAN', `เปลี่ยนสถานะ ${no} → ${status}`);
    await window.loadJobOrders(true);
};

window.deleteJobOrder = async function(no) {
    if (!confirm(`ยืนยันลบ Job Order ${no} ?\n(ลบได้เฉพาะงานที่ยังไม่มีการบันทึกผลิต)`)) return;
    const result = await window.postPlanAction({ action: 'DELETE_PLAN', jobOrder: no });
    if (result.status === 'error') { alert('❌ ' + result.message); return; }
    if (typeof systemLog === 'function') systemLog('DELETE_PLAN', `ลบแผน ${no}`);
    await window.loadJobOrders(true);
};

// -------------------- การ์ด Job Order บนหน้า Dashboard --------------------
// เรียกจาก loadDashboard() หลังได้ข้อมูลแล้ว (ใช้ data.jobOrders + data.jobOrderData จาก backend)
window.renderJobOrderDashCard = function(data) {
    const box = document.getElementById('jobOrderDashList');
    if (!box) return;

    const jobs = (data && data.jobOrders ? data.jobOrders : []).filter(j => j.status !== 'Cancelled');
    const actual = (data && data.jobOrderData) ? data.jobOrderData : {};
    const sortActual = (data && data.jobOrderSortData) ? data.jobOrderSortData : {};

    if (jobs.length === 0) {
        box.innerHTML = `<div class="text-center text-gray-400 text-sm py-10">ไม่มี Job Order ในช่วงวันที่เลือก</div>`;
        return;
    }

    const sorted = jobs.slice().sort((a, b) => {
        const da = a.planDate || '9999-12-31';
        const db = b.planDate || '9999-12-31';
        return da < db ? -1 : (da > db ? 1 : 0);
    });

    box.innerHTML = sorted.map(j => {
        const pct = Math.min(100, j.progressPct || 0);
        const barColor = pct >= 100 ? 'bg-green-500' : (pct >= 50 ? 'bg-blue-500' : 'bg-amber-500');
        const inRange = actual[j.jobOrder] || { fg: 0 };
        const inRangeSort = sortActual[j.jobOrder] || null;
        const q = window.getJobOrderQty(j);
        const rangePending = inRangeSort ? ((inRangeSort.pendingPcs || 0) + (inRangeSort.waitQcPcs || 0)) : 0;
        const accBadge = q.target <= 0
            ? ''
            : (q.complete
                ? `<span class="text-green-600 font-bold">ครบยอด ✓</span>`
                : `<span class="text-red-500 font-bold">ขาด ${q.shortage.toLocaleString()}</span>`);
        return `
        <div class="py-2 border-b border-gray-100 last:border-0">
            <div class="flex justify-between items-center text-xs">
                <span class="font-bold text-indigo-700">${j.jobOrder}</span>
                <span class="text-gray-500">${j.product || '-'}</span>
            </div>
            <div class="flex justify-between items-center text-[11px] text-gray-500 mt-0.5">
                <span>ผลิต ${q.fg.toLocaleString()} / ${q.target.toLocaleString()} ชิ้น${inRange.fg ? ` · ช่วงนี้ ${inRange.fg.toLocaleString()}` : ''}</span>
                <span class="font-bold">${(j.progressPct || 0).toFixed(1)}%</span>
            </div>
            <div class="flex justify-between items-center text-[10px] text-gray-500 mt-0.5 gap-2 flex-wrap"
                 title="รวมนับได้ = FG + NG + รอ Sorting — งานที่พบระหว่างผลิตเป็นยอดใหม่ ส่วนที่พบที่ FG/RTV ถูกหักออกจาก FG แล้ว จึงไม่ซ้ำกัน">
                <span>
                    <span class="text-red-500">NG ${q.ngNet.toLocaleString()}</span>
                    · <span class="text-amber-600">รอ Sorting ${q.sortingOpen.toLocaleString()}</span>${rangePending ? ` (ช่วงนี้ ${rangePending.toLocaleString()})` : ''}
                </span>
                <span>รวมนับได้ <span class="font-bold text-indigo-700">${q.accounted.toLocaleString()}</span>${q.target ? ` / ${q.target.toLocaleString()}` : ''} ${accBadge}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-1.5 mt-1 overflow-hidden">
                <div class="${barColor} h-1.5" style="width:${pct}%"></div>
            </div>
        </div>`;
    }).join('');

    // งาน Sorting ที่ยังไม่ผูกเลข Job Order — แจ้งไว้ให้รู้ว่ายอดยังไม่ถูกนับเข้าจ๊อบไหน
    const noJo = sortActual['__NO_JO__'];
    const noJoPcs = noJo ? ((noJo.pendingPcs || 0) + (noJo.waitQcPcs || 0)) : 0;
    if (noJoPcs > 0) {
        box.innerHTML += `<div class="mt-2 pt-2 border-t border-dashed border-amber-200 text-[10px] text-amber-700">`
            + `⚠️ งาน Sorting ที่ยังไม่ผูกเลข Job Order ${noJoPcs.toLocaleString()} ชิ้น (ยังไม่ถูกนับเข้าจ๊อบใด)`
            + `</div>`;
    }
};

// -------------------- ผูก event ตอนโหลดหน้า --------------------
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('planningForm');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('planSubmitBtn');
            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = '⏳ กำลังบันทึกแผน...';
            btn.classList.add('opacity-50', 'cursor-not-allowed');

            const val = (id) => (document.getElementById(id)?.value || '').trim();
            const qty = parseInt(val('planQty')) || 0;

            if (!val('planDate') || !val('planProduct') || qty <= 0) {
                alert('⚠️ กรุณาระบุวันที่แผน / รุ่นสินค้า / จำนวนเป้าหมายให้ครบ');
                btn.disabled = false; btn.innerText = originalText;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
                return;
            }

            const isEdit = !!window.editingJobOrder;
            const payload = {
                action: isEdit ? 'UPDATE_PLAN' : 'SAVE_PLAN',
                jobOrder: isEdit ? window.editingJobOrder : val('planJobOrder'),
                planDate: val('planDate'),
                product: val('planProduct'),
                qty: qty,
                shift: val('planShift') || 'All',
                recorder: (window.currentUser && window.currentUser.username) || ''
            };

            const result = await window.postPlanAction(payload);
            if (result.status === 'error') {
                alert('❌ ' + result.message);
            } else {
                if (typeof systemLog === 'function') {
                    systemLog(isEdit ? 'UPDATE_PLAN' : 'SAVE_PLAN',
                        `${isEdit ? 'แก้ไข' : 'บันทึก'}แผนการผลิต ${result.jobOrder || payload.jobOrder || ''} ${payload.product} จำนวน ${qty} ชิ้น`);
                }
                alert(`✅ ${isEdit ? 'แก้ไขแผนสำเร็จ' : 'บันทึกแผนสำเร็จ'}${result.jobOrder ? '\nเลข Job Order: ' + result.jobOrder : ''}`);
                window.cancelEditJobOrder();
                await window.loadJobOrders(true);
            }

            btn.disabled = false;
            btn.innerText = window.editingJobOrder ? '💾 บันทึกการแก้ไข Job Order' : '💾 บันทึกแผน / สร้าง Job Order';
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        };
    }

    document.getElementById('joFilterStatus')?.addEventListener('change', window.renderJobOrderTable);
    document.getElementById('joFilterKeyword')?.addEventListener('input', window.renderJobOrderTable);
    document.getElementById('joRefreshBtn')?.addEventListener('click', () => window.loadJobOrders());
});
