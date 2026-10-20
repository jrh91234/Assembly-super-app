// === 📬 Inbox — Email-client style task center ===
let inboxData = null;
let inboxActiveCategory = 'all';

// === 🔄 PM หมุนเวียนกะ A/B — งานชื่อเดียวกันทุกเครื่องอยู่กะเดียวกัน ทำครบทุกเครื่องแล้วรอบหน้าส่งต่ออีกกะ ===
const PM_SHIFT_LIST = ['A', 'B'];
let inboxPmShiftFilter = '';
try { inboxPmShiftFilter = localStorage.getItem('pmInboxShiftFilter') || ''; } catch (e) { /* ใช้ค่าเริ่มต้น */ }

function pmShiftBadge(shift, prefix) {
    if (!shift) return '';
    const cls = shift === 'A' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-800';
    return `<span class="${cls} text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap">${prefix || ''}กะ ${shift}</span>`;
}

function pmDoneByText(l) {
    return (l.doneBy || '-') + (l.doneShift ? ` (กะ ${l.doneShift})` : '');
}

function pmIsCover(l) {
    return !!(l.doneShift && l.assignedShift && l.doneShift !== l.assignedShift);
}

function pmShiftStorageKey() {
    const u = window.currentUser || {};
    return 'pmShift_' + (u.username || u.name || 'user');
}

function getSavedPmShift() {
    try { return localStorage.getItem(pmShiftStorageKey()) || ''; } catch (e) { return ''; }
}

function savePmShift(shift) {
    try { localStorage.setItem(pmShiftStorageKey(), shift); } catch (e) { /* ไม่บังคับ */ }
}

window.setInboxPmShiftFilter = function(shift) {
    inboxPmShiftFilter = shift;
    try { localStorage.setItem('pmInboxShiftFilter', shift); } catch (e) { /* ไม่บังคับ */ }
    renderInboxList('pmTasks');
};

function renderPmShiftFilterBar(tasks) {
    const opts = [{ key: '', label: 'ทุกกะ', count: tasks.length }]
        .concat(PM_SHIFT_LIST.map(s => ({ key: s, label: `กะ ${s}`, count: tasks.filter(t => t.assignedShift === s).length })));
    return `<div class="flex flex-wrap items-center gap-2 mb-3">
        <span class="text-xs font-bold text-gray-500">🔄 งานของกะ:</span>
        ${opts.map(o => `<button onclick="window.setInboxPmShiftFilter('${o.key}')" class="text-xs font-bold px-3 py-1 rounded-full border ${inboxPmShiftFilter === o.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}">${o.label} (${o.count})</button>`).join('')}
    </div>`;
}

window.inboxCloseJob = function(jobId) {
    const job = inboxData && inboxData.categories.maintenance.find(m => m.jobId === jobId);
    if (!job) { alert('ไม่พบข้อมูลงาน ' + jobId); return; }
    if (typeof window.openMaintenanceModal === 'function') window.openMaintenanceModal();
    if (typeof window.loadPendingJob === 'function') window.loadPendingJob(job);
};

window.loadInbox = async function() {
    const container = document.getElementById('inbox-content');
    const sidebar = document.getElementById('inbox-sidebar');
    if (!container) return;

    const user = window.currentUser;
    if (!user) {
        container.innerHTML = '<div class="flex items-center justify-center h-64 text-gray-400">กรุณา Login ก่อนใช้งาน Inbox</div>';
        return;
    }

    container.innerHTML = '<div class="flex items-center justify-center h-64 text-gray-400 animate-pulse">⏳ กำลังโหลดข้อมูล...</div>';

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'GET_INBOX', role: user.role, userName: user.name })
        });
        inboxData = await res.json();
        if (inboxData.status !== 'success') throw new Error(inboxData.message || 'Unknown error');
        renderInboxSidebar();
        renderInboxList('all');
        updateInboxBadge(inboxData.counts.total);
    } catch (err) {
        container.innerHTML = `<div class="flex items-center justify-center h-64 text-red-500">❌ โหลดไม่สำเร็จ: ${err.message}</div>`;
    }
};

function updateInboxBadge(count) {
    const badge = document.getElementById('inbox-badge');
    const badgeMobile = document.getElementById('inbox-badge-mobile');
    [badge, badgeMobile].forEach(b => {
        if (!b) return;
        if (count > 0) {
            b.innerText = count > 99 ? '99+' : count;
            b.classList.remove('hidden');
        } else {
            b.classList.add('hidden');
        }
    });
}

function renderInboxSidebar() {
    const sidebar = document.getElementById('inbox-sidebar');
    if (!sidebar || !inboxData) return;
    const c = inboxData.counts;
    const role = (window.currentUser && window.currentUser.role) || '';

    const cats = [
        { key: 'all', icon: '📥', label: 'ทั้งหมด', count: c.total, color: 'blue' },
        { key: 'maintenance', icon: '⚡', label: 'งานซ่อมค้าง', count: c.maintenance, color: 'orange' },
        { key: 'pmTasks', icon: '📋', label: 'แผน PM', count: c.pmTasks, color: 'indigo' },
        { key: 'partsCheck', icon: '🔍', label: 'อะไหล่รอเช็ค', count: c.partsCheck, color: 'amber' },
        { key: 'partsNearEnd', icon: '🔴', label: 'ใกล้หมดอายุ', count: c.partsNearEnd, color: 'red' },
    ];
    if (role === 'QC' || role === 'Admin') {
        cats.push({ key: 'sortingWaitQC', icon: '🗂️', label: 'Sort รอ QC', count: c.sortingWaitQC, color: 'pink' });
    }

    sidebar.innerHTML = cats.map(cat => {
        const active = inboxActiveCategory === cat.key;
        const bg = active ? `bg-${cat.color}-50 border-${cat.color}-500 text-${cat.color}-800` : 'border-transparent text-gray-600 hover:bg-gray-50';
        return `<button onclick="window.filterInbox('${cat.key}')" class="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium border-l-4 ${bg} transition-all rounded-r-lg">
            <span class="flex items-center gap-2">${cat.icon} ${cat.label}</span>
            ${cat.count > 0 ? `<span class="bg-${cat.color}-100 text-${cat.color}-700 text-xs font-bold px-2 py-0.5 rounded-full min-w-[24px] text-center">${cat.count}</span>` : ''}
        </button>`;
    }).join('');

    sidebar.innerHTML += `<div class="border-t mt-3 pt-3 space-y-2">
        <button onclick="window.showPmGantt()" class="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all">
            📊 Gantt Chart PM
        </button>
        <button onclick="window.showPmHistory()" class="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-all">
            🗂️ ประวัติ PM ที่ทำแล้ว
        </button>
    </div>`;
}

window.filterInbox = function(category) {
    inboxActiveCategory = category;
    renderInboxSidebar();
    renderInboxList(category);
};

function renderInboxList(category) {
    const container = document.getElementById('inbox-content');
    if (!container || !inboxData) return;
    const cats = inboxData.categories;
    let items = [];

    if (category === 'all') {
        cats.maintenance.forEach(m => items.push({ type: 'maintenance', data: m, priority: m.daysAgo >= 3 ? 1 : 2 }));
        (cats.pmTasks || []).forEach(p => items.push({ type: 'pmTasks', data: p, priority: p.daysOverdue >= 3 ? 1 : 2 }));
        cats.partsCheck.forEach(p => items.push({ type: 'partsCheck', data: p, priority: 1 }));
        cats.partsNearEnd.forEach(p => items.push({ type: 'partsNearEnd', data: p, priority: p.pct >= 95 ? 1 : 3 }));
        cats.sortingWaitQC.forEach(s => items.push({ type: 'sortingWaitQC', data: s, priority: 2 }));
        items.sort((a, b) => a.priority - b.priority);
    } else if (cats[category]) {
        cats[category].forEach(d => items.push({ type: category, data: d }));
    }

    let headerHtml = '';
    if (category === 'pmTasks') {
        headerHtml = renderPmShiftFilterBar(cats.pmTasks || []);
        if (inboxPmShiftFilter) items = items.filter(it => it.data.assignedShift === inboxPmShiftFilter);
    }

    if (items.length === 0) {
        container.innerHTML = headerHtml + `<div class="flex flex-col items-center justify-center h-64 text-gray-400">
            <div class="text-5xl mb-3">✅</div>
            <div class="text-lg font-bold">ไม่มีรายการค้าง</div>
            <div class="text-sm">หมวดนี้ว่างเปล่า — ทุกอย่างเรียบร้อย</div>
        </div>`;
        return;
    }

    container.innerHTML = headerHtml + items.map((item, idx) => renderInboxItem(item, idx)).join('');
}

function renderInboxItem(item, idx) {
    const d = item.data;
    switch (item.type) {
        case 'maintenance': return renderMaintenanceItem(d, idx);
        case 'pmTasks': return renderPmTaskItem(d, idx);
        case 'partsCheck': return renderPartsCheckItem(d, idx);
        case 'partsNearEnd': return renderPartsNearEndItem(d, idx);
        case 'sortingWaitQC': return renderSortingItem(d, idx);
        default: return '';
    }
}

function renderMaintenanceItem(d) {
    const urgency = d.daysAgo >= 3 ? 'border-l-red-500 bg-red-50/30' : d.daysAgo >= 1 ? 'border-l-orange-500' : 'border-l-yellow-400';
    const daysLabel = d.daysAgo === 0 ? 'วันนี้' : `ค้าง ${d.daysAgo} วัน`;
    return `<div class="border-l-4 ${urgency} bg-white rounded-r-lg shadow-sm p-4 mb-2 hover:shadow-md transition-shadow">
        <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-lg">⚡</span>
                    <span class="font-bold text-gray-800 text-sm">${d.jobId}</span>
                    <span class="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-mono">${d.machine}</span>
                    <span class="text-[10px] ${d.daysAgo >= 3 ? 'text-red-600 font-bold' : 'text-orange-600'}">${daysLabel}</span>
                </div>
                <div class="text-sm text-gray-700 font-medium">${d.issueType}</div>
                <div class="text-xs text-gray-500 mt-1 truncate">${d.remark || '-'}</div>
                <div class="text-[10px] text-gray-400 mt-1">แจ้งโดย: ${d.recorder} · ${d.date} ${d.startTime}</div>
            </div>
            <div class="flex flex-col gap-1 ml-3 shrink-0">
                <button onclick="window.inboxCloseJob('${d.jobId}')" class="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 font-bold">✅ ปิดงาน</button>
            </div>
        </div>
    </div>`;
}

function renderPartsCheckItem(d) {
    const escName = (d.partName || '').replace(/'/g, "\\'");
    const hasLastCheck = !!d.lastCheckDate;
    const checkShots = Number(d.shotsSinceLastCheck !== undefined ? d.shotsSinceLastCheck : d.actualShots);
    const checkThreshold = Number(d.checkThresholdShots !== undefined ? d.checkThresholdShots : d.nextCheckShot);
    const reasonBadge = d.checkReason === 'overdue_life'
        ? `<span class="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-bold" title="ใช้งานเกินอายุที่คำนวณได้แล้ว (${d.pct}%) จึงเข้าคิวตรวจเช็คทันที แม้ยังไม่ถึง Next Check ที่ตั้งไว้">🔴 เกินอายุใช้งาน (${d.pct}%)</span>`
        : `<span class="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold" title="ใช้งานถึงรอบ Next Check ที่ตั้งไว้แล้ว">🟡 ถึงรอบตรวจตามกำหนด</span>`;
    return `<div class="border-l-4 border-l-amber-500 bg-white rounded-r-lg shadow-sm p-4 mb-2 hover:shadow-md transition-shadow">
        <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1 flex-wrap">
                    <span class="text-lg">🔍</span>
                    <span class="font-bold text-gray-800 text-sm">${d.partName}</span>
                    <span class="text-[10px] text-gray-400 font-mono">(${d.partId})</span>
                    <span class="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-mono">${d.machine}</span>
                    ${reasonBadge}
                </div>
                <div class="text-xs text-gray-600">${hasLastCheck ? `Shot หลังตรวจ ${checkShots.toLocaleString()} / รอบถัดไป ${checkThreshold.toLocaleString()} shot (เริ่มนับหลัง ${d.lastCheckDate})` : `Actual: <b class="text-amber-700">${Number(d.actualShots).toLocaleString()}</b> / Next Check: <b>${Number(d.nextCheckShot).toLocaleString()}</b> shot`}</div>
                <div class="text-xs text-gray-500 mt-0.5">Life: ${d.lifeShots > 0 ? Number(d.lifeShots).toLocaleString() : '∞'} · ตรวจแล้ว ${d.checkCount} ครั้ง</div>
            </div>
            <div class="flex flex-col gap-1 ml-3 shrink-0">
                <button onclick="window.openCheckPartDialog('${d.installId}', '${d.partId}', '${escName}', '${d.machine}', ${d.actualShots}, ${d.lifeShots}, ${d.nextCheckShot}, ${d.checkIntervalShots || 0})" class="text-xs bg-amber-600 text-white px-3 py-1 rounded hover:bg-amber-700 font-bold">🔍 ตรวจเช็ค</button>
                <button onclick="window.showCheckHistory('${d.installId}', '${escName}', '${d.partId}')" class="text-xs text-gray-500 hover:underline">📋 ประวัติ</button>
            </div>
        </div>
    </div>`;
}

function renderPartsNearEndItem(d) {
    const isOverLife = d.pct >= 100;
    const isOver95 = d.pct >= 95;
    const borderColor = isOver95 ? 'border-l-red-600' : 'border-l-red-400';
    const pctColor = isOver95 ? 'text-red-700 font-black' : 'text-red-600 font-bold';
    const escName = (d.partName || '').replace(/'/g, "\\'");
    return `<div class="border-l-4 ${borderColor} bg-white rounded-r-lg shadow-sm p-4 mb-2 hover:shadow-md transition-shadow ${isOver95 ? 'bg-red-50/40' : ''}">
        <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-lg">${isOver95 ? '🔴' : '🟡'}</span>
                    <span class="font-bold text-gray-800 text-sm">${d.partName}</span>
                    <span class="text-[10px] text-gray-400 font-mono">(${d.partId})</span>
                    <span class="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-mono">${d.machine}</span>
                </div>
                <div class="text-xs text-gray-600">Actual: <b class="${pctColor}">${Number(d.actualShots).toLocaleString()}</b> / Life: <b>${Number(d.effectiveLife || d.lifeShots).toLocaleString()}</b> shot${d.checkCount > 0 ? ` <span class="text-green-600">(ตรวจผ่าน ${d.checkCount} ครั้ง)</span>` : ''}</div>
                <div class="mt-1 w-full bg-gray-200 rounded-full h-2">
                    <div class="h-2 rounded-full ${isOver95 ? 'bg-red-600' : 'bg-yellow-500'}" style="width: ${Math.min(d.pct, 100)}%"></div>
                </div>
                <div class="text-[10px] ${pctColor} mt-0.5">${isOverLife ? `🔴 เกินอายุใช้งาน (${d.pct}%) — ควรเปลี่ยน` : `${d.pct}% ของอายุใช้งาน`}</div>
            </div>
            <div class="flex flex-col gap-1 ml-3 shrink-0">
                <button title="${isOverLife ? 'เปลี่ยนอะไหล่ที่เกินอายุ' : 'เปลี่ยนอะไหล่'}" onclick="window.promptReplacepart('${d.installId}', '${d.machine}', '${d.partId}', '${escName}', ${d.lifeShots})" class="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 font-bold">🔄 เปลี่ยน</button>
            </div>
        </div>
    </div>`;
}

function renderSortingItem(d) {
    return `<div class="border-l-4 border-l-pink-500 bg-white rounded-r-lg shadow-sm p-4 mb-2 hover:shadow-md transition-shadow">
        <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-lg">🗂️</span>
                    <span class="font-bold text-gray-800 text-sm">${d.jobId}</span>
                    <span class="bg-pink-100 text-pink-700 text-[10px] px-2 py-0.5 rounded-full">${d.product}</span>
                </div>
                <div class="text-xs text-gray-600">อาการ: <b>${d.symptom}</b> · จำนวน: ${d.qty}</div>
                <div class="text-xs text-gray-500 mt-0.5">ผู้คัด: ${d.sorter || '-'} · FG: ${d.fgQty || '-'} / NG: ${d.ngQty || '-'}</div>
            </div>
            <div class="flex flex-col gap-1 ml-3 shrink-0">
                <span class="text-xs bg-pink-100 text-pink-700 px-3 py-1 rounded font-bold text-center">⏳ รอ QC</span>
            </div>
        </div>
    </div>`;
}

function renderPmTaskItem(d) {
    const urgency = d.daysOverdue >= 3 ? 'border-l-red-500 bg-red-50/30' : d.daysOverdue >= 1 ? 'border-l-indigo-500' : 'border-l-indigo-400';
    const daysLabel = d.daysOverdue === 0 ? 'ถึงกำหนดวันนี้' : `เกินกำหนด ${d.daysOverdue} วัน`;
    const photoUrls = (Array.isArray(d.photoUrls) && d.photoUrls.length ? d.photoUrls : (d.photoUrl ? [d.photoUrl] : [])).filter(Boolean);
    const thumbs = photoUrls
        .map(u => ({ url: u, thumb: typeof getThumbUrl === 'function' ? getThumbUrl(u) : null }))
        .filter(t => t.thumb);
    const photoHtml = thumbs.length
        ? `<div class="flex flex-wrap gap-1 shrink-0 max-w-[7.5rem] justify-end">${thumbs.map((t, i) => `
            <img src="${t.thumb}" onclick="window.open('${t.url}', '_blank')" onerror="this.style.display='none'" class="w-14 h-14 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity" title="แนบรูปอ้างอิง ${i + 1}/${thumbs.length} คลิกเพื่อดูขนาดเต็ม">`).join('')}</div>`
        : '';
    return `<div class="border-l-4 ${urgency} bg-white rounded-r-lg shadow-sm p-4 mb-2 hover:shadow-md transition-shadow">
        <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-lg">📋</span>
                    <span class="font-bold text-gray-800 text-sm">${d.taskName}</span>
                    <span class="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full">${d.planType}</span>
                    <span class="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-mono">${d.machine}</span>
                    ${pmShiftBadge(d.assignedShift, '🔄 ')}
                </div>
                <div class="text-xs text-gray-600">กำหนด: <b>${d.dueDate}</b> · <span class="${d.daysOverdue >= 3 ? 'text-red-600 font-bold' : 'text-indigo-600'}">${daysLabel}</span></div>
                <div class="text-[10px] text-gray-400 mt-1">ความถี่: ${d.frequency} · ${d.planId}${d.note ? ' · ' + d.note : ''}</div>
                ${d.instruction ? `<div class="text-xs text-gray-600 bg-gray-50 p-2 rounded mt-2 whitespace-pre-line">📝 ${d.instruction}</div>` : ''}
            </div>
            ${photoHtml}
            <div class="flex flex-col gap-1 ml-1 shrink-0">
                <button onclick="window.openPmCompleteModal('${d.planId}')" class="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 font-bold">📸 ทำเสร็จ</button>
            </div>
        </div>
    </div>`;
}

window.openPmCompleteModal = function(planId) {
    const task = inboxData && inboxData.categories.pmTasks.find(t => t.planId === planId);
    if (!task) { alert('ไม่พบแผน ' + planId); return; }
    const refPhotos = Array.isArray(task.photoUrls) && task.photoUrls.length
        ? task.photoUrls
        : (task.photoUrl ? [task.photoUrl] : []);
    const refPhotoHtml = refPhotos.length
        ? `<div class="mt-2 flex flex-wrap gap-2">${refPhotos.map((u, i) => `<a href="${u}" target="_blank" class="text-xs font-bold text-indigo-700 underline">📸 ดูรูปอ้างอิงวิธีทำ${refPhotos.length > 1 ? ' ' + (i + 1) : ''}</a>`).join('')}</div>`
        : '';
    const savedShift = getSavedPmShift();
    // มือถือ: ใช้ flex column + body เลื่อนได้ เพื่อไม่ให้ปุ่มยืนยัน/ยกเลิกตกขอบจอเมื่อเนื้อหายาว
    const html = `<div id="modal-pm-complete" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-3 sm:p-4">
        <div class="bg-white w-full max-w-sm rounded-xl shadow-2xl flex flex-col overflow-hidden" style="max-height: 90vh; max-height: 90dvh;">
            <div class="px-5 pt-5 pb-3 flex-none">
                <h3 class="text-lg font-bold">📸 ยืนยันทำเสร็จ</h3>
            </div>
            <div class="px-5 flex-1 overflow-y-auto overscroll-contain">
                <div class="bg-indigo-50 p-3 rounded-lg mb-3 text-sm">
                    <div class="font-bold text-indigo-800">${task.taskName}</div>
                    <div class="text-indigo-600 text-xs">${task.machine} · ${task.planType} · กำหนด ${task.dueDate}</div>
                    ${task.instruction ? `<div class="text-gray-700 text-xs mt-2 whitespace-pre-line">📝 ${task.instruction}</div>` : ''}
                    ${refPhotoHtml}
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gray-700 mb-1">👷 กะที่ทำ (บังคับ)</label>
                    <div class="grid grid-cols-2 gap-2">${PM_SHIFT_LIST.map(s => `
                        <label class="cursor-pointer">
                            <input type="radio" name="pm-shift" value="${s}" class="peer sr-only" ${savedShift === s ? 'checked' : ''} onchange="window.updatePmShiftHint()">
                            <div class="text-center py-2 rounded-lg border-2 border-gray-200 font-bold text-sm text-gray-500 peer-checked:border-indigo-600 peer-checked:bg-indigo-50 peer-checked:text-indigo-700">กะ ${s}</div>
                        </label>`).join('')}
                    </div>
                    <div id="pm-shift-hint" data-assigned="${task.assignedShift || ''}" class="text-[11px] mt-1 text-gray-500"></div>
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gray-700 mb-1">📸 แนบรูปถ่าย (บังคับ)</label>
                    <input type="file" id="pm-photo" accept="image/*" required class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer">
                    <div id="pm-photo-preview" class="mt-2 hidden rounded-lg overflow-hidden border"><img id="pm-photo-img" src="" class="w-full max-h-40 object-contain bg-black"></div>
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gray-700 mb-1">หมายเหตุ</label>
                    <textarea id="pm-note" rows="2" class="w-full p-2 border rounded-lg text-sm" placeholder="รายละเอียดเพิ่มเติม..."></textarea>
                </div>
            </div>
            <div class="px-5 py-3 border-t bg-white flex-none flex gap-2">
                <button onclick="document.getElementById('modal-pm-complete').remove()" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-xl font-bold hover:bg-gray-300">ยกเลิก</button>
                <button onclick="window.submitPmComplete('${planId}')" id="btn-pm-submit" class="flex-1 bg-indigo-600 text-white py-2 rounded-xl font-bold hover:bg-indigo-700">📸 ยืนยัน</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    window.updatePmShiftHint();
    document.getElementById('pm-photo').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            document.getElementById('pm-photo-img').src = ev.target.result;
            document.getElementById('pm-photo-preview').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    });
};

window.updatePmShiftHint = function() {
    const hint = document.getElementById('pm-shift-hint');
    if (!hint) return;
    const assigned = hint.dataset.assigned;
    const picked = document.querySelector('input[name="pm-shift"]:checked')?.value || '';
    const parts = [];
    if (assigned) parts.push(`งานนี้ทั้งรอบเป็นของ <b>กะ ${assigned}</b>`);
    if (picked) {
        if (assigned && picked !== assigned) parts.push(`<span class="text-orange-600 font-bold">⚠️ กะ ${picked} ทำแทน</span>`);
        const owner = assigned || picked;
        parts.push(`ทำครบทุกเครื่องแล้ว รอบถัดไปเป็นของ <b>กะ ${owner === 'A' ? 'B' : 'A'}</b>`);
    } else {
        parts.push('<span class="text-red-500">กรุณาเลือกกะที่ทำ</span>');
    }
    hint.innerHTML = '🔄 ' + parts.join(' · ');
};

window.submitPmComplete = async function(planId) {
    const shift = document.querySelector('input[name="pm-shift"]:checked')?.value || '';
    if (!shift) { alert('กรุณาเลือกกะที่ทำงานนี้'); return; }
    const photoInput = document.getElementById('pm-photo');
    if (!photoInput || !photoInput.files[0]) { alert('กรุณาแนบรูปถ่าย'); return; }
    const btn = document.getElementById('btn-pm-submit');
    btn.disabled = true; btn.innerHTML = '⏳ กำลังบันทึก...';

    let imageBase64 = '';
    try {
        // ส่งเป็น data URL เต็ม (backend ต้องการ prefix "data:image/...;base64,") + บีบอัดให้ไฟล์เล็กลงสำหรับมือถือ
        imageBase64 = await compressPmImage(photoInput.files[0], 256);
    } catch (e) { alert('อ่านรูปไม่ได้'); btn.disabled = false; btn.innerHTML = '📸 ยืนยัน'; return; }

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'COMPLETE_PM_TASK',
                planId: planId,
                username: window.currentUser?.name || window.currentUser?.username || 'Unknown',
                role: window.currentUser?.role || '',
                note: document.getElementById('pm-note').value,
                shift: shift,
                imageBase64: imageBase64
            })
        });
        const result = await res.json();
        if (result.status === 'success') {
            savePmShift(shift);
            alert(result.message);
            document.getElementById('modal-pm-complete')?.remove();
            window.loadInbox();
        } else {
            alert('Error: ' + result.message);
            btn.disabled = false; btn.innerHTML = '📸 ยืนยัน';
        }
    } catch (e) { alert('บันทึกไม่สำเร็จ: ' + e.message); btn.disabled = false; btn.innerHTML = '📸 ยืนยัน'; }
};

function escapePmAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.deletePmPlan = async function(btn) {
    const planId = btn.dataset.planId;
    const taskName = btn.dataset.taskName;
    const machine = btn.dataset.machine;
    if (!planId) return;
    if (!confirm(`ยืนยันลบแผน PM นี้?\n\n${taskName} (${machine})\n\nการลบนี้ไม่สามารถย้อนกลับได้`)) return;

    btn.disabled = true;
    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'DELETE_PM_PLAN',
                planId,
                username: window.currentUser?.username || window.currentUser?.name || '',
                role: window.currentUser?.role || ''
            })
        });
        const result = await res.json();
        if (result.status !== 'success') throw new Error(result.message || 'ลบไม่สำเร็จ');
        window.showPmGantt();
    } catch (e) {
        alert('❌ เกิดข้อผิดพลาด: ' + e.message);
        btn.disabled = false;
    }
};

// === เพิ่มแผน PM จากหน้า Gantt Chart ===
window.openAddPmPlanModal = function() {
    const macGrid = document.getElementById('pmplan-machine-grid');
    if (macGrid) {
        let html = '';
        for (let i = 1; i <= 16; i++) {
            const mac = `CWM-${String(i).padStart(2, '0')}`;
            html += `<label class="flex items-center gap-1 text-xs font-medium text-gray-700 cursor-pointer">
                <input type="checkbox" value="${mac}" class="pmplan-machine-cb accent-indigo-600"> ${mac}
            </label>`;
        }
        macGrid.innerHTML = html;
    }
    const dueInput = document.getElementById('pmplan-nextdue');
    if (dueInput) dueInput.value = getShiftDateStr();
    const taskInput = document.getElementById('pmplan-taskname');
    if (taskInput) taskInput.value = '';
    const assignedInput = document.getElementById('pmplan-assignedto');
    if (assignedInput) assignedInput.value = '';
    const noteInput = document.getElementById('pmplan-note');
    if (noteInput) noteInput.value = '';
    const instructionInput = document.getElementById('pmplan-instruction');
    if (instructionInput) instructionInput.value = '';
    const startShiftInput = document.getElementById('pmplan-startshift');
    if (startShiftInput) startShiftInput.value = '';
    const intervalInput = document.getElementById('pmplan-interval');
    if (intervalInput) intervalInput.value = '';
    document.getElementById('pmplan-interval-wrap').classList.add('hidden');
    const photoInput = document.getElementById('pmplan-photo');
    if (photoInput) photoInput.value = '';
    pmPlanPhotoFiles = [];
    renderPmPlanPhotoPreview();

    document.getElementById('modal-add-pm-plan').classList.remove('hidden');
};

window.togglePmPlanMachineAll = function() {
    const boxes = document.querySelectorAll('.pmplan-machine-cb');
    const allChecked = Array.from(boxes).every(b => b.checked);
    boxes.forEach(b => b.checked = !allChecked);
};

// === รูปแนบของแผน PM (รองรับหลายรูป) ===
const PM_PLAN_MAX_PHOTOS = 5;
let pmPlanPhotoFiles = [];

function renderPmPlanPhotoPreview() {
    const wrap = document.getElementById('pmplan-photo-preview');
    if (!wrap) return;
    if (pmPlanPhotoFiles.length === 0) {
        wrap.innerHTML = '';
        wrap.classList.add('hidden');
        return;
    }
    wrap.classList.remove('hidden');
    wrap.innerHTML = `<div class="col-span-3 text-[11px] font-bold text-gray-600">แนบแล้ว ${pmPlanPhotoFiles.length}/${PM_PLAN_MAX_PHOTOS} รูป</div>` + pmPlanPhotoFiles.map((f, i) => `
        <div class="relative rounded-lg overflow-hidden border border-gray-200 bg-black">
            <img src="${URL.createObjectURL(f)}" alt="Preview ${i + 1}" class="w-full h-24 object-contain" onload="window.URL.revokeObjectURL(this.src)">
            <button type="button" onclick="window.removePmPlanPhoto(${i})" title="ลบรูปนี้"
                class="absolute top-1 right-1 bg-black/60 text-white w-6 h-6 rounded-full text-xs font-bold leading-none hover:bg-red-600">&times;</button>
            <span class="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 rounded">${i + 1}</span>
        </div>`).join('');
}

window.handlePmPlanPhotoSelect = function(input) {
    const picked = Array.from(input.files || []);
    const room = PM_PLAN_MAX_PHOTOS - pmPlanPhotoFiles.length;
    if (picked.length > room) alert(`แนบรูปได้สูงสุด ${PM_PLAN_MAX_PHOTOS} รูป (เพิ่มได้อีก ${room} รูป)`);
    pmPlanPhotoFiles = pmPlanPhotoFiles.concat(picked.slice(0, Math.max(room, 0)));
    input.value = ''; // เคลียร์เพื่อให้เลือกไฟล์เดิมซ้ำ / เลือกเพิ่มทีละรูปได้
    renderPmPlanPhotoPreview();
};

window.removePmPlanPhoto = function(idx) {
    pmPlanPhotoFiles.splice(idx, 1);
    renderPmPlanPhotoPreview();
};

// บีบอัดรูปภาพให้เล็กกว่า maxSizeKB ก่อนส่งขึ้น backend
function compressPmImage(file, maxSizeKB) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width, height = img.height;
                const MAX_DIMENSION = 1200;
                if (width > height && width > MAX_DIMENSION) { height *= MAX_DIMENSION / width; width = MAX_DIMENSION; }
                else if (height > MAX_DIMENSION) { width *= MAX_DIMENSION / height; height = MAX_DIMENSION; }
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                let quality = 0.8;
                let dataUrl = canvas.toDataURL('image/jpeg', quality);
                while (Math.round((dataUrl.length * 3 / 4) / 1024) > maxSizeKB && quality > 0.1) {
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                }
                resolve(dataUrl);
            };
            img.onerror = reject;
            img.src = event.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

window.submitAddPmPlan = async function() {
    const machines = Array.from(document.querySelectorAll('.pmplan-machine-cb:checked')).map(b => b.value);
    const planType = document.getElementById('pmplan-type').value;
    const frequency = document.getElementById('pmplan-frequency').value;
    const intervalValue = document.getElementById('pmplan-interval').value;
    const taskName = document.getElementById('pmplan-taskname').value.trim();
    const nextDueDate = document.getElementById('pmplan-nextdue').value;
    const assignedTo = document.getElementById('pmplan-assignedto').value.trim();
    const note = document.getElementById('pmplan-note').value.trim();
    const instruction = document.getElementById('pmplan-instruction').value.trim();
    const startShift = document.getElementById('pmplan-startshift')?.value || '';
    const photoFiles = pmPlanPhotoFiles.slice(0, PM_PLAN_MAX_PHOTOS);

    if (machines.length === 0 || !taskName || !nextDueDate) {
        alert('กรุณาเลือกเครื่องจักรอย่างน้อย 1 เครื่อง และกรอกชื่องาน กับวันที่ครบกำหนดให้ครบ');
        return;
    }
    if (frequency === 'Custom' && !intervalValue) {
        alert('กรุณาระบุจำนวนวันสำหรับความถี่แบบกำหนดเอง');
        return;
    }

    const btn = document.getElementById('pmplan-submit-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;

    const imagesBase64 = [];
    for (let i = 0; i < photoFiles.length; i++) {
        try {
            btn.innerHTML = `⏳ กำลังบีบอัดรูปภาพ ${i + 1}/${photoFiles.length}...`;
            imagesBase64.push(await compressPmImage(photoFiles[i], 256));
        } catch (e) {
            alert(`❌ ไม่สามารถประมวลผลไฟล์ภาพที่ ${i + 1} ได้ กรุณาลองใหม่อีกครั้ง`);
            btn.disabled = false;
            btn.innerHTML = originalText;
            return;
        }
    }

    btn.innerHTML = '⏳ กำลังบันทึก...';

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'ADD_PM_PLAN',
                machines, planType, taskName, frequency,
                intervalValue: intervalValue || 0,
                nextDueDate, assignedTo, note, instruction, startShift,
                imagesBase64,
                imageBase64: imagesBase64[0] || '', // เผื่อ backend เวอร์ชันเก่า
                username: window.currentUser?.username || window.currentUser?.name || '',
                role: window.currentUser?.role || ''
            })
        });
        const result = await res.json();
        if (result.status !== 'success') throw new Error(result.message || 'บันทึกไม่สำเร็จ');

        document.getElementById('modal-add-pm-plan').classList.add('hidden');
        window.showPmGantt();
    } catch (e) {
        alert('❌ เกิดข้อผิดพลาด: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

// === Gantt Chart ===
let pmGanttData = null;

window.showPmGantt = async function() {
    const container = document.getElementById('inbox-content');
    if (!container) return;
    container.innerHTML = '<div class="flex items-center justify-center h-64 text-gray-400 animate-pulse">⏳ กำลังโหลดข้อมูล Gantt...</div>';

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'GET_PM_SUMMARY' })
        });
        const data = await res.json();
        if (data.status !== 'success') throw new Error(data.message);
        pmGanttData = data;
        renderGanttChart(container, data);
    } catch (e) {
        container.innerHTML = `<div class="text-red-500 text-center py-8">โหลดไม่สำเร็จ: ${e.message}</div>`;
    }
};

function renderGanttChart(container, data) {
    const { plans, logs, stats } = data;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // หาช่วงเวลาอัตโนมัติจากข้อมูลจริง (minimum ±14 วัน)
    const toDateEarly = (s) => { const d = new Date(s + 'T00:00:00'); return isNaN(d.getTime()) ? null : d; };
    let minDate = new Date(today), maxDate = new Date(today);
    plans.forEach(p => {
        const nd = toDateEarly(p.nextDueDate);
        const ld = toDateEarly(p.lastDoneDate);
        if (nd && nd < minDate) minDate = new Date(nd);
        if (nd && nd > maxDate) maxDate = new Date(nd);
        if (ld && ld < minDate) minDate = new Date(ld);
        if (ld && ld > maxDate) maxDate = new Date(ld);
    });
    logs.forEach(l => {
        const dd = toDateEarly(l.doneDate);
        if (dd && dd < minDate) minDate = new Date(dd);
        if (dd && dd > maxDate) maxDate = new Date(dd);
    });
    const padBefore = Math.max(14, Math.round((today - minDate) / 86400000) + 7);
    const padAfter = Math.max(14, Math.round((maxDate - today) / 86400000) + 7);
    const startDate = new Date(today); startDate.setDate(startDate.getDate() - padBefore);
    const endDate = new Date(today); endDate.setDate(endDate.getDate() + padAfter);
    const totalDays = padBefore + padAfter + 1;
    const todayIndex = padBefore;

    const toDate = (s) => { const d = new Date(s + 'T00:00:00'); return isNaN(d.getTime()) ? null : d; };
    const dayIndex = (d) => Math.round((d - startDate) / 86400000);

    // เลื่อนวันที่ไปตามความถี่ของแผน (ใช้ตรรกะเดียวกับฝั่ง backend ตอนปิดงาน PM)
    const stepByFrequency = (date, frequency, intervalValue) => {
        const d = new Date(date);
        const freq = String(frequency || '').trim().toLowerCase();
        if (freq === 'daily') d.setDate(d.getDate() + 1);
        else if (freq === 'weekly') d.setDate(d.getDate() + 7);
        else if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
        else if (freq === 'quarterly') d.setMonth(d.getMonth() + 3);
        else if (freq === 'yearly') d.setFullYear(d.getFullYear() + 1);
        else d.setDate(d.getDate() + (intervalValue || 30));
        return d;
    };

    // ปุ่มเพิ่มแผน PM
    let statsHtml = `<div class="flex justify-end gap-2 mb-3">
        <button onclick="window.showPmHistory()" class="bg-white border border-green-600 text-green-700 text-sm font-bold px-4 py-2 rounded-lg shadow-sm hover:bg-green-50 transition-colors flex items-center gap-1">
            🗂️ ประวัติที่ทำแล้ว
        </button>
        <button onclick="window.openAddPmPlanModal()" class="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-1">
            ➕ เพิ่มแผน PM
        </button>
    </div>`;

    // Stats cards
    statsHtml += `<div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        <div class="bg-blue-50 rounded-lg p-3 text-center"><div class="text-2xl font-bold text-blue-700">${stats.total}</div><div class="text-xs text-blue-600">งานทั้งหมด</div></div>
        <div class="bg-green-50 rounded-lg p-3 text-center"><div class="text-2xl font-bold text-green-700">${stats.onTime}</div><div class="text-xs text-green-600">ตรงเวลา</div></div>
        <div class="bg-red-50 rounded-lg p-3 text-center"><div class="text-2xl font-bold text-red-700">${stats.late}</div><div class="text-xs text-red-600">ช้ากว่ากำหนด</div></div>
        <div class="bg-orange-50 rounded-lg p-3 text-center"><div class="text-2xl font-bold text-orange-700">${stats.overdue}</div><div class="text-xs text-orange-600">ค้าง (ยังไม่ทำ)</div></div>
        <div class="bg-indigo-50 rounded-lg p-3 text-center"><div class="text-2xl font-bold text-indigo-700">${stats.adherencePct}%</div><div class="text-xs text-indigo-600">On-time Rate</div></div>
    </div>`;

    // สรุปแยกกะ — เดือนนี้แต่ละกะทำไปเท่าไร และถือรอบถัดไปอยู่กี่งาน
    const shiftStats = data.shiftStats || {};
    if (Object.keys(shiftStats).length) {
        statsHtml += `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">${PM_SHIFT_LIST.map(s => {
            const st = shiftStats[s] || {};
            return `<div class="bg-white border rounded-lg p-3 flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">${pmShiftBadge(s, '🔄 ')}<span class="text-xs text-gray-500">เดือนนี้</span></div>
                <div class="flex gap-4 text-center text-xs">
                    <div><div class="text-lg font-bold text-gray-800">${st.doneMonth || 0}</div><div class="text-gray-500">ทำแล้ว</div></div>
                    <div><div class="text-lg font-bold text-green-700">${st.onTimeMonth || 0}</div><div class="text-gray-500">ตรงเวลา</div></div>
                    <div><div class="text-lg font-bold text-orange-600">${st.coverMonth || 0}</div><div class="text-gray-500">ทำแทนอีกกะ</div></div>
                    <div><div class="text-lg font-bold text-indigo-700">${st.planned || 0}</div><div class="text-gray-500">รอบถัดไป${st.overdue ? ` <span class="text-red-600 font-bold">(ค้าง ${st.overdue})</span>` : ''}</div></div>
                </div>
            </div>`;
        }).join('')}</div>`;
    }

    // สร้าง header วันที่
    const months = [];
    const dayHeaders = [];
    let prevMonth = '';
    for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDate); d.setDate(d.getDate() + i);
        const monthLabel = d.toLocaleDateString('th-TH', { month: 'short' });
        if (monthLabel !== prevMonth) { months.push({ label: monthLabel, start: i, span: 0 }); prevMonth = monthLabel; }
        months[months.length - 1].span++;
        const isToday = d.getTime() === today.getTime();
        const isSun = d.getDay() === 0;
        dayHeaders.push(`<div class="inline-block text-center" style="width:20px;min-width:20px"><div class="text-[8px] ${isToday ? 'bg-indigo-600 text-white rounded-full font-bold' : isSun ? 'text-red-400' : 'text-gray-400'}">${d.getDate()}</div></div>`);
    }
    const monthRow = months.map(m => `<div class="inline-block text-center text-[9px] font-bold text-gray-500 border-b" style="width:${m.span * 20}px">${m.label}</div>`).join('');

    // สร้างแถว Gantt ต่อ plan
    const planRows = plans.map(plan => {
        const planLogs = logs.filter(l => l.planId === plan.planId);
        const nextDue = toDate(plan.nextDueDate);
        const lastDone = toDate(plan.lastDoneDate);

        // คาดการณ์รอบถัดๆ ไปตามความถี่ของแผน (เพื่อให้เห็นรอบ Weekly/Monthly ฯลฯ ล่วงหน้าในกราฟ)
        const projectedDueTimes = new Set();
        if (nextDue) {
            let pd = new Date(nextDue);
            let guard = 0;
            while (guard < 200) {
                pd = stepByFrequency(pd, plan.frequency, plan.intervalValue);
                if (pd > endDate) break;
                projectedDueTimes.add(pd.getTime());
                guard++;
            }
        }

        let cells = '';
        for (let i = 0; i < totalDays; i++) {
            const d = new Date(startDate); d.setDate(d.getDate() + i);
            const isToday = d.getTime() === today.getTime();
            let bg = '';
            let marker = '';

            // due date marker
            if (nextDue && d.getTime() === nextDue.getTime()) {
                marker = `<div class="absolute inset-0 flex items-center justify-center"><div class="w-3 h-3 rounded-full ${isToday ? 'bg-indigo-600' : d < today ? 'bg-red-500' : 'bg-blue-500'} border-2 border-white shadow"></div></div>`;
            } else if (projectedDueTimes.has(d.getTime())) {
                marker = `<div class="absolute inset-0 flex items-center justify-center" title="กำหนดถัดไป (คาดการณ์)"><div class="w-2.5 h-2.5 rounded-full bg-white border-2 border-blue-300"></div></div>`;
            }

            // log markers — คลิกเพื่อย้อนดูรายละเอียดงานที่ทำไปแล้ว
            planLogs.forEach(l => {
                const doneD = toDate(l.doneDate);
                if (doneD && d.getTime() === doneD.getTime()) {
                    const color = l.status === 'Approved' ? (l.daysDiff <= 0 ? 'bg-green-500' : 'bg-orange-500') : l.status === 'Wait Approve' ? 'bg-yellow-400' : 'bg-gray-400';
                    marker = `<div class="absolute inset-0 flex items-center justify-center cursor-pointer" onclick="window.openPmLogDetail('${escapePmAttr(l.logId)}')"><div class="w-3 h-3 ${color} rounded-sm border border-white shadow hover:scale-150 transition-transform" title="${l.status} (${l.daysDiff > 0 ? '+' + l.daysDiff + ' วัน' : 'ตรงเวลา'})${l.doneShift ? ' · ทำโดยกะ ' + l.doneShift : ''} — คลิกดูรายละเอียด"></div></div>`;
                }
            });

            if (isToday) bg = 'bg-indigo-50';
            else if (d.getDay() === 0) bg = 'bg-gray-50';

            cells += `<div class="inline-block relative" style="width:20px;min-width:20px;height:28px"><div class="h-full border-r border-gray-100 ${bg}"></div>${marker}</div>`;
        }

        const overdueLabel = nextDue && nextDue <= today ? `<span class="text-red-600 text-[9px] font-bold ml-1">เกิน ${dayIndex(today) - dayIndex(nextDue)} วัน</span>` : '';

        return `<div class="flex border-b border-gray-100 hover:bg-gray-50 group">
            <div class="shrink-0 w-48 p-1.5 border-r bg-white sticky left-0 z-10 flex items-start justify-between gap-1">
                <div class="min-w-0">
                    <div class="text-xs font-bold text-gray-800 truncate">${plan.taskName}${overdueLabel}</div>
                    <div class="text-[9px] text-gray-400">${plan.machine} · ${plan.frequency}${plan.assignedTo ? ' · ' + plan.assignedTo : ''} ${pmShiftBadge(plan.assignedShift)}</div>
                </div>
                <button data-plan-id="${escapePmAttr(plan.planId)}" data-task-name="${escapePmAttr(plan.taskName)}" data-machine="${escapePmAttr(plan.machine)}" onclick="window.deletePmPlan(this)" title="ลบแผนนี้" class="shrink-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-sm">🗑️</button>
            </div>
            <div class="flex-1 whitespace-nowrap overflow-hidden">${cells}</div>
        </div>`;
    });

    // Legend
    const legendHtml = `<div class="flex flex-wrap gap-3 mt-3 text-[10px] text-gray-600">
        <span><span class="inline-block w-3 h-3 bg-blue-500 rounded-full align-middle"></span> กำหนดถัดไป</span>
        <span><span class="inline-block w-3 h-3 bg-red-500 rounded-full align-middle"></span> เลยกำหนด</span>
        <span><span class="inline-block w-2.5 h-2.5 rounded-full bg-white border-2 border-blue-300 align-middle"></span> รอบถัดไป (คาดการณ์ตามความถี่)</span>
        <span><span class="inline-block w-3 h-3 bg-green-500 rounded-sm align-middle"></span> ทำตรงเวลา</span>
        <span><span class="inline-block w-3 h-3 bg-orange-500 rounded-sm align-middle"></span> ทำแต่ช้า</span>
        <span><span class="inline-block w-3 h-3 bg-yellow-400 rounded-sm align-middle"></span> รออนุมัติ</span>
    </div>`;

    container.innerHTML = `
        ${statsHtml}
        <div class="bg-white rounded-lg shadow-sm border overflow-x-auto" id="gantt-scroll-container">
            <div class="min-w-max">
                <div class="flex border-b bg-gray-50 sticky top-0 z-20">
                    <div class="shrink-0 w-48 p-2 border-r font-bold text-xs text-gray-600 sticky left-0 bg-gray-50 z-30">แผน PM</div>
                    <div class="flex-1 whitespace-nowrap">
                        <div>${monthRow}</div>
                        <div>${dayHeaders.join('')}</div>
                    </div>
                </div>
                ${planRows.length > 0 ? planRows.join('') : '<div class="text-center text-gray-400 py-8">ยังไม่มีแผน PM — กรุณาเพิ่มข้อมูลในชีท Maintenance_Plan</div>'}
            </div>
        </div>
        ${legendHtml}
    `;

    // Auto-scroll ให้วันปัจจุบันอยู่กลางจอ
    const scrollEl = container.querySelector('#gantt-scroll-container');
    if (scrollEl) {
        const labelWidth = 192; // w-48 = 192px
        const todayPx = todayIndex * 20;
        const visibleWidth = scrollEl.clientWidth - labelWidth;
        scrollEl.scrollLeft = Math.max(0, todayPx - visibleWidth / 2);
    }
}

// ==================================================
// 🗂️ ประวัติแผน PM ที่ทำ/ปิดงานไปแล้ว — ย้อนกลับมาตรวจดูได้
// ==================================================
let pmHistoryData = null;
let pmHistoryFilters = { machine: '', shift: '', fromDate: '', toDate: '', keyword: '' };

function pmHistoryDefaultRange() {
    // ใช้วันที่ปฏิทินจริง (ไม่ใช้ cutoff 08:00) เพราะ Maintenance_Log บันทึกด้วยวันที่ปฏิทิน
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 90);
    return { fromDate: fmt(from), toDate: fmt(today) };
}

window.showPmHistory = async function(keepFilters) {
    const container = document.getElementById('inbox-content');
    if (!container) return;
    if (!keepFilters) {
        const range = pmHistoryDefaultRange();
        pmHistoryFilters = { machine: '', shift: '', fromDate: range.fromDate, toDate: range.toDate, keyword: '' };
    }
    container.innerHTML = '<div class="flex items-center justify-center h-64 text-gray-400 animate-pulse">⏳ กำลังโหลดประวัติ PM...</div>';

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'GET_PM_HISTORY',
                fromDate: pmHistoryFilters.fromDate,
                toDate: pmHistoryFilters.toDate,
                machine: pmHistoryFilters.machine,
                shift: pmHistoryFilters.shift,
                keyword: pmHistoryFilters.keyword
            })
        });
        const data = await res.json();
        if (data.status !== 'success') throw new Error(data.message || 'โหลดไม่สำเร็จ');
        pmHistoryData = data;
        renderPmHistory(container, data);
    } catch (e) {
        container.innerHTML = `<div class="text-red-500 text-center py-8">โหลดประวัติไม่สำเร็จ: ${e.message}</div>`;
    }
};

window.applyPmHistoryFilter = function() {
    pmHistoryFilters = {
        machine: document.getElementById('pmhist-machine')?.value || '',
        shift: document.getElementById('pmhist-shift')?.value || '',
        fromDate: document.getElementById('pmhist-from')?.value || '',
        toDate: document.getElementById('pmhist-to')?.value || '',
        keyword: document.getElementById('pmhist-keyword')?.value.trim() || ''
    };
    window.showPmHistory(true);
};

window.resetPmHistoryFilter = function() {
    window.showPmHistory(false);
};

function renderPmHistory(container, data) {
    const { logs, stats, machines } = data;
    const machineOptions = ['<option value="">ทุกเครื่อง</option>']
        .concat((machines || []).map(m => `<option value="${m}" ${pmHistoryFilters.machine === m ? 'selected' : ''}>${m}</option>`))
        .join('');

    const filterHtml = `<div class="bg-white rounded-lg shadow-sm border p-3 mb-3">
        <div class="flex items-center justify-between mb-2">
            <h3 class="font-bold text-sm text-gray-700 flex items-center gap-2">🗂️ ประวัติ PM ที่ทำแล้ว</h3>
            <button onclick="window.showPmGantt()" class="text-xs font-bold text-indigo-600 hover:underline">📊 กลับไป Gantt</button>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div>
                <label class="block text-[11px] font-bold text-gray-500 mb-0.5">เครื่องจักร</label>
                <select id="pmhist-machine" class="w-full p-2 text-sm border border-gray-300 rounded-lg bg-white">${machineOptions}</select>
            </div>
            <div>
                <label class="block text-[11px] font-bold text-gray-500 mb-0.5">กะที่ทำ</label>
                <select id="pmhist-shift" class="w-full p-2 text-sm border border-gray-300 rounded-lg bg-white">
                    <option value="">ทุกกะ</option>
                    ${PM_SHIFT_LIST.map(s => `<option value="${s}" ${pmHistoryFilters.shift === s ? 'selected' : ''}>กะ ${s}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="block text-[11px] font-bold text-gray-500 mb-0.5">ตั้งแต่วันที่</label>
                <input type="date" id="pmhist-from" value="${pmHistoryFilters.fromDate}" class="w-full p-2 text-sm border border-gray-300 rounded-lg bg-white">
            </div>
            <div>
                <label class="block text-[11px] font-bold text-gray-500 mb-0.5">ถึงวันที่</label>
                <input type="date" id="pmhist-to" value="${pmHistoryFilters.toDate}" class="w-full p-2 text-sm border border-gray-300 rounded-lg bg-white">
            </div>
            <div>
                <label class="block text-[11px] font-bold text-gray-500 mb-0.5">ค้นหา (ชื่องาน / ผู้ทำ)</label>
                <input type="text" id="pmhist-keyword" value="${escapePmAttr(pmHistoryFilters.keyword)}" placeholder="เช่น อัดจารบี" onkeydown="if(event.key==='Enter') window.applyPmHistoryFilter()" class="w-full p-2 text-sm border border-gray-300 rounded-lg bg-white">
            </div>
        </div>
        <div class="flex flex-wrap gap-2 mt-2">
            <button onclick="window.applyPmHistoryFilter()" class="bg-indigo-600 text-white text-sm font-bold px-4 py-1.5 rounded-lg hover:bg-indigo-700">🔍 ค้นหา</button>
            <button onclick="window.resetPmHistoryFilter()" class="bg-gray-200 text-gray-700 text-sm font-bold px-4 py-1.5 rounded-lg hover:bg-gray-300">ล้างตัวกรอง (90 วันล่าสุด)</button>
            <div class="flex-1"></div>
            <button id="pmhist-pdf-btn" onclick="window.downloadPmHistoryPdf()" class="bg-red-600 text-white text-sm font-bold px-4 py-1.5 rounded-lg hover:bg-red-700">⬇️ ดาวน์โหลด PDF</button>
            <button onclick="window.printPmHistoryReport()" class="bg-white border border-indigo-600 text-indigo-700 text-sm font-bold px-4 py-1.5 rounded-lg hover:bg-indigo-50">🖨️ พิมพ์</button>
            <button onclick="window.exportPmHistoryCSV()" class="bg-white border border-green-600 text-green-700 text-sm font-bold px-4 py-1.5 rounded-lg hover:bg-green-50">📄 CSV (Excel)</button>
        </div>
    </div>`;

    const statsHtml = `<div class="grid grid-cols-3 gap-2 mb-3">
        <div class="bg-blue-50 rounded-lg p-3 text-center"><div class="text-2xl font-bold text-blue-700">${stats.total}</div><div class="text-xs text-blue-600">งานที่ทำแล้ว</div></div>
        <div class="bg-green-50 rounded-lg p-3 text-center"><div class="text-2xl font-bold text-green-700">${stats.onTime}</div><div class="text-xs text-green-600">ตรงเวลา</div></div>
        <div class="bg-orange-50 rounded-lg p-3 text-center"><div class="text-2xl font-bold text-orange-700">${stats.late}</div><div class="text-xs text-orange-600">ช้ากว่ากำหนด</div></div>
    </div>`;

    const listHtml = logs.length === 0
        ? `<div class="flex flex-col items-center justify-center h-48 text-gray-400 bg-white rounded-lg border">
            <div class="text-4xl mb-2">🗂️</div>
            <div class="font-bold">ไม่พบประวัติในช่วงที่เลือก</div>
            <div class="text-sm">ลองขยายช่วงวันที่ หรือล้างตัวกรอง</div>
        </div>`
        : logs.map(renderPmHistoryItem).join('');

    const moreHtml = data.totalFound > logs.length
        ? `<div class="text-center text-xs text-gray-400 py-2">แสดง ${logs.length} จาก ${data.totalFound} รายการ — กรองช่วงวันที่ให้แคบลงเพื่อดูรายการที่เหลือ</div>`
        : '';

    container.innerHTML = filterHtml + statsHtml + listHtml + moreHtml;
}

function renderPmHistoryItem(l) {
    const late = l.daysDiff > 0;
    const border = late ? 'border-l-orange-500' : 'border-l-green-500';
    const badge = late
        ? `<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded-full font-bold">ช้า ${l.daysDiff} วัน</span>`
        : `<span class="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-bold">ตรงเวลา</span>`;
    const thumbs = (l.photoUrls || [])
        .map(u => ({ url: u, thumb: typeof getThumbUrl === 'function' ? getThumbUrl(u) : null }))
        .filter(t => t.thumb);
    const photoHtml = thumbs.length
        ? `<div class="flex flex-wrap gap-1.5 mt-2">${thumbs.map((t, i) => `
            <img src="${t.thumb}" onclick="window.openPmPhoto('${t.url}', '${escapePmAttr(l.taskName)} · ${l.machine} · ${l.doneDate}')" onerror="this.style.display='none'" class="w-16 h-16 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity" title="รูปหลังทำเสร็จ ${i + 1}/${thumbs.length}">`).join('')}</div>`
        : '<div class="text-[11px] text-gray-400 mt-2">— ไม่มีรูปแนบ —</div>';

    return `<div class="border-l-4 ${border} bg-white rounded-r-lg shadow-sm p-4 mb-2 hover:shadow-md transition-shadow">
        <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
                <div class="flex items-center flex-wrap gap-2 mb-1">
                    <span class="text-lg">✅</span>
                    <span class="font-bold text-gray-800 text-sm">${l.taskName}</span>
                    ${l.planType ? `<span class="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full">${l.planType}</span>` : ''}
                    <span class="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-mono">${l.machine}</span>
                    ${badge}
                    ${pmShiftBadge(l.doneShift)}
                    ${pmIsCover(l) ? `<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded-full font-bold">ทำแทนกะ ${l.assignedShift}</span>` : ''}
                </div>
                <div class="text-xs text-gray-600">ทำเมื่อ: <b>${l.doneDate || '-'}</b> · กำหนด: ${l.dueDate || '-'} · ผู้ทำ: <b>${pmDoneByText(l)}</b></div>
                ${l.note ? `<div class="text-xs text-gray-600 bg-gray-50 p-2 rounded mt-2 whitespace-pre-line">📝 ${l.note}</div>` : ''}
                ${photoHtml}
                <div class="text-[10px] text-gray-400 mt-2">${l.logId} · ${l.planId}${l.frequency ? ' · ' + l.frequency : ''}</div>
            </div>
            <button onclick="window.openPmLogDetail('${escapePmAttr(l.logId)}')" class="shrink-0 text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded hover:bg-gray-200 font-bold">🔍 รายละเอียด</button>
        </div>
    </div>`;
}

window.openPmPhoto = function(url, caption) {
    if (typeof window.viewMaintImage === 'function') window.viewMaintImage(url, caption);
    else window.open(url, '_blank');
};

// เปิดรายละเอียดงาน PM ที่ทำไปแล้ว (เรียกได้จากทั้งหน้าประวัติและ Gantt)
window.openPmLogDetail = async function(logId) {
    let log = (pmHistoryData && pmHistoryData.logs || []).find(l => l.logId === logId);

    if (!log) {
        // กดมาจาก Gantt — ดึงรายละเอียดเต็ม (วิธีทำ/รูปอ้างอิง) จาก backend ก่อน
        try {
            const res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'GET_PM_HISTORY', logId: logId }) });
            const data = await res.json();
            if (data.status === 'success') log = (data.logs || []).find(l => l.logId === logId);
        } catch (e) { /* ใช้ข้อมูลเท่าที่มีใน Gantt แทน */ }
    }
    if (!log) log = (pmGanttData && pmGanttData.logs || []).find(l => l.logId === logId);
    if (!log) { alert('ไม่พบประวัติงาน ' + logId); return; }

    const late = log.daysDiff > 0;
    const thumbs = (log.photoUrls || [])
        .map(u => ({ url: u, thumb: typeof getThumbUrl === 'function' ? getThumbUrl(u) : null }))
        .filter(t => t.thumb);
    const photoHtml = thumbs.length
        ? `<div class="grid grid-cols-2 gap-2">${thumbs.map((t, i) => `
            <img src="${t.thumb}" onclick="window.openPmPhoto('${t.url}', '${escapePmAttr(log.taskName)} · ${log.machine} · ${log.doneDate}')" onerror="this.style.display='none'" class="w-full h-28 object-cover rounded-lg border cursor-pointer hover:opacity-80" title="รูปที่ ${i + 1}">`).join('')}</div>`
        : '<div class="text-xs text-gray-400">— ไม่มีรูปแนบตอนปิดงาน —</div>';
    const refHtml = (log.referencePhotos || []).length
        ? `<div class="flex flex-wrap gap-2 mt-1">${log.referencePhotos.map((u, i) => `<a href="${u}" target="_blank" class="text-xs font-bold text-indigo-700 underline">📸 รูปอ้างอิงวิธีทำ ${i + 1}</a>`).join('')}</div>`
        : '';

    document.getElementById('modal-pm-log-detail')?.remove();
    const html = `<div id="modal-pm-log-detail" class="fixed inset-0 bg-black bg-opacity-50 z-[400] flex items-center justify-center p-3 sm:p-4">
        <div class="bg-white w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden" style="max-height: 90vh; max-height: 90dvh;">
            <div class="px-5 pt-5 pb-3 flex-none flex items-start justify-between gap-2">
                <h3 class="text-lg font-bold">🗂️ รายละเอียดงาน PM ที่ทำแล้ว</h3>
                <button onclick="document.getElementById('modal-pm-log-detail').remove()" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div class="px-5 flex-1 overflow-y-auto overscroll-contain space-y-3">
                <div class="bg-indigo-50 p-3 rounded-lg text-sm">
                    <div class="font-bold text-indigo-800">${log.taskName}</div>
                    <div class="text-indigo-600 text-xs">${log.machine}${log.planType ? ' · ' + log.planType : ''}${log.frequency ? ' · ' + log.frequency : ''}</div>
                    ${log.instruction ? `<div class="text-gray-700 text-xs mt-2 whitespace-pre-line">📝 ${log.instruction}</div>` : ''}
                    ${refHtml}
                </div>
                <div class="grid grid-cols-2 gap-2 text-xs">
                    <div class="bg-gray-50 p-2 rounded"><div class="text-gray-500">กำหนด</div><div class="font-bold text-gray-800">${log.dueDate || '-'}</div></div>
                    <div class="bg-gray-50 p-2 rounded"><div class="text-gray-500">ทำเสร็จ</div><div class="font-bold text-gray-800">${log.doneDate || '-'}</div></div>
                    <div class="bg-gray-50 p-2 rounded"><div class="text-gray-500">ผู้ทำ</div><div class="font-bold text-gray-800">${pmDoneByText(log)}${pmIsCover(log) ? ` <span class="text-orange-600">· ทำแทนกะ ${log.assignedShift}</span>` : ''}</div></div>
                    <div class="${late ? 'bg-orange-50' : 'bg-green-50'} p-2 rounded"><div class="text-gray-500">สถานะ</div><div class="font-bold ${late ? 'text-orange-700' : 'text-green-700'}">${late ? 'ช้า ' + log.daysDiff + ' วัน' : 'ตรงเวลา'}</div></div>
                </div>
                ${log.note ? `<div class="text-xs text-gray-700 bg-gray-50 p-2 rounded whitespace-pre-line">📝 หมายเหตุ: ${log.note}</div>` : ''}
                <div>
                    <div class="text-sm font-bold text-gray-700 mb-1">📸 รูปหลังทำเสร็จ</div>
                    ${photoHtml}
                </div>
                <div class="text-[10px] text-gray-400">${log.logId} · ${log.planId}</div>
            </div>
            <div class="px-5 py-3 border-t bg-white flex-none flex justify-end">
                <button onclick="document.getElementById('modal-pm-log-detail').remove()" class="bg-gray-200 text-gray-700 px-5 py-2 rounded-xl font-bold hover:bg-gray-300">ปิด</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
};

// ==================================================
// 📤 Export รายงานประวัติ PM (พิมพ์/PDF และ CSV)
// ==================================================
function pmHistoryFilterLabel() {
    const parts = [];
    parts.push(`ช่วงวันที่: ${pmHistoryFilters.fromDate || 'ทั้งหมด'} ถึง ${pmHistoryFilters.toDate || 'ทั้งหมด'}`);
    parts.push(`เครื่องจักร: ${pmHistoryFilters.machine || 'ทุกเครื่อง'}`);
    parts.push(`กะ: ${pmHistoryFilters.shift || 'ทุกกะ'}`);
    if (pmHistoryFilters.keyword) parts.push(`คำค้น: ${pmHistoryFilters.keyword}`);
    return parts.join(' · ');
}

function pmEscapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.printPmHistoryReport = function() {
    const logs = (pmHistoryData && pmHistoryData.logs) || [];
    if (logs.length === 0) { alert('ไม่มีข้อมูลให้พิมพ์ — กรุณาค้นหาก่อน'); return; }

    const stats = pmHistoryData.stats || { total: logs.length, onTime: 0, late: 0 };
    const adherence = stats.total > 0 ? Math.round(stats.onTime / stats.total * 1000) / 10 : 0;
    const printedBy = (window.currentUser && (window.currentUser.name || window.currentUser.username)) || '-';
    const printedAt = new Date().toLocaleString('th-TH');

    const rows = logs.map((l, idx) => {
        const photos = (l.photoUrls || [])
            .map(u => (typeof getThumbUrl === 'function' ? getThumbUrl(u) : null))
            .filter(Boolean)
            .slice(0, 4)
            .map(t => `<img src="${pmEscapeHtml(t)}" class="ph">`)
            .join('');
        return `<tr>
            <td class="c">${idx + 1}</td>
            <td class="c">${pmEscapeHtml(l.doneDate)}</td>
            <td class="c">${pmEscapeHtml(l.machine)}</td>
            <td>${pmEscapeHtml(l.taskName)}${l.planType ? ` <span class="tag">${pmEscapeHtml(l.planType)}</span>` : ''}${l.frequency ? `<div class="sub">ความถี่: ${pmEscapeHtml(l.frequency)}</div>` : ''}</td>
            <td class="c">${pmEscapeHtml(l.dueDate)}</td>
            <td class="c">${pmEscapeHtml(pmDoneByText(l))}</td>
            <td class="c ${l.daysDiff > 0 ? 'late' : 'ontime'}">${l.daysDiff > 0 ? 'ช้า ' + l.daysDiff + ' วัน' : 'ตรงเวลา'}</td>
            <td>${pmEscapeHtml(l.note)}</td>
            <td class="c">${photos || '<span class="sub">ไม่มีรูป</span>'}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
    <title>รายงานประวัติการซ่อมบำรุง (PM)</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: "Segoe UI", Tahoma, sans-serif; padding: 16px; color: #1f2937; font-size: 12px; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .meta { font-size: 11px; color: #6b7280; margin-bottom: 12px; line-height: 1.6; }
        .cards { display: flex; gap: 8px; margin-bottom: 12px; }
        .card { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; text-align: center; }
        .card .n { font-size: 20px; font-weight: bold; }
        .card .l { font-size: 10px; color: #6b7280; }
        /* table-layout: fixed + ความกว้างเป็น % เพื่อให้ช่อง "งานที่ทำ" ไม่ถูกบีบจนตัดคำทีละบรรทัด */
        table.data { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { border: 1px solid #d1d5db; padding: 5px 6px; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
        th { background: #eef2ff; font-size: 11px; }
        td.c { text-align: center; }
        tr { page-break-inside: avoid; }
        thead { display: table-header-group; }
        .sub { font-size: 10px; color: #6b7280; }
        .tag { background: #eef2ff; color: #4338ca; border-radius: 8px; padding: 1px 5px; font-size: 10px; }
        .late { color: #c2410c; font-weight: bold; }
        .ontime { color: #15803d; font-weight: bold; }
        .ph { width: 46px; height: 46px; max-width: 48%; object-fit: cover; border: 1px solid #e5e7eb; border-radius: 4px; margin: 1px; }
        .sign { margin-top: 24px; display: flex; gap: 40px; font-size: 11px; }
        .sign div { flex: 1; border-top: 1px dotted #9ca3af; padding-top: 4px; text-align: center; color: #6b7280; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; } }
    </style></head><body>
    <h1>🗂️ รายงานประวัติการซ่อมบำรุง (PM / AM)</h1>
    <div class="meta">
        ${pmEscapeHtml(pmHistoryFilterLabel())}<br>
        พิมพ์โดย: ${pmEscapeHtml(printedBy)} · วันที่พิมพ์: ${pmEscapeHtml(printedAt)} · จำนวน ${logs.length} รายการ
    </div>
    <div class="cards">
        <div class="card"><div class="n">${stats.total}</div><div class="l">งานที่ทำแล้ว</div></div>
        <div class="card"><div class="n" style="color:#15803d">${stats.onTime}</div><div class="l">ตรงเวลา</div></div>
        <div class="card"><div class="n" style="color:#c2410c">${stats.late}</div><div class="l">ช้ากว่ากำหนด</div></div>
        <div class="card"><div class="n" style="color:#4338ca">${adherence}%</div><div class="l">On-time Rate</div></div>
    </div>
    <table class="data">
        <colgroup>
            <col style="width:3%"><col style="width:9%"><col style="width:7%"><col style="width:27%"><col style="width:9%">
            <col style="width:11%"><col style="width:8%"><col style="width:14%"><col style="width:12%">
        </colgroup>
        <thead><tr>
            <th>#</th><th>วันที่ทำ</th><th>เครื่อง</th><th>งานที่ทำ</th><th>กำหนด</th>
            <th>ผู้ทำ</th><th>สถานะ</th><th>หมายเหตุ</th><th>รูปหลังทำเสร็จ</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>
    <div class="sign"><div>ผู้จัดทำ</div><div>หัวหน้าแผนก</div><div>ผู้อนุมัติ</div></div>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('เบราว์เซอร์บล็อกป๊อปอัพ — กรุณาอนุญาตป๊อปอัพเพื่อพิมพ์รายงาน'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (e) { /* ผู้ใช้สั่งพิมพ์เองได้ */ } }, 800);
};

window.exportPmHistoryCSV = function() {
    const logs = (pmHistoryData && pmHistoryData.logs) || [];
    if (logs.length === 0) { alert('ไม่มีข้อมูลให้ export — กรุณาค้นหาก่อน'); return; }

    const q = (v) => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
    const header = ['Log_ID', 'Plan_ID', 'วันที่ทำ', 'เครื่องจักร', 'ชื่องาน', 'ประเภท', 'ความถี่', 'วันครบกำหนด', 'ผู้ทำ', 'กะที่ทำ', 'กะที่ได้รับมอบหมาย', 'สถานะ', 'ช้า (วัน)', 'หมายเหตุ', 'ลิงก์รูปหลังทำเสร็จ'];
    let csv = `# รายงานประวัติการซ่อมบำรุง (PM) — ${pmHistoryFilterLabel()}\n`;
    csv += header.map(q).join(',') + '\n';
    logs.forEach(l => {
        csv += [
            l.logId, l.planId, l.doneDate, l.machine, l.taskName, l.planType, l.frequency,
            l.dueDate, l.doneBy, l.doneShift || '', l.assignedShift || '', l.daysDiff > 0 ? 'ช้ากว่ากำหนด' : 'ตรงเวลา', l.daysDiff > 0 ? l.daysDiff : 0,
            l.note, (l.photoUrls || []).join(' | ')
        ].map(q).join(',') + '\n';
    });

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PM_History_${pmHistoryFilters.fromDate || 'all'}_${pmHistoryFilters.toDate || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

// ดาวน์โหลดเป็นไฟล์ PDF ทันที (backend สร้างไฟล์ให้ ไม่ต้องผ่านหน้าต่างพิมพ์)
window.downloadPmHistoryPdf = async function() {
    const logs = (pmHistoryData && pmHistoryData.logs) || [];
    if (logs.length === 0) { alert('ไม่มีข้อมูลให้ดาวน์โหลด — กรุณาค้นหาก่อน'); return; }

    const btn = document.getElementById('pmhist-pdf-btn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ กำลังสร้าง PDF...'; }

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'EXPORT_PM_HISTORY_PDF',
                fromDate: pmHistoryFilters.fromDate,
                toDate: pmHistoryFilters.toDate,
                machine: pmHistoryFilters.machine,
                shift: pmHistoryFilters.shift,
                keyword: pmHistoryFilters.keyword,
                username: (window.currentUser && (window.currentUser.name || window.currentUser.username)) || '',
                role: (window.currentUser && window.currentUser.role) || ''
            })
        });
        const result = await res.json();
        if (result.status !== 'success' || !result.base64) throw new Error(result.message || 'สร้าง PDF ไม่สำเร็จ');

        const bin = atob(result.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename || `PM_History_${pmHistoryFilters.fromDate || 'all'}_${pmHistoryFilters.toDate || 'all'}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
        alert('❌ ดาวน์โหลด PDF ไม่สำเร็จ: ' + e.message + '\nลองใช้ปุ่ม "🖨️ พิมพ์" แล้วเลือกบันทึกเป็น PDF แทนได้');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
};
