// ⚙️ ระบบจัดการอะไหล่เครื่องจักร (Parts Tracking)

// Escape สำหรับใช้ใน HTML attribute (onclick="...escAttr(val)...") ป้องกัน XSS
function escAttr(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
// Escape สำหรับใช้ใน innerHTML text content
function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let partsCache = [];
let partLocationsCache = {};  // { Part_ID: [{machine, actualShots, actualDays, installId, lifeShots, carried, carriedDays}] }
let partRemovedCache = {};    // { Part_ID: { carriedShots, carriedDays, replacedDate, machine } } — most recent Removed record

function fetchPartsJson(payload) {
    return fetch(`${SCRIPT_URL}?_t=${Date.now()}`, {
        method: 'POST',
        cache: 'no-store',
        body: JSON.stringify(payload)
    });
}

// แปลงค่า Install_Date (อาจเป็น Date object, ISO string, "yyyy-MM-dd", หรือ "yyyy-MM-dd HH:mm") → "yyyy-MM-dd"
function extractInstallDateStr(raw) {
    if (!raw) return '';
    if (raw instanceof Date && !isNaN(raw.getTime())) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
    }
    const s = String(raw).trim();
    // ISO like 2026-04-11T07:00:00.000Z → ใช้เฉพาะส่วนวันที่
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
    // d/m/yyyy format fallback
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    }
    return '';
}

// คำนวณจำนวนวันที่ผ่านไปนับจาก installDateStr ถึงวันนี้ (ไม่ติดลบ)
function daysFromInstall(installDateStr) {
    if (!installDateStr) return 0;
    const installD = new Date(installDateStr + 'T00:00:00');
    if (isNaN(installD.getTime())) return 0;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = today.getTime() - installD.getTime();
    return Math.max(0, Math.floor(diff / 86400000));
}

// Format Install_Date เป็น "yyyy-MM-dd HH:mm" (24 ชม., +07:00, ไม่มี TZ suffix)
function formatInstallDateTime(raw) {
    if (!raw) return '-';
    const pad = (n) => String(n).padStart(2, '0');
    // ISO string with TZ (e.g. "2026-04-09T06:24:00.000Z") — convert to +07:00
    if (raw instanceof Date && !isNaN(raw.getTime())) {
        const utcMs = raw.getTime() + (7 * 60 * 60 * 1000);
        const d = new Date(utcMs);
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    }
    const s = String(raw).trim();
    if (!s) return '-';
    // ISO with T + timezone → parse + shift to +07:00
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
            const utcMs = d.getTime() + (7 * 60 * 60 * 1000);
            const d2 = new Date(utcMs);
            return `${d2.getUTCFullYear()}-${pad(d2.getUTCMonth() + 1)}-${pad(d2.getUTCDate())} ${pad(d2.getUTCHours())}:${pad(d2.getUTCMinutes())}`;
        }
    }
    // "yyyy-MM-dd HH:mm" หรือ "yyyy-MM-dd" — ใช้ได้เลย
    if (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?/.test(s)) return s.substring(0, 16);
    return s;
}

window.openPartsManager = function() {
    if (typeof window.switchTab === 'function') {
        window.switchTab('parts');
    } else {
        window.loadPartsMaster();
    }
};

window.loadPartsMaster = async function() {
    const tbody = document.getElementById('parts-table-body');
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-400 py-4">กำลังโหลด...</td></tr>';
    try {
        const [masterRes, instRes] = await Promise.all([
            fetchPartsJson({ action: 'GET_PARTS_MASTER' }),
            fetchPartsJson({ action: 'GET_PARTS_INSTALLATION' })
        ]);
        const masterResult = await masterRes.json();
        const instResult = await instRes.json();
        partsCache = masterResult.data || [];
        const machineShots = instResult.machineShots || {};
        const installationShots = instResult.installationShots || {};

        // สร้าง map: Part_ID → [{ machine, actualShots, ... }] (เฉพาะ Active)
        partLocationsCache = {};
        partRemovedCache = {};
        (instResult.data || []).forEach(inst => {
            const status = String(inst.Status || '').trim();
            // เก็บ Removed record ล่าสุดต่อ Part_ID (ดู shot สะสม ณ วันถอด)
            if (status === 'Removed') {
                const pid = inst.Part_ID;
                if (!pid) return;
                const replacedDate = inst.Replaced_Date ? extractInstallDateStr(inst.Replaced_Date) : '';
                const prev = partRemovedCache[pid];
                // เมื่อวันที่เท่ากัน (รวมถึงกรณีทั้งคู่ว่าง) ให้ใช้ record ล่าสุดใน array (index มากกว่า)
                // แก้ไข: ใช้ >= เพื่อให้ record ที่อ่านทีหลัง (index มากกว่า) ชนะเมื่อวันที่เท่ากัน
                if (!prev || replacedDate >= (prev.replacedDate || '')) {
                    partRemovedCache[pid] = {
                        carriedShots: Math.round(parseFloat(inst.Carried_Shots) || 0),
                        carriedDays: Math.round(parseFloat(inst.Carried_Days) || 0),
                        replacedDate: replacedDate,
                        machine: inst.Machine || ''
                    };
                }
                return;
            }
            if (status !== 'Active') return;
            const pid = inst.Part_ID;
            if (!pid) return;
            if (!partLocationsCache[pid]) partLocationsCache[pid] = [];
            const carried = parseInt(inst.Carried_Shots) || 0;
            const installShot = parseInt(inst.Install_Shot) || 0;
            const macShots = machineShots[inst.Machine] || 0;
            const shotState = installationShots[inst.Install_ID] || {};
            const actualShots = shotState.totalUsedShots !== undefined
                ? shotState.totalUsedShots
                : carried + Math.max(0, macShots - installShot);
            const carriedDays = parseInt(inst.Carried_Days) || 0;
            const installDateStr = extractInstallDateStr(inst.Install_Date);
            const daysOnMachine = daysFromInstall(installDateStr);
            const actualDays = carriedDays + daysOnMachine;
            const checkInterval = parseInt(inst.Check_Interval_Shots) || 0;
            const lifeShots = parseInt(inst.Life_Shots) || 0;
            const checkCount = parseInt(inst.Check_Count) || 0;
            const nextCheckShot = parseInt(inst.Next_Check_Shot) || 0;
            const effectiveLife = lifeShots > 0 ? lifeShots * (checkCount + 1) : 0;
            // ใช้สถานะจาก backend ซึ่งเริ่มรอบใหม่หลัง Last_Check_Date;
            // ก่อนตรวจครั้งแรกยังใช้ Next_Check_Shot แบบยอดสะสมเดิม
            const needsCheck = shotState.needsCheck !== undefined
                ? !!shotState.needsCheck
                : (nextCheckShot > 0 && actualShots >= nextCheckShot);
            partLocationsCache[pid].push({
                machine: inst.Machine,
                actualShots: actualShots,
                actualDays: actualDays,
                installId: inst.Install_ID,
                lifeShots: lifeShots,
                effectiveLife: effectiveLife,
                carried: carried,
                carriedDays: carriedDays,
                checkInterval: checkInterval,
                checkCount: checkCount,
                nextCheckShot: nextCheckShot,
                needsCheck: needsCheck,
                partName: inst.Part_Name || ''
            });
        });

        renderPartsTable();
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-red-500 py-4">โหลดข้อมูลไม่สำเร็จ</td></tr>';
    }
};

function renderPartsTable() {
    const tbody = document.getElementById('parts-table-body');
    if (partsCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-400 py-4">ยังไม่มีข้อมูลอะไหล่ กรุณาเพิ่มรายการ</td></tr>';
        return;
    }
    let html = '';
    partsCache.forEach(p => {
        const life = parseInt(p.Life_Shots) || 0;
        const cost = parseFloat(p.Unit_Cost) || 0;
        const installations = partLocationsCache[p.Part_ID] || [];
        // สร้าง Location HTML — แสดง machine + actual shots ต่อ installation
        const removed = partRemovedCache[p.Part_ID];
        let locationHtml;
        if (installations.length === 0) {
            if (removed && removed.machine) {
                locationHtml = `<span class="inline-block bg-gray-100 text-gray-400 text-xs px-1.5 py-0.5 rounded font-mono line-through" title="ถอดออกแล้ว ${removed.replacedDate || ''}">${removed.machine}</span>`;
            } else {
                locationHtml = '<span class="text-gray-300 text-xs">-</span>';
            }
        } else {
            const escName = escAttr(p.Part_Name);
            locationHtml = '<div class="flex flex-wrap gap-1">' + installations.map(inst => {
                const effLife = inst.effectiveLife || inst.lifeShots;
                const pct = effLife > 0 ? Math.min((inst.actualShots / effLife) * 100, 100) : 0;
                let color;
                if (inst.needsCheck) color = 'bg-orange-100 text-orange-700 hover:bg-orange-200';
                else if (pct >= 95) color = 'bg-red-100 text-red-700 hover:bg-red-200';
                else if (pct >= 80) color = 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200';
                else color = 'bg-green-100 text-green-700 hover:bg-green-200';
                const checkMark = inst.needsCheck ? ' 🔍' : (inst.checkCount > 0 ? ' ✅' : '');
                return `<button type="button" onclick="window.promptReplacepart('${inst.installId}', '${inst.machine}', '${p.Part_ID}', '${escName}', ${inst.lifeShots || 0})" title="คลิกเพื่อเปลี่ยน / ย้ายอะไหล่ตัวนี้${inst.needsCheck ? ' (ต้องตรวจเช็ค)' : ''}" class="inline-block ${color} text-xs px-1.5 py-0.5 rounded font-mono cursor-pointer transition">${escHtml(inst.machine)}${checkMark}</button>`;
            }).join('') + '</div>';
        }
        // Actual Shot + Actual Days รวมทุกเครื่อง
        const totalActualShots = installations.reduce((sum, inst) => sum + inst.actualShots, 0);
        const maxActualDays = installations.reduce((mx, inst) => Math.max(mx, inst.actualDays || 0), 0);
        const totalEffectiveLife = installations.length === 1 ? (installations[0].effectiveLife || life) : life;
        const pctTotal = totalEffectiveLife > 0 && installations.length === 1 ? Math.min((totalActualShots / totalEffectiveLife) * 100, 100) : 0;
        const anyNeedsCheck = installations.some(i => i.needsCheck);
        const totalCheckCount = installations.reduce((mx, i) => Math.max(mx, i.checkCount || 0), 0);
        let shotColor;
        if (anyNeedsCheck) shotColor = 'text-orange-600 font-bold';
        else if (pctTotal >= 95) shotColor = 'text-red-600 font-bold';
        else if (pctTotal >= 80) shotColor = 'text-yellow-600 font-bold';
        else shotColor = 'text-gray-700';
        let checkBadge = '';
        if (anyNeedsCheck) {
            checkBadge = '<div class="text-[10px] text-orange-600 font-bold">🔍 ต้องตรวจเช็ค</div>';
        } else if (totalCheckCount > 0) {
            checkBadge = `<div class="text-[10px] text-green-600 font-bold">✅ ตรวจผ่าน ${totalCheckCount} ครั้ง</div>`;
        }
        const shotHtml = installations.length > 0
            ? `<div><span class="${shotColor} font-mono">${totalActualShots.toLocaleString()}</span><div class="text-[10px] text-gray-500 font-mono">${maxActualDays.toLocaleString()} วัน</div>${checkBadge}</div>`
            : removed
                ? `<div><span class="text-gray-500 font-mono">${removed.carriedShots.toLocaleString()}</span><div class="text-[10px] text-gray-400 font-mono">${removed.carriedDays.toLocaleString()} วัน</div><div class="text-[10px] text-gray-400">📤 ถอดแล้ว${removed.replacedDate ? ` ${removed.replacedDate}` : ''}</div></div>`
                : '<span class="text-gray-300">-</span>';

        // ปุ่ม 🔍 ตรวจเช็ค — แสดงเฉพาะกรณีมี active installation
        const escNameAction = escAttr(p.Part_Name);
        const checkBtnHtml = installations.length > 0
            ? installations.map(inst => {
                const highlight = inst.needsCheck ? 'text-orange-600 font-bold' : 'text-orange-500';
                return `<button onclick="window.openCheckPartDialog('${inst.installId}', '${p.Part_ID}', '${escNameAction}', '${inst.machine}', ${inst.actualShots}, ${inst.lifeShots}, ${inst.nextCheckShot}, ${inst.checkInterval})" class="${highlight} hover:underline text-xs mr-1" title="ตรวจเช็คอะไหล่ที่ติดตั้งบน ${escHtml(inst.machine)}">🔍 เช็ค(${escHtml(inst.machine)})</button><button onclick="window.uninstallPart('${inst.installId}', '${inst.machine}', '${escNameAction}')" class="text-red-400 hover:text-red-600 hover:underline text-xs mr-2" title="ถอดอะไหล่ออกจาก ${escHtml(inst.machine)}">⏏️ ถอด(${escHtml(inst.machine)})</button>`;
            }).join('')
            : '';

        html += `<tr class="border-b hover:bg-gray-50">
            <td class="p-2 font-mono text-xs text-gray-500">${escHtml(p.Part_ID)}</td>
            <td class="p-2 font-bold">${escHtml(p.Part_Name) || '-'}</td>
            <td class="p-2"><span class="bg-cyan-100 text-cyan-700 text-xs px-2 py-0.5 rounded-full">${escHtml(p.Category) || '-'}</span></td>
            <td class="p-2 text-right font-mono">${life > 0 ? life.toLocaleString() : '-'}</td>
            <td class="p-2 text-right text-xs">${shotHtml}</td>
            <td class="p-2 text-right font-mono">${cost > 0 ? cost.toLocaleString(undefined, {minimumFractionDigits: 0}) : '-'}</td>
            <td class="p-2 text-xs text-gray-600">${escHtml(p.Supplier) || '-'}</td>
            <td class="p-2">${locationHtml}</td>
            <td class="p-2 text-center whitespace-nowrap">
                ${checkBtnHtml}
                <button onclick="window.showPartHistory('${p.Part_ID}', '${escAttr(p.Part_Name)}')" class="text-teal-600 hover:underline text-xs mr-2">🗓️ ประวัติ</button>
                <button onclick="window.openInstallPartDialog('${p.Part_ID}', '${escAttr(p.Part_Name)}', ${life})" class="text-cyan-600 hover:underline text-xs mr-2">🔧 ติดตั้ง</button>
                <button onclick="window.editPart('${p.Part_ID}')" class="text-blue-600 hover:underline text-xs mr-2">✏️ แก้ไข</button>
                <button onclick="window.deletePart('${p.Part_ID}', '${escAttr(p.Part_Name)}')" class="text-red-600 hover:underline text-xs">🗑️ ลบ</button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

// ฟอร์มเพิ่ม/แก้ไขอะไหล่
document.getElementById('parts-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-part');
    const origText = btn.innerText;
    btn.disabled = true;
    btn.innerText = '⏳ กำลังบันทึก...';

    const editId = document.getElementById('parts-edit-id').value;
    const checkIntervalEl = document.getElementById('parts-check-interval');
    const payload = {
        action: 'SAVE_PARTS_MASTER',
        mode: editId ? 'edit' : 'new',
        recorder: (window.currentUser && window.currentUser.name) || 'System',
        part: {
            Part_ID: editId || '',
            Part_Name: document.getElementById('parts-name').value.trim(),
            Category: document.getElementById('parts-category').value,
            Life_Shots: document.getElementById('parts-life').value || 0,
            Unit_Cost: document.getElementById('parts-cost').value || 0,
            Supplier: document.getElementById('parts-supplier').value.trim(),
            Remark: document.getElementById('parts-remark').value.trim(),
            Check_Interval_Shots: checkIntervalEl ? (checkIntervalEl.value || 0) : 0
        }
    };

    try {
        const res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
        const result = await res.json();
        if (result.status === 'success') {
            window.cancelPartEdit();
            window.loadPartsMaster();
        } else {
            alert('บันทึกไม่สำเร็จ: ' + (result.message || ''));
        }
    } catch (err) {
        alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = origText;
    }
});

window.editPart = function(partId) {
    const p = partsCache.find(x => x.Part_ID === partId);
    if (!p) return;
    document.getElementById('parts-edit-id').value = p.Part_ID;
    document.getElementById('parts-name').value = p.Part_Name || '';
    document.getElementById('parts-category').value = p.Category || 'Other';
    document.getElementById('parts-life').value = p.Life_Shots || '';
    document.getElementById('parts-cost').value = p.Unit_Cost || '';
    document.getElementById('parts-supplier').value = p.Supplier || '';
    document.getElementById('parts-remark').value = p.Remark || '';
    const ci = document.getElementById('parts-check-interval');
    if (ci) ci.value = p.Check_Interval_Shots || '';
    document.getElementById('btn-save-part').innerText = '💾 บันทึกแก้ไข';
    document.getElementById('btn-cancel-part').classList.remove('hidden');
    document.getElementById('parts-name').focus();
};

window.cancelPartEdit = function() {
    document.getElementById('parts-edit-id').value = '';
    document.getElementById('parts-form').reset();
    document.getElementById('btn-save-part').innerText = '+ เพิ่มอะไหล่';
    document.getElementById('btn-cancel-part').classList.add('hidden');
};

window.deletePart = async function(partId, partName) {
    if (!confirm(`ต้องการลบอะไหล่ "${partName}" (${partId}) ใช่หรือไม่?`)) return;
    try {
        const recorder = (window.currentUser && window.currentUser.name) || 'System';
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'DELETE_PARTS_MASTER', partId: partId, recorder: recorder })
        });
        const result = await res.json();
        if (result.status === 'success') {
            window.loadPartsMaster();
        } else {
            alert('ลบไม่สำเร็จ: ' + (result.message || ''));
        }
    } catch (err) {
        alert('เกิดข้อผิดพลาด: ' + err.message);
    }
};

// === ระบบติดตั้งอะไหล่ (Installation) ===
// installDate: "yyyy-MM-dd HH:mm" (optional, ถ้าไม่ส่ง backend จะใช้เวลาปัจจุบัน)
// Install_Shot ถูกคำนวณฝั่ง backend ตามวันที่ติดตั้ง
window.installPartToMachine = async function(machine, partId, partName, lifeShots, maintJobId, installDate) {
    const recorder = (window.currentUser && window.currentUser.name) || 'System';
    const payload = {
        action: 'SAVE_PARTS_INSTALLATION',
        mode: 'new',
        installation: {
            Machine: machine,
            Part_ID: partId,
            Part_Name: partName,
            Life_Shots: lifeShots,
            Maint_Job_ID: maintJobId || '',
            Recorder: recorder,
            Install_Date: installDate || ''
        }
    };

    const res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
    return await res.json();
};

window.replacePartOnMachine = async function(installId, machine, partId, partName, lifeShots, maintJobId, installDate) {
    const recorder = (window.currentUser && window.currentUser.name) || 'System';
    const payload = {
        action: 'SAVE_PARTS_INSTALLATION',
        mode: 'replace',
        installation: {
            Install_ID: installId,
            Machine: machine,
            Part_ID: partId,
            Part_Name: partName,
            Life_Shots: lifeShots,
            Maint_Job_ID: maintJobId || '',
            Recorder: recorder,
            Install_Date: installDate || ''
        }
    };

    const res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
    return await res.json();
};

// === แสดงอะไหล่ของเครื่องใน Machine Detail (Tab) ===
window.loadMachineParts = async function(machine) {
    const container = document.getElementById('md-section-parts');
    if (!container) return;
    container.innerHTML = '<div class="text-center text-gray-400 py-8">⏳ กำลังโหลดข้อมูลอะไหล่...</div>';

    try {
        // โหลด Installation + Shot ปัจจุบัน พร้อมกัน
        const [instRes, shotRes] = await Promise.all([
            fetchPartsJson({ action: 'GET_PARTS_INSTALLATION', machine: machine }),
            fetchPartsJson({ action: 'GET_MACHINE_SHOTS', machine: machine, sinceDate: '2020-01-01' })
        ]);
        const instData = await instRes.json();
        const shotData = await shotRes.json();
        const installations = (instData.data || []).filter(x => String(x.Status || '').trim() === 'Active');
        const totalShots = shotData.totalShots || 0;
        const installationShots = instData.installationShots || {};

        if (installations.length === 0) {
            container.innerHTML = `<div class="text-center py-8">
                <p class="text-gray-400 mb-2">ยังไม่มีอะไหล่ที่ติดตั้งในเครื่องนี้</p>
                <p class="text-xs text-gray-400">Shot สะสม: <b>${totalShots.toLocaleString()}</b></p>
            </div>`;
            return;
        }

        let html = `<div class="text-xs text-gray-500 mb-2 px-2">Shot สะสมทั้งหมด: <b class="text-gray-800">${totalShots.toLocaleString()}</b> (FG+NG)</div>`;
        html += '<div class="space-y-2 px-2">';
        installations.forEach(inst => {
            const installShot = parseInt(inst.Install_Shot) || 0;
            const lifeShots = parseInt(inst.Life_Shots) || 0;
            const carried = parseInt(inst.Carried_Shots) || 0;
            const shotState = installationShots[inst.Install_ID] || {};
            const usedShots = shotState.totalUsedShots !== undefined
                ? shotState.totalUsedShots
                : carried + Math.max(0, totalShots - installShot);
            // Actual Days = Carried_Days + จำนวนวันที่อยู่บนเครื่องปัจจุบัน
            const carriedDays = parseInt(inst.Carried_Days) || 0;
            const installDateStr = extractInstallDateStr(inst.Install_Date);
            const daysOnMachine = daysFromInstall(installDateStr);
            const actualDays = carriedDays + daysOnMachine;
            // Check fields
            const checkInterval = parseInt(inst.Check_Interval_Shots) || 0;
            const nextCheckShot = parseInt(inst.Next_Check_Shot) || 0;
            const checkCount = parseInt(inst.Check_Count) || 0;
            const effectiveLife = lifeShots > 0 ? lifeShots * (checkCount + 1) : 0;
            const pct = effectiveLife > 0 ? Math.min((usedShots / effectiveLife) * 100, 100) : 0;
            const remaining = effectiveLife > 0 ? Math.max(effectiveLife - usedShots, 0) : 0;
            const lastCheckDate = shotState.lastCheckDate || (inst.Last_Check_Date ? extractInstallDateStr(inst.Last_Check_Date) : '');
            const inspectionShots = shotState.shotsSinceLastCheck !== undefined ? shotState.shotsSinceLastCheck : usedShots;
            const checkThresholdShots = shotState.checkThresholdShots !== undefined ? shotState.checkThresholdShots : nextCheckShot;
            const needsCheck = shotState.needsCheck !== undefined
                ? !!shotState.needsCheck
                : (nextCheckShot > 0 && usedShots >= nextCheckShot);
            const shotsToNextCheck = checkThresholdShots > 0 ? Math.max(0, checkThresholdShots - inspectionShots) : 0;

            // สถานะ: 🔴 (≥95%) > 🟡 (≥80%) > 🟠 (needsCheck) > 🟢
            let statusColor = 'bg-green-500'; let statusText = '🟢 ปกติ'; let statusTextColor = 'text-green-600';
            if (pct >= 95) { statusColor = 'bg-red-500'; statusText = '🔴 ต้องเปลี่ยน'; statusTextColor = 'text-red-600 font-bold'; }
            else if (pct >= 80) { statusColor = 'bg-yellow-500'; statusText = '🟡 ใกล้หมดอายุ'; statusTextColor = 'text-yellow-600 font-bold'; }
            else if (needsCheck) { statusColor = 'bg-orange-500'; statusText = '🟠 ต้องตรวจเช็ค'; statusTextColor = 'text-orange-600 font-bold'; }

            const installDateDisplay = formatInstallDateTime(inst.Install_Date);
            const escName = escAttr(inst.Part_Name);
            const checkBtnClass = needsCheck ? 'text-orange-600 font-bold animate-pulse' : 'text-orange-500';
            html += `<div data-install-id="${inst.Install_ID}" class="border rounded-lg p-3 bg-white ${needsCheck ? 'border-orange-400 bg-orange-50' : ''}">
                <div class="flex justify-between items-center mb-1">
                    <span class="font-bold text-sm">${escHtml(inst.Part_Name || inst.Part_ID)}${inst.Part_ID ? ` <span class="text-[10px] text-gray-400 font-mono font-normal">(${escHtml(inst.Part_ID)})</span>` : ''}</span>
                    <span class="text-xs ${statusTextColor}">${statusText}</span>
                </div>
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                    <span>ติดตั้ง: ${installDateDisplay}</span>
                    <span>Actual: <b>${usedShots.toLocaleString()}</b>${carried > 0 ? ` (สะสม ${carried.toLocaleString()})` : ''} / ${effectiveLife > 0 ? effectiveLife.toLocaleString() : '∞'} shot${checkCount > 0 && lifeShots > 0 ? ` <span class="text-green-600">(Life ${lifeShots.toLocaleString()} × ${checkCount + 1})</span>` : ''}</span>
                </div>
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                    <span>&nbsp;</span>
                    <span>ระยะเวลาใช้งาน: <b>${actualDays.toLocaleString()}</b> วัน${carriedDays > 0 ? ` (สะสม ${carriedDays.toLocaleString()} วัน)` : ''}</span>
                </div>
                ${checkThresholdShots > 0 ? `<div class="flex justify-between text-xs text-gray-500 mb-1">
                    <span>ตรวจเช็คครั้งล่าสุด: ${lastCheckDate || '-'} (ตรวจแล้ว ${checkCount} ครั้ง)</span>
                    <span class="${needsCheck ? 'text-orange-600 font-bold' : ''}">${lastCheckDate ? 'Shot หลังตรวจล่าสุด' : 'Next check'}: <b>${checkThresholdShots.toLocaleString()}</b>${needsCheck ? ' (ถึงเกณฑ์แล้ว)' : ` (อีก ${shotsToNextCheck.toLocaleString()} shot)`}</span>
                </div>` : ''}
                ${lifeShots > 0 ? `<div class="w-full bg-gray-200 rounded-full h-2 mb-1">
                    <div class="${statusColor} h-2 rounded-full transition-all" style="width: ${pct.toFixed(1)}%"></div>
                </div>
                <div class="flex justify-between text-xs text-gray-400">
                    <span>${pct.toFixed(1)}%</span>
                    <span>เหลือ: ${remaining.toLocaleString()} shot</span>
                </div>` : ''}
                <div class="flex gap-2 mt-2 flex-wrap">
                    <button onclick="window.openCheckPartDialog('${inst.Install_ID}', '${inst.Part_ID}', '${escName}', '${machine}', ${usedShots}, ${lifeShots}, ${nextCheckShot}, ${checkInterval})" class="text-xs ${checkBtnClass} hover:underline">🔍 ตรวจเช็ค</button>
                    <button onclick="window.showCheckHistory('${inst.Install_ID}', '${escName}', '${inst.Part_ID}')" class="text-xs text-gray-600 hover:underline">📋 ประวัติ${checkCount > 0 ? ` (${checkCount})` : ''}</button>
                    <button onclick="window.promptReplacepart('${inst.Install_ID}', '${machine}', '${inst.Part_ID}', '${escName}', ${lifeShots})" class="text-xs text-orange-600 hover:underline">🔄 เปลี่ยน / ย้าย</button>
                    <button onclick="window.uninstallPart('${inst.Install_ID}', '${machine}', '${escName}')" class="text-xs text-red-500 hover:underline">⏏️ ถอดออก</button>
                    <button onclick="window.promptUpdateLife('${inst.Install_ID}', ${lifeShots})" class="text-xs text-blue-600 hover:underline">📏 ปรับอายุ</button>
                </div>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="text-center text-red-500 py-4">โหลดข้อมูลไม่สำเร็จ: ' + err.message + '</div>';
    }
};

// เปิด dialog สำหรับเปลี่ยน/ย้ายอะไหล่ (ใช้ modal เดียวกับ install ใหม่)
window.uninstallPart = async function(installId, machine, partName) {
    if (!confirm(`⚠️ ยืนยันถอดอะไหล่ "${partName}" ออกจากเครื่อง ${machine}?\n\nอะไหล่จะถูกเปลี่ยนสถานะเป็น "Removed" โดยไม่ติดตั้งเครื่องอื่น`)) return;
    try {
        const recorder = (window.currentUser && window.currentUser.name) || 'System';
        const res = await fetchPartsJson({ action: 'UNINSTALL_PART', installId: installId, recorder: recorder });
        const result = await res.json();
        if (result.status === 'success') {
            alert('✅ ถอดอะไหล่สำเร็จ');
            document.querySelectorAll(`[data-install-id="${installId}"]`).forEach(el => el.remove());
            await Promise.all([
                (typeof window.loadMachineParts === 'function') ? window.loadMachineParts(machine) : Promise.resolve(),
                (typeof window.loadPartsMaster === 'function') ? window.loadPartsMaster() : Promise.resolve()
            ]);
        } else {
            alert('เกิดข้อผิดพลาด: ' + (result.message || ''));
        }
    } catch (err) {
        alert('เกิดข้อผิดพลาด: ' + err.message);
    }
};

window.promptReplacepart = function(installId, machine, partId, partName, lifeShots) {
    window.openInstallPartDialog(partId, partName, lifeShots, {
        prevInstallId: installId,
        currentMachine: machine
    });
};

window.promptUpdateLife = async function(installId, currentLife) {
    const newLife = prompt(`ปรับอายุการใช้งาน (Shot):\nค่าปัจจุบัน: ${currentLife.toLocaleString()}`, currentLife);
    if (newLife === null) return;
    const val = parseInt(newLife);
    if (isNaN(val) || val < 0) { alert('กรุณาใส่ตัวเลขที่ถูกต้อง'); return; }
    try {
        const recorder = (window.currentUser && window.currentUser.name) || 'System';
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'UPDATE_PARTS_LIFE', installId: installId, lifeShots: val, recorder: recorder })
        });
        const result = await res.json();
        if (result.status === 'success') {
            alert('✅ ปรับอายุสำเร็จ (sync Parts Master + Installation เรียบร้อย)');
            // reload ทั้ง Machine Detail tab + Parts Master table
            const macTitle = document.getElementById('machine-detail-title');
            if (macTitle) {
                const mac = macTitle.innerText.match(/CWM-\d+/);
                if (mac) window.loadMachineParts(mac[0]);
            }
            if (typeof window.loadPartsMaster === 'function') window.loadPartsMaster();
        } else {
            alert('เกิดข้อผิดพลาด: ' + (result.message || ''));
        }
    } catch (err) {
        alert('เกิดข้อผิดพลาด: ' + err.message);
    }
};

// === Dialog: ติดตั้ง / เปลี่ยน / ย้ายอะไหล่ ===
// options: { prevInstallId, currentMachine } — ถ้าส่งมา = เปลี่ยน/ย้าย (mode=replace)
window.openInstallPartDialog = function(partId, partName, lifeShots, options) {
    options = options || {};
    const modal = document.getElementById('modal-install-part');
    if (!modal) return;

    const prevInstallId = options.prevInstallId || '';
    const currentMachine = options.currentMachine || '';
    const isReplaceMode = !!prevInstallId;

    document.getElementById('install-part-id').value = partId;
    document.getElementById('install-part-life-val').value = lifeShots || 0;
    document.getElementById('install-prev-id').value = prevInstallId;
    document.getElementById('install-part-name').innerText = partName || partId;
    document.getElementById('install-part-life').innerText = (parseInt(lifeShots) || 0).toLocaleString();
    document.getElementById('install-maint-job').value = '';

    // ปรับ title + ปุ่ม + hint ตาม mode
    const titleEl = document.getElementById('install-modal-title');
    const btnEl = document.getElementById('btn-confirm-install');
    const hintEl = document.getElementById('install-move-hint');
    const prevMacEl = document.getElementById('install-prev-machine');
    if (isReplaceMode) {
        if (titleEl) titleEl.innerText = '🔄 เปลี่ยน / ย้ายอะไหล่';
        if (btnEl) btnEl.innerText = '✅ ยืนยัน';
        if (prevMacEl) prevMacEl.innerText = currentMachine || '-';
        if (hintEl) hintEl.classList.remove('hidden');
    } else {
        if (titleEl) titleEl.innerText = '🔧 ติดตั้งอะไหล่กับเครื่อง';
        if (btnEl) btnEl.innerText = '✅ ยืนยันติดตั้ง';
        if (hintEl) hintEl.classList.add('hidden');
    }

    // แสดงข้อมูล carry-over จาก Removed record (ถ้ามี) เพื่อให้ผู้ใช้รู้ว่า Shot จะยกยอดมา
    const carryHintEl = document.getElementById('install-carry-hint');
    if (carryHintEl && !isReplaceMode) {
        const removed = partRemovedCache[partId];
        if (removed && removed.carriedShots > 0) {
            carryHintEl.innerHTML = `<div class="text-xs bg-blue-50 border border-blue-200 rounded px-2 py-1 text-blue-700">📊 ยกยอด Shot สะสมจากการใช้งานก่อนหน้า: <b>${removed.carriedShots.toLocaleString()}</b> shot (${removed.carriedDays.toLocaleString()} วัน)${removed.machine ? ` จากเครื่อง ${removed.machine}` : ''}</div>`;
            carryHintEl.classList.remove('hidden');
        } else {
            carryHintEl.classList.add('hidden');
        }
    } else if (carryHintEl) {
        carryHintEl.classList.add('hidden');
    }

    // ตั้งค่า date + time (24h) เป็นเวลาปัจจุบัน (local timezone)
    const dateInput = document.getElementById('install-date');
    const timeInput = document.getElementById('install-time');
    if (dateInput && timeInput) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        dateInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        timeInput.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }

    // populate machine dropdown จาก machineMapping (fallback: localStorage)
    const sel = document.getElementById('install-machine-select');
    let mapping = (typeof machineMapping !== 'undefined' && machineMapping) ? machineMapping : {};
    if (Object.keys(mapping).length === 0) {
        try {
            const cached = localStorage.getItem('CWM_MACHINE_MAPPING');
            if (cached) mapping = JSON.parse(cached) || {};
        } catch (e) { /* ignore */ }
    }
    const machines = Object.keys(mapping).sort();
    sel.innerHTML = '<option value="">-- เลือกเครื่อง --</option>' +
        machines.map(m => {
            const label = (isReplaceMode && m === currentMachine) ? `${m} (เครื่องเดิม)` : m;
            return `<option value="${m}">${label}</option>`;
        }).join('');
    // ถ้าเป็น replace/move mode: default เลือกเครื่องเดิมไว้ก่อน (ผู้ใช้เปลี่ยนได้)
    if (isReplaceMode && currentMachine) sel.value = currentMachine;

    modal.classList.remove('hidden');
};

window.confirmInstallPart = async function() {
    const partId = document.getElementById('install-part-id').value;
    const partName = document.getElementById('install-part-name').innerText;
    const lifeShots = parseInt(document.getElementById('install-part-life-val').value) || 0;
    const machine = document.getElementById('install-machine-select').value;
    const maintJobId = document.getElementById('install-maint-job').value.trim();
    const prevInstallId = document.getElementById('install-prev-id').value;
    // รวม date + time (24h HH:MM) -> "yyyy-MM-dd HH:mm"
    const dateVal = (document.getElementById('install-date') || {}).value || '';
    const timeVal = ((document.getElementById('install-time') || {}).value || '').trim();
    const installDate = (dateVal && timeVal) ? `${dateVal} ${timeVal}` : '';

    if (!machine) { alert('กรุณาเลือกเครื่อง'); return; }
    if (!partId) { alert('ไม่พบรหัสอะไหล่'); return; }
    if (!dateVal) { alert('กรุณาเลือกวันติดตั้ง'); return; }
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(timeVal)) {
        alert('กรุณากรอกเวลาเป็นรูปแบบ 24 ชม. เช่น 14:30');
        return;
    }

    const btn = document.getElementById('btn-confirm-install');
    const origText = btn.innerText;
    btn.disabled = true;
    btn.innerText = prevInstallId ? '⏳ กำลังบันทึก...' : '⏳ กำลังติดตั้ง...';
    try {
        const result = prevInstallId
            ? await window.replacePartOnMachine(prevInstallId, machine, partId, partName, lifeShots, maintJobId, installDate)
            : await window.installPartToMachine(machine, partId, partName, lifeShots, maintJobId, installDate);
        if (result && result.status === 'success') {
            document.getElementById('modal-install-part').classList.add('hidden');
            const shotInfo = (result.installShot !== undefined) ? ` (เริ่มนับจาก ${Number(result.installShot).toLocaleString()} shot)` : '';
            const carriedInfo = (result.carriedShots !== undefined && result.carriedShots > 0)
                ? `\n📊 ยอด shot สะสมยกมา: ${Number(result.carriedShots).toLocaleString()}`
                : '';
            const carriedDaysInfo = (result.carriedDays !== undefined && result.carriedDays > 0)
                ? `\n📅 จำนวนวันใช้งานสะสมยกมา: ${Number(result.carriedDays).toLocaleString()} วัน`
                : '';
            const actionTxt = prevInstallId ? 'บันทึกการเปลี่ยน/ย้ายอะไหล่' : 'ติดตั้ง';
            alert(`✅ ${actionTxt} "${partName}" กับ ${machine} สำเร็จ${shotInfo}${carriedInfo}${carriedDaysInfo}`);
            // refresh view ที่เกี่ยวข้อง
            if (typeof window.loadPartsMaster === 'function') window.loadPartsMaster();
            if (prevInstallId && typeof window.loadMachineParts === 'function') {
                const macTitle = document.getElementById('machine-detail-title');
                if (macTitle) {
                    const mac = macTitle.innerText.match(/CWM-\d+/);
                    if (mac) window.loadMachineParts(mac[0]);
                }
            }
        } else {
            alert('ไม่สำเร็จ: ' + ((result && result.message) || ''));
        }
    } catch (err) {
        alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = origText;
    }
};

// ==========================================
// 🔍 Parts Check / Inspection
// ==========================================

// Client-side image resize (Canvas) → base64 JPEG
// maxWidth: width เป้าหมาย (max 1280), quality: 0.75
async function resizeImageToBase64(file, maxWidth = 1280, quality = 0.75) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => reject(new Error('Image load error'));
            img.onload = () => {
                const ratio = Math.min(maxWidth / img.width, 1);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * ratio);
                canvas.height = Math.round(img.height * ratio);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const base64 = canvas.toDataURL('image/jpeg', quality);
                resolve(base64);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Store selected photos' base64 during check dialog session
let checkPhotosStore = [];  // array of { name, size, base64 }

window.openCheckPartDialog = async function(installId, partId, partName, machine, actualShots, lifeShots, nextCheckShot, checkInterval) {
    const modal = document.getElementById('modal-check-part');
    if (!modal) { alert('ไม่พบ modal ฟอร์มตรวจเช็ค'); return; }

    // Reset state
    checkPhotosStore = [];
    document.getElementById('check-install-id').value = installId;
    document.getElementById('check-part-id').value = partId;
    document.getElementById('check-part-name').value = partName;
    document.getElementById('check-machine').value = machine;
    document.getElementById('check-actual-shot').value = actualShots;
    document.getElementById('check-life-shot').value = lifeShots;
    document.getElementById('check-interval').value = checkInterval || 0;

    // Header info
    document.getElementById('check-title-name').innerText = `${partName} (${partId})`;
    document.getElementById('check-info-machine').innerText = machine;
    document.getElementById('check-info-actual').innerText = Number(actualShots).toLocaleString();
    document.getElementById('check-info-life').innerText = lifeShots > 0 ? Number(lifeShots).toLocaleString() : '∞';
    const pct = lifeShots > 0 ? Math.min((actualShots / lifeShots) * 100, 100) : 0;
    document.getElementById('check-info-pct').innerText = pct.toFixed(1) + '%';

    // Default: Passed, Next_Check_Shot = actualShots + checkInterval
    const passedRadio = document.getElementById('check-result-passed');
    const replacedRadio = document.getElementById('check-result-replaced');
    if (passedRadio) passedRadio.checked = true;
    if (replacedRadio) replacedRadio.checked = false;
    document.getElementById('check-note').value = '';
    const nextInput = document.getElementById('check-next-shot');
    // ถ้าไม่เคยตั้ง Check_Interval_Shots ไว้ ให้ fallback เป็นอายุใช้งานเต็มรอบแทนค่า 0
    // (ป้องกัน Next_Check_Shot ค้างที่ 0 ตลอดไป ทำให้อะไหล่ไม่เด้งเข้าคิว "รอตรวจเช็ค" อีกเลย)
    const fallbackInterval = checkInterval > 0 ? checkInterval : (lifeShots > 0 ? lifeShots : 0);
    const defaultNext = fallbackInterval > 0 ? (actualShots + fallbackInterval) : (nextCheckShot || 0);
    if (nextInput) nextInput.value = defaultNext;

    // Reset file input + preview
    const fileInput = document.getElementById('check-photo-input');
    if (fileInput) fileInput.value = '';
    window.renderCheckPhotoPreview();

    // แสดง/ซ่อน next check shot section ตาม radio
    window.toggleCheckResultFields();

    modal.classList.remove('hidden');
};

window.toggleCheckResultFields = function() {
    const passed = document.getElementById('check-result-passed');
    const nextSection = document.getElementById('check-next-shot-section');
    if (!passed || !nextSection) return;
    if (passed.checked) nextSection.classList.remove('hidden');
    else nextSection.classList.add('hidden');
};

window.closeCheckDialog = function() {
    const modal = document.getElementById('modal-check-part');
    if (modal) modal.classList.add('hidden');
    checkPhotosStore = [];
};

// เลือกรูป → resize แล้วเก็บใน store
window.handleCheckPhotoSelect = async function(event) {
    const files = Array.from(event.target.files || []);
    const MAX_PHOTOS = 5;
    if (checkPhotosStore.length + files.length > MAX_PHOTOS) {
        alert(`เลือกรูปได้สูงสุด ${MAX_PHOTOS} รูป (เลือกแล้ว ${checkPhotosStore.length} รูป)`);
        event.target.value = '';
        return;
    }

    const statusEl = document.getElementById('check-photo-status');
    if (statusEl) statusEl.innerText = `⏳ กำลังย่อรูป ${files.length} รูป...`;

    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        try {
            const base64 = await resizeImageToBase64(file, 1280, 0.75);
            // Estimate size: base64 length * 0.75 bytes
            const sizeKB = Math.round((base64.length * 0.75) / 1024);
            checkPhotosStore.push({ name: file.name, size: sizeKB, base64: base64 });
        } catch (err) {
            console.error('Resize error:', err);
            alert('ไม่สามารถย่อรูป ' + file.name + ' ได้');
        }
    }

    event.target.value = '';
    if (statusEl) statusEl.innerText = '';
    window.renderCheckPhotoPreview();
};

window.renderCheckPhotoPreview = function() {
    const container = document.getElementById('check-photo-preview');
    if (!container) return;
    if (checkPhotosStore.length === 0) {
        container.innerHTML = '<div class="text-xs text-gray-400 p-2">ยังไม่มีรูป — กดเลือกรูป (สูงสุด 5 รูป)</div>';
        return;
    }
    let html = '<div class="grid grid-cols-3 sm:grid-cols-5 gap-2">';
    checkPhotosStore.forEach((p, idx) => {
        html += `<div class="relative border rounded bg-gray-50">
            <img src="${p.base64}" class="w-full h-20 object-cover rounded" />
            <button type="button" onclick="window.removeCheckPhoto(${idx})" class="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 text-xs leading-5" title="ลบ">×</button>
            <div class="text-[9px] text-gray-500 text-center p-0.5">${p.size} KB</div>
        </div>`;
    });
    html += '</div>';
    html += `<div class="text-xs text-gray-500 mt-1">รวม ${checkPhotosStore.length} รูป (${checkPhotosStore.reduce((s,p)=>s+p.size,0)} KB)</div>`;
    container.innerHTML = html;
};

window.removeCheckPhoto = function(idx) {
    checkPhotosStore.splice(idx, 1);
    window.renderCheckPhotoPreview();
};

window.submitPartCheck = async function() {
    const installId = document.getElementById('check-install-id').value;
    const partId = document.getElementById('check-part-id').value;
    const partName = document.getElementById('check-part-name').value;
    const machine = document.getElementById('check-machine').value;
    const actualShot = parseInt(document.getElementById('check-actual-shot').value) || 0;
    const lifeShots = parseInt(document.getElementById('check-life-shot').value) || 0;
    const result = document.getElementById('check-result-passed').checked ? 'Passed' : 'Replaced';
    const note = document.getElementById('check-note').value.trim();
    const nextCheckShot = result === 'Passed' ? (parseInt(document.getElementById('check-next-shot').value) || 0) : 0;

    if (result === 'Passed' && nextCheckShot > 0 && nextCheckShot <= actualShot) {
        alert('Next Check Shot ต้องมากกว่า Actual Shot ปัจจุบัน (' + actualShot.toLocaleString() + ')');
        return;
    }

    const btn = document.getElementById('btn-confirm-check');
    const origText = btn.innerText;
    btn.disabled = true;
    btn.innerText = '⏳ กำลังอัพโหลด...';

    try {
        // หา machine shot ปัจจุบัน จาก backend (เพื่อ snapshot)
        const shotRes = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'GET_MACHINE_SHOTS', machine: machine, sinceDate: '2020-01-01' })
        });
        const shotData = await shotRes.json();
        const machineShot = shotData.totalShots || 0;

        const recorder = (window.currentUser && window.currentUser.name) || 'System';
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const checkDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

        const payload = {
            action: 'SAVE_PARTS_CHECK',
            check: {
                Install_ID: installId,
                Part_ID: partId,
                Part_Name: partName,
                Machine: machine,
                Check_Date: checkDate,
                Machine_Shot: machineShot,
                Actual_Part_Shot: actualShot,
                Result: result,
                Note: note,
                Next_Check_Shot: nextCheckShot,
                Recorder: recorder
            },
            photos: checkPhotosStore.map(p => p.base64)
        };

        const res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.status !== 'success') {
            alert('บันทึกไม่สำเร็จ: ' + (data.message || ''));
            return;
        }

        alert(`✅ บันทึกการตรวจเช็คสำเร็จ\nCheck ID: ${data.checkId}\nรูป: ${(data.photoUrls || []).length} รูป`);
        window.closeCheckDialog();

        // Refresh Machine Detail + Parts Master
        if (typeof window.loadMachineParts === 'function' && machine) window.loadMachineParts(machine);
        if (typeof window.loadPartsMaster === 'function') window.loadPartsMaster();

        // ถ้า result=Replaced → เปิด dialog เปลี่ยน/ย้ายอะไหล่ต่อ
        if (result === 'Replaced') {
            setTimeout(() => {
                if (typeof window.promptReplacepart === 'function') {
                    window.promptReplacepart(installId, machine, partId, partName, lifeShots);
                }
            }, 300);
        }
    } catch (err) {
        alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = origText;
    }
};

// ประวัติการตรวจเช็ค
window.showCheckHistory = async function(installId, partName, partId) {
    const modal = document.getElementById('modal-check-history');
    if (!modal) { alert('ไม่พบ modal ประวัติ'); return; }
    const titleEl = document.getElementById('check-history-title');
    const bodyEl = document.getElementById('check-history-body');
    if (titleEl) titleEl.innerText = `📋 ประวัติการตรวจเช็ค: ${partName}`;
    if (bodyEl) bodyEl.innerHTML = '<div class="text-center text-gray-400 py-4">⏳ กำลังโหลด...</div>';
    modal.classList.remove('hidden');

    try {
        const payload = { action: 'GET_PARTS_CHECKS' };
        if (partId) { payload.partId = partId; } else { payload.installId = installId; }
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        const list = data.data || [];
        if (list.length === 0) {
            bodyEl.innerHTML = '<div class="text-center text-gray-400 py-6">ยังไม่มีประวัติการตรวจเช็ค</div>';
            return;
        }
        let html = '<div class="space-y-3">';
        list.forEach(c => {
            const resultBadge = c.Result === 'Passed'
                ? '<span class="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">✅ ใช้ต่อได้</span>'
                : '<span class="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">❌ ต้องเปลี่ยน</span>';
            const urls = String(c.Photo_URLs || '').split(',').filter(u => u.trim());
            let photoHtml = '';
            if (urls.length > 0) {
                photoHtml = '<div class="flex flex-wrap gap-1 mt-1">' + urls.map(u => {
                    // Google Drive URL transform: /file/d/ID/view → thumbnail
                    const m = u.match(/[-\w]{25,}/);
                    const thumbUrl = m ? `https://drive.google.com/thumbnail?id=${m[0]}&sz=w200` : u;
                    return `<a href="${u}" target="_blank"><img src="${thumbUrl}" class="w-16 h-16 object-cover border rounded hover:opacity-80" loading="lazy" /></a>`;
                }).join('') + '</div>';
            }
            html += `<div class="border rounded p-2 bg-gray-50">
                <div class="flex justify-between items-center text-xs text-gray-500 mb-1">
                    <span>${escHtml(formatInstallDateTime(c.Check_Date))}</span>
                    ${resultBadge}
                </div>
                <div class="text-xs text-gray-700 mb-1">Actual: <b>${Number(c.Actual_Part_Shot || 0).toLocaleString()}</b> shot${c.Next_Check_Shot > 0 ? ` → Next: <b>${Number(c.Next_Check_Shot).toLocaleString()}</b>` : ''}</div>
                ${c.Note ? `<div class="text-xs text-gray-600 italic">"${escHtml(c.Note)}"</div>` : ''}
                ${photoHtml}
                <div class="text-[10px] text-gray-400 mt-1">โดย ${escHtml(c.Recorder) || '-'}</div>
            </div>`;
        });
        html += '</div>';
        bodyEl.innerHTML = html;
    } catch (err) {
        bodyEl.innerHTML = '<div class="text-center text-red-500 py-4">โหลดประวัติไม่สำเร็จ: ' + err.message + '</div>';
    }
};

window.closeCheckHistory = function() {
    const modal = document.getElementById('modal-check-history');
    if (modal) modal.classList.add('hidden');
};

// ==========================================
// 🗓️ ประวัติการติดตั้ง (Installation Timeline)
// ==========================================

window.showPartHistory = async function(partId, partName) {
    const modal = document.getElementById('modal-part-history');
    if (!modal) { alert('ไม่พบ modal ประวัติการติดตั้ง'); return; }
    const titleEl = document.getElementById('part-history-title');
    const bodyEl = document.getElementById('part-history-body');
    if (titleEl) titleEl.innerText = `🗓️ ประวัติการติดตั้ง: ${partName} (${partId})`;
    if (bodyEl) bodyEl.innerHTML = '<div class="text-center text-gray-400 py-6">⏳ กำลังโหลด...</div>';
    modal.classList.remove('hidden');

    try {
        const res = await fetchPartsJson({ action: 'GET_PARTS_INSTALLATION', partId: partId });
        const data = await res.json();
        const records = (data.data || []).sort((a, b) => {
            const da = extractInstallDateStr(a.Install_Date) || '';
            const db = extractInstallDateStr(b.Install_Date) || '';
            return da < db ? -1 : da > db ? 1 : 0;
        });

        if (records.length === 0) {
            bodyEl.innerHTML = '<div class="text-center text-gray-400 py-6">ยังไม่มีประวัติการติดตั้ง</div>';
            return;
        }

        // หา Active record สำหรับ shot ปัจจุบัน
        // key ต้อง trim ให้สอดคล้องกันเพื่อป้องกัน trailing space ใน sheet
        const activeLookup = {};
        (partLocationsCache[partId] || []).forEach(inst => {
            activeLookup[String(inst.installId).trim()] = inst.actualShots;
        });

        const totalRecords = records.length;
        let html = `<div class="text-xs text-gray-500 mb-3 px-1">${totalRecords} รายการ (ทุกสถานะ)</div>`;
        html += '<div class="relative">';
        // เส้นแนวตั้ง
        html += '<div class="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>';

        records.forEach((inst, idx) => {
            const status = String(inst.Status || '').trim();
            const installDateDisplay = formatInstallDateTime(inst.Install_Date);
            const installDateStr = extractInstallDateStr(inst.Install_Date);
            const replacedDateStr = inst.Replaced_Date ? extractInstallDateStr(inst.Replaced_Date) : '';
            const replacedDateDisplay = replacedDateStr || '-';
            const carried = parseInt(inst.Carried_Shots) || 0;
            const carriedDays = parseInt(inst.Carried_Days) || 0;

            // ระยะเวลาที่ติดตั้ง
            let durationDays = 0;
            if (status === 'Active') {
                durationDays = daysFromInstall(installDateStr);
            } else if (installDateStr && replacedDateStr) {
                const d1 = new Date(installDateStr + 'T00:00:00');
                const d2 = new Date(replacedDateStr + 'T00:00:00');
                durationDays = Math.max(0, Math.floor((d2 - d1) / 86400000));
            }

            // สี + badge ตาม status
            let dotColor, badgeCls, statusLabel;
            if (status === 'Active') {
                dotColor = 'bg-green-500'; badgeCls = 'bg-green-100 text-green-700'; statusLabel = '🟢 กำลังใช้งาน';
            } else if (status === 'Replaced') {
                dotColor = 'bg-blue-400'; badgeCls = 'bg-blue-100 text-blue-700'; statusLabel = '🔄 เปลี่ยน/ย้าย';
            } else if (status === 'Archived') {
                dotColor = 'bg-gray-400'; badgeCls = 'bg-gray-100 text-gray-600'; statusLabel = '♻️ ถอด → นำกลับมาใช้';
            } else {
                dotColor = 'bg-gray-400'; badgeCls = 'bg-gray-100 text-gray-600'; statusLabel = '📤 ถอดออก';
            }

            // Shot ที่แสดง
            let shotLine = '';
            if (status === 'Active') {
                const currentShots = activeLookup[String(inst.Install_ID).trim()];
                if (currentShots !== undefined) {
                    const sinceInstall = currentShots - (carried); // shots on this machine = actual - carry-over
                    shotLine = `<div class="text-xs mt-1"><span class="text-gray-500">Shot ปัจจุบัน: </span><b class="text-green-700">${currentShots.toLocaleString()}</b><span class="text-gray-400 text-[10px] ml-1">(ใช้ไปในรอบนี้: ${Math.max(0, sinceInstall).toLocaleString()})</span></div>`;
                }
            } else if (status === 'Removed' || status === 'Archived') {
                shotLine = `<div class="text-xs mt-1"><span class="text-gray-500">Shot สะสม ณ วันถอด: </span><b class="text-gray-700">${carried.toLocaleString()}</b><span class="text-gray-400 text-[10px] ml-1">(${carriedDays.toLocaleString()} วัน)${status === 'Archived' ? ' · ยกยอดไปติดตั้งใหม่แล้ว' : ''}</span></div>`;
            } else if (status === 'Replaced') {
                shotLine = `<div class="text-xs mt-1 text-gray-400">Shot carry-over ออก: <b>${carried.toLocaleString()}</b></div>`;
            }

            const isLast = idx === totalRecords - 1;
            html += `<div class="relative pl-10 pb-5 ${isLast ? '' : ''}">
                <div class="absolute left-2.5 top-1 w-3 h-3 rounded-full ${dotColor} border-2 border-white shadow z-10"></div>
                <div class="bg-white border rounded-lg p-3 shadow-sm ${status === 'Active' ? 'border-green-300' : status === 'Replaced' ? 'border-blue-200' : 'border-gray-200'}">
                    <div class="flex justify-between items-start gap-2 mb-1">
                        <span class="font-bold text-sm text-gray-800">${escHtml(inst.Machine) || '-'}</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold ${badgeCls} whitespace-nowrap">${statusLabel}</span>
                    </div>
                    <div class="text-xs text-gray-600 space-y-0.5">
                        <div><span class="text-gray-400">ติดตั้ง: </span>${escHtml(installDateDisplay)}${inst.Recorder ? ` <span class="text-gray-400">(โดย ${escHtml(inst.Recorder)})</span>` : ''}</div>
                        ${status !== 'Active' ? `<div><span class="text-gray-400">${status === 'Replaced' ? 'เปลี่ยน/ย้าย: ' : 'ถอดออก: '}</span>${escHtml(replacedDateDisplay)}</div>` : ''}
                        <div><span class="text-gray-400">ระยะเวลา: </span><b>${durationDays.toLocaleString()} วัน</b></div>
                    </div>
                    ${shotLine}
                    ${inst.Maint_Job_ID ? `<div class="text-[10px] text-gray-400 mt-1">Job: ${escHtml(inst.Maint_Job_ID)}</div>` : ''}
                </div>
            </div>`;
        });

        html += '</div>';
        bodyEl.innerHTML = html;
    } catch (err) {
        bodyEl.innerHTML = '<div class="text-center text-red-500 py-4">โหลดประวัติไม่สำเร็จ: ' + err.message + '</div>';
    }
};

window.closePartHistory = function() {
    const modal = document.getElementById('modal-part-history');
    if (modal) modal.classList.add('hidden');
};
