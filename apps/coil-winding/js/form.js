window.openAssignModal = function() {
    const container = document.getElementById('assign-list-container');
    container.innerHTML = '';
    
    for(let i=1; i<=16; i++) {
        const m = `CWM-${String(i).padStart(2,'0')}`;
        const currentVal = machineMapping[m] || '';
        let opts = `<option value="">-- ไม่ได้ระบุ --</option>`;
        opts += productList.map(p => `<option value="${p}" ${currentVal===p?'selected':''}>${p}</option>`).join('');
        
        container.innerHTML += `
            <div class="flex items-center gap-2 bg-gray-50 p-2 rounded border border-gray-100 mb-1">
                <label class="font-bold text-gray-700 w-20 flex-none">${m}</label>
                <select class="assign-select-input w-full p-1.5 border rounded text-sm bg-white" data-machine="${m}">
                    ${opts}
                </select>
            </div>
        `;
    }
    document.getElementById('modal-assign').classList.remove('hidden');
};

window.closeAssignModal = function() {
    document.getElementById('modal-assign').classList.add('hidden');
};

window.saveAssignment = async function() {
    const selects = document.querySelectorAll('.assign-select-input');
    let hasChanges = false;
    let logEntries = [];
    
    selects.forEach(sel => {
        const m = sel.dataset.machine;
        const v = sel.value;
        if(machineMapping[m] !== v) {
            hasChanges = true;
            if(v) {
                machineMapping[m] = v;
                logEntries.push({machine: m, product: v});
            } else {
                delete machineMapping[m];
                logEntries.push({machine: m, product: "Unassigned"});
            }
        }
    });
    
    localStorage.setItem('CWM_MACHINE_MAPPING', JSON.stringify(machineMapping));
    window.closeAssignModal();
    
    const rows = document.getElementById('batchList').children;
    for(let r of rows) {
        const mSel = r.querySelector('.machine-select-trigger');
        const pSel = r.querySelector('.product-select-target');
        if(mSel && mSel.value && machineMapping[mSel.value]) {
            pSel.value = machineMapping[mSel.value];
            pSel.dispatchEvent(new Event('change'));
        }
    }

    if(hasChanges && logEntries.length > 0) {
        const payload = { 
            action: 'SAVE_ASSIGNMENT', 
            timestamp: new Date().toLocaleString('th-TH'),
            logs: logEntries,
            recorder: document.getElementById('recorder').value || "System"
        };
        fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) })
        .catch(e => console.log("Error logging assignment:", e));

        systemLog('ASSIGN_MACHINE', `บันทึกการตั้งค่าเครื่องจักร ${logEntries.length} รายการ`);
    }
};

window.addBatchRow = function() {
    const container = document.getElementById('batchList');
    const rowId = 'row-' + Date.now() + Math.random().toString(36).substr(2, 5);
    let machineOpts = '<option value="">เลือกเครื่อง...</option>';
    for(let i=1; i<=16; i++) {
        machineOpts += `<option value="CWM-${String(i).padStart(2,'0')}">CWM-${String(i).padStart(2,'0')}</option>`;
    }
    let prodOpts = productList.map(p => `<option value="${p}">${p}</option>`).join('');

    const jobOpts = (typeof window.buildJobOrderOptions === 'function')
        ? window.buildJobOrderOptions('', '')
        : '<option value="">— ไม่ระบุ Job Order —</option>';

    const div = document.createElement('div');
    div.id = rowId;
    div.dataset.rowId = rowId;
    div.className = "bg-white p-3 border border-gray-200 rounded-lg shadow-sm flex flex-col md:flex-row gap-3 items-end md:items-center";
    div.innerHTML = `
        <div class="flex-1 w-full">
            <label class="text-[10px] text-gray-400 font-bold uppercase">Machine</label>
            <select name="machine" class="machine-select-trigger w-full p-2 border rounded bg-gray-50 text-sm font-bold">${machineOpts}</select>
        </div>
        <div class="flex-1 w-full">
            <label class="text-[10px] text-gray-400 font-bold uppercase">Product</label>
            <select name="productCode" class="product-select-target w-full p-2 border rounded bg-gray-50 text-sm">${prodOpts}</select>
        </div>
        <div class="flex-1 w-full">
            <label class="text-[10px] text-indigo-400 font-bold uppercase">Job Order</label>
            <select name="jobOrder" class="job-order-select-target w-full p-2 border border-indigo-200 rounded bg-indigo-50/50 text-sm">${jobOpts}</select>
        </div>
        <div class="w-24">
            <label class="text-[10px] text-gray-400 font-bold uppercase">FG</label>
            <input type="number" name="fgAmount" value="1000" class="w-full p-2 border rounded text-center font-bold text-green-600 bg-green-50 focus:bg-white" min="0">
        </div>
        <div class="w-full md:w-auto flex gap-2">
            <button type="button" onclick="window.openNgModal('${rowId}')" class="flex-1 md:flex-none bg-red-50 text-red-600 border border-red-200 px-3 py-2 rounded font-bold text-sm hover:bg-red-100 relative">
                NG (Kg) <span id="ng-badge-${rowId}" class="hidden absolute -top-2 -right-2 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">0</span>
            </button>
            <button type="button" onclick="window.removeBatchRow('${rowId}')" class="text-gray-400 hover:text-red-500 px-2 text-xl">&times;</button>
        </div>
    `;
    container.appendChild(div);
    batchNgData[rowId] = [];

    const mSelect = div.querySelector('.machine-select-trigger');
    const pSelect = div.querySelector('.product-select-target');
    const fgInput = div.querySelector('input[name="fgAmount"]');
    
    const checkProductForFg = () => {
        // ถ้า FG ถูกล็อค (มี NG อยู่) → ไม่ต้องเปลี่ยนค่า FG
        if (fgInput.readOnly) return;
        if(pSelect.value === "51207080HC-JR (25/32A)") {
            fgInput.value = "800";
        } else {
            fgInput.value = "1000";
        }
    };

    const jSelect = div.querySelector('.job-order-select-target');

    // กรองรายการ Job Order ให้ตรงกับรุ่นที่เลือกในแถวนี้
    const refreshJobOptions = () => {
        if (!jSelect || typeof window.buildJobOrderOptions !== 'function') return;
        jSelect.innerHTML = window.buildJobOrderOptions(jSelect.value, pSelect.value);
    };

    mSelect.addEventListener('change', function() {
        const selectedM = this.value;
        if(selectedM && machineMapping[selectedM]) {
            pSelect.value = machineMapping[selectedM];
            checkProductForFg(); 
        }
        refreshJobOptions();
    });

    pSelect.addEventListener('change', () => { checkProductForFg(); refreshJobOptions(); });

    // เลือก Job Order แล้วให้รุ่นสินค้าเปลี่ยนตามแผนอัตโนมัติ
    if (jSelect) {
        jSelect.addEventListener('change', function() {
            const job = (typeof window.getJobOrderByNo === 'function') ? window.getJobOrderByNo(this.value) : null;
            if (job && job.product && job.product !== pSelect.value) {
                const hasOption = Array.from(pSelect.options).some(o => o.value === job.product);
                if (hasOption) {
                    pSelect.value = job.product;
                    checkProductForFg();
                }
            }
        });
    }

    checkProductForFg();
    refreshJobOptions();
};

window.removeBatchRow = function(id) { 
    const el = document.getElementById(id);
    if(el) el.remove(); 
    delete batchNgData[id]; 
};

window.openNgModal = async function(rowId) {
    currentRowIdForNg = rowId;
    const modal = document.getElementById('modal-ng');
    const list = document.getElementById('modal-ng-list');
    list.innerHTML = '';

    // บังคับใช้อาการจาก Cloud เท่านั้น: ถ้ายังไม่โหลด ให้ดึงใหม่ก่อนแสดง
    if (!ngSymptomsLoaded) {
        list.innerHTML = '<div class="text-center text-gray-500 text-sm py-4">⏳ กำลังโหลดรายการอาการจาก Cloud...</div>';
        modal.classList.remove('hidden');
        await window.fetchOptions();
        if (currentRowIdForNg !== rowId) return;
        list.innerHTML = '';
        if (!ngSymptomsLoaded) {
            list.innerHTML = '<div class="text-center text-red-600 text-sm py-4">❌ โหลดรายการอาการจาก Cloud ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วเปิดใหม่</div>';
            return;
        }
    }

    ngSymptoms.forEach(s => {
        const isSetup = s.trim().toLowerCase() === 'setup';
        if (isSetup) {
            // สำหรับ Setup: หา existing data ที่เป็น "Setup - xxx" ทั้งหมด
            const setupItems = batchNgData[rowId].filter(x => x.type.toLowerCase().startsWith('setup - ') || x.type.toLowerCase() === 'setup');
            const setupQty = setupItems.reduce((sum, x) => sum + (x.qty || 0), 0);
            const setupRemark = setupItems.map(x => x.remark).filter(Boolean).join(', ');
            // หา sub-symptom ที่เคยเลือก (เอาตัวแรกที่เจอ)
            const existingSetupSub = setupItems.find(x => x.type.toLowerCase().startsWith('setup - '));
            const subSymptom = existingSetupSub ? existingSetupSub.type.replace(/^setup\s*-\s*/i, '') : '';
            window.renderNgItem(list, s, setupQty || '', setupRemark, false, subSymptom);
        } else {
            const existing = batchNgData[rowId].find(x => x.type === s);
            const val = existing ? existing.qty : '';
            const remark = existing ? existing.remark : '';
            window.renderNgItem(list, s, val, remark);
        }
    });

    const customItems = batchNgData[rowId].filter(x => {
        // ไม่แสดง "Setup - xxx" ซ้ำเพราะรวมไว้ใน Setup row แล้ว
        if (x.type.toLowerCase().startsWith('setup')) return false;
        return !ngSymptoms.some(s => s.toLowerCase() === x.type.toLowerCase());
    });
    customItems.forEach(item => {
        window.renderNgItem(list, item.type, item.qty, item.remark, true);
    });

    modal.classList.remove('hidden');
};

const setupDropdownExcludedExact = new Set(['setup', 'อื่นๆ (others)']);
const setupDropdownExcludedKeywords = ['เปลี่ยนม้วน', 'เปลี่ยนรุ่น'];
function isExcludedSetupSubSymptom(symptom) {
    const normalized = (symptom || '').trim().toLowerCase();
    if (!normalized) return true;
    if (setupDropdownExcludedExact.has(normalized)) return true;
    return setupDropdownExcludedKeywords.some(keyword => normalized.includes(keyword));
}

window.renderNgItem = function(container, label, qty, remark, isCustom=false, setupSubSymptom='') {
    const div = document.createElement('div');
    div.className = "border-b pb-2 mb-2 ng-item-row";
    const isSetup = label.trim().toLowerCase() === 'setup';

    const typeInput = isCustom
        ? `<input type="text" class="ng-type-name w-full p-1 border rounded text-sm font-bold text-red-700 mb-1" value="${label}" placeholder="ระบุชื่ออาการ...">`
        : `<span class="text-sm font-medium text-gray-700 ng-type-label" data-label="${label}">${label}</span>`;

    // สร้าง dropdown เลือกอาการย่อยสำหรับ Setup
    let setupDropdownHtml = '';
    if (isSetup) {
        const otherSymptoms = ngSymptoms.filter(s => !isExcludedSetupSubSymptom(s));
        const options = otherSymptoms.map(s => {
            const selected = setupSubSymptom && s.toLowerCase() === setupSubSymptom.toLowerCase() ? 'selected' : '';
            return `<option value="${s}" ${selected}>${s}</option>`;
        }).join('');
        setupDropdownHtml = `
        <div class="mt-1">
            <select class="ng-setup-symptom w-full p-1 border border-orange-300 rounded text-xs bg-orange-50 text-orange-800 font-medium">
                <option value="">-- เลือกอาการ Setup --</option>
                ${options}
            </select>
        </div>`;
    }

    div.innerHTML = `
        <div class="flex justify-between items-center mb-1">
            <div class="flex-1">${typeInput}</div>
            <div class="flex items-center ml-2">
                <input type="number" class="ng-input-qty w-20 p-1 border rounded text-right" value="${qty}" placeholder="0.00" min="0" step="any">
                <span class="text-xs text-gray-500 ml-1">Kg</span>
            </div>
        </div>${setupDropdownHtml}
        <input type="text" class="ng-input-remark w-full p-1 border rounded text-xs bg-gray-50" value="${remark}" placeholder="หมายเหตุ...">
    `;
    container.appendChild(div);
};

window.addCustomNgField = function() { 
    const list = document.getElementById('modal-ng-list'); 
    window.renderNgItem(list, "", "", "", true); 
    list.scrollTop = list.scrollHeight; 
};

window.saveCurrentNgInputs = function() {
    if(!currentRowIdForNg) return;
    const rows = document.querySelectorAll('.ng-item-row');
    const newData = [];
    let total = 0;

    // ตรวจสอบว่าทุก NG ที่กรอกต้องมีจุดทศนิยม
    let hasDecimalError = false;
    rows.forEach(row => {
        const rawVal = row.querySelector('.ng-input-qty').value.trim();
        if (rawVal && parseFloat(rawVal) > 0 && !rawVal.includes('.')) {
            hasDecimalError = true;
            row.querySelector('.ng-input-qty').style.borderColor = 'red';
        } else {
            row.querySelector('.ng-input-qty').style.borderColor = '';
        }
    });
    if (hasDecimalError) {
        alert("กรุณากรอก NG เป็นทศนิยม (Kg) เช่น 0.15 ไม่ใช่ 15\nตรวจสอบช่องที่ขอบแดง");
        return false;
    }

    let setupValidationError = false;
    rows.forEach(row => {
        let type = "";
        const labelSpan = row.querySelector('.ng-type-label');
        const nameInput = row.querySelector('.ng-type-name');
        if (labelSpan) type = labelSpan.dataset.label;
        else if (nameInput) type = nameInput.value.trim();

        // ถ้าเป็น Setup → ต่อท้ายด้วยอาการที่เลือก
        const setupSelect = row.querySelector('.ng-setup-symptom');
        if (setupSelect && type.trim().toLowerCase() === 'setup') {
            const subSymptom = setupSelect.value;
            if (subSymptom) {
                type = 'Setup - ' + subSymptom;
            }
            // ถ้าไม่เลือกอาการย่อย → ยังคง validate
        }

        const qty = parseFloat(row.querySelector('.ng-input-qty').value);
        const remark = row.querySelector('.ng-input-remark').value;
        if (type && qty > 0) {
            // validate: Setup ต้องเลือกอาการย่อย
            // (รวมแถวที่พิมพ์ "Setup" เองผ่าน "ระบุอาการอื่น" ซึ่งไม่มี dropdown อาการย่อย)
            if (type.trim().toLowerCase() === 'setup') {
                (setupSelect || nameInput || row).style.borderColor = 'red';
                setupValidationError = true;
                return; // ข้ามแถวนี้ — จะ abort หลังจบ loop
            }
            newData.push({ type: capitalizeFirst(type), qty, remark });
            total += qty;
        }
    });

    // ถ้ามีแถว Setup ที่ยังไม่เลือกอาการย่อย → ยกเลิกการบันทึกทั้งหมด (กันข้อมูลหาย)
    if (setupValidationError) {
        alert('กรุณาเลือกอาการ Setup ว่าเป็นอาการอะไร (ช่องที่ขอบแดง)\nหากเพิ่มผ่าน "ระบุอาการอื่น" ห้ามใช้ชื่อ Setup เปล่าๆ ให้ใช้แถว Setup ด้านบนแล้วเลือกอาการย่อยแทน');
        return false;
    }

    batchNgData[currentRowIdForNg] = newData;
    const badge = document.getElementById(`ng-badge-${currentRowIdForNg}`);
    const fgInput = document.querySelector(`#${currentRowIdForNg} input[name="fgAmount"]`);
    
    if(total > 0) { 
        badge.innerText = total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 6 });
        badge.classList.remove('hidden'); 
        if (fgInput) {
            fgInput.value = 0;
            fgInput.readOnly = true;
            fgInput.classList.remove('bg-green-50', 'text-green-600', 'focus:bg-white');
            fgInput.classList.add('bg-gray-100', 'text-gray-400', 'cursor-not-allowed', 'opacity-60');
            fgInput.title = "ช่องนี้ถูกล็อคเนื่องจากมีการลง NG (หากต้องการลง FG กรุณาเพิ่มรายการใหม่)";
        }
    } else { 
        badge.classList.add('hidden'); 
        if (fgInput && fgInput.readOnly) {
            fgInput.readOnly = false;
            fgInput.classList.remove('bg-gray-100', 'text-gray-400', 'cursor-not-allowed', 'opacity-60');
            fgInput.classList.add('bg-green-50', 'text-green-600', 'focus:bg-white');
            fgInput.title = "";
        }
    }
};

window.closeNgModal = function(save) {
    if(save) {
        const result = window.saveCurrentNgInputs();
        if (result === false) return; // validate ไม่ผ่าน → ไม่ปิด modal
    }
    document.getElementById('modal-ng').classList.add('hidden');
    currentRowIdForNg = null;
};

window.manageSymptomsFromModal = function() {
    window.saveCurrentNgInputs(); 
    window.manageSymptoms(); 
};

window.renderRecorderOptions = function() { 
    const select = document.getElementById('recorder'); 
    const currentVal = select.value;
    select.innerHTML = '<option value="">เลือกพนักงาน...</option>'; 
    recorderList.forEach(r => { 
        const opt = document.createElement('option'); 
        opt.value = r; 
        opt.text = r; 
        select.appendChild(opt); 
    }); 
    if (recorderList.includes(currentVal)) {
        select.value = currentVal;
    }
};

window.renderProductOptions = function() { 
    const s = document.getElementById('planProduct'); 
    if(s) {
        const cur = s.value;
        s.innerHTML = productList.map(p=>`<option value="${p}">${p}</option>`).join('');
        if (productList.includes(cur)) s.value = cur;
    }
};

window.manageRecorders = function() { 
    currentManageType = 'recorder'; 
    window.openManageListModal('จัดการรายชื่อผู้บันทึก', recorderList); 
};

window.manageSymptoms = function() { 
    currentManageType = 'symptom'; 
    window.openManageListModal('จัดการรายการอาการ NG', ngSymptoms); 
};

window.openManageListModal = function(title, list) { 
    const modal = document.getElementById('modal-manage-list'); 
    document.getElementById('manage-list-title').innerText = title; 
    window.renderManageListContent(list); 
    modal.classList.remove('hidden'); 
};

window.renderManageListContent = function(list) { 
    const container = document.getElementById('manage-list-content'); 
    container.innerHTML = list.map((item, i) => `
        <div class="flex justify-between items-center bg-gray-50 p-2 rounded mb-1">
            <span class="text-sm font-medium text-gray-700">${item}</span>
            <button onclick="window.deleteListItem(${i})" class="text-red-500 hover:bg-red-100 px-2 py-1 rounded text-xs">🗑️ ลบ</button>
        </div>
    `).join(''); 
};

window.addNewItemToList = function() {
     const rawVal = document.getElementById('new-item-input').value.trim();
     if(!rawVal) return;
     if (currentManageType === 'recorder') { 
         if (!recorderList.some(r => r.toLowerCase() === rawVal.toLowerCase())) { 
             recorderList.push(rawVal); 
             window.renderRecorderOptions(); 
             window.renderManageListContent(recorderList); 
         } 
     } else if (currentManageType === 'symptom') { 
         const stdVal = normalizeNgSymptomName(rawVal);
         if (!stdVal) return;
         if (!ngSymptoms.some(s => s.toLowerCase() === stdVal.toLowerCase())) { 
             ngSymptoms.push(stdVal); 
             ngSymptoms = normalizeNgSymptomMasterList(ngSymptoms);
             window.renderManageListContent(ngSymptoms); 
         } 
     }
     document.getElementById('new-item-input').value = '';
     if (!document.getElementById('modal-ng').classList.contains('hidden') && currentRowIdForNg) {
         window.openNgModal(currentRowIdForNg);
     }
};

window.deleteListItem = function(index) {
     if (!confirm('ยืนยันการลบรายการนี้?')) return;
     if (currentManageType === 'recorder') { 
         recorderList.splice(index, 1); 
         window.renderRecorderOptions(); 
         window.renderManageListContent(recorderList); 
     } else if (currentManageType === 'symptom') { 
         ngSymptoms.splice(index, 1); 
         ngSymptoms = normalizeNgSymptomMasterList(ngSymptoms);
         window.renderManageListContent(ngSymptoms); 
     }
     if (!document.getElementById('modal-ng').classList.contains('hidden') && currentRowIdForNg) {
         window.openNgModal(currentRowIdForNg);
     }
};

window.saveListToCloud = async function() {
    const btn = document.getElementById('btn-save-cloud');
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳ กำลังอัปเดต...";
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    try {
        const actionName = (currentManageType === 'symptom') ? 'SAVE_NG_SYMPTOMS' : 'SAVE_RECORDERS';
        const dataList = (currentManageType === 'symptom')
            ? normalizeNgSymptomMasterList(ngSymptoms)
            : recorderList;
        const payload = { 
            action: actionName, 
            timestamp: new Date().toLocaleString('th-TH'),
            data: dataList,
            recorder: document.getElementById('recorder').value || "System"
        };
        await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) }); 
        systemLog('UPDATE_MASTER_LIST', `บันทึก Master List: ${actionName}`);
        alert("☁️ อัปเดตข้อมูลขึ้น Cloud เรียบร้อยแล้ว!\n(ระบบจะจำรายการเหล่านี้ไปใช้กับเครื่องอื่นด้วย)");
    } catch (error) {
        alert("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ Cloud: " + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
};

window.closeManageListModal = function() { 
    document.getElementById('modal-manage-list').classList.add('hidden'); 
};

window.showUndoToast = function() {
    const toast = document.getElementById('undo-toast');
    const btn = document.getElementById('btn-undo-action');
    btn.innerHTML = "↩️ ยกเลิก (Undo)";
    btn.disabled = false;
    btn.classList.remove('bg-green-600', 'hover:bg-green-700');
    btn.classList.add('bg-red-600', 'hover:bg-red-700');
    toast.classList.remove('translate-y-24', 'opacity-0', 'pointer-events-none');
};

window.closeUndoToast = function() {
    const toast = document.getElementById('undo-toast');
    toast.classList.add('translate-y-24', 'opacity-0', 'pointer-events-none');
    window.lastBatchId = null;
};

window.undoLastSubmit = async function() {
    if(!window.lastBatchId) return;
    const btn = document.getElementById('btn-undo-action');
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳ กำลังยกเลิก...";
    btn.disabled = true;
    try {
        const payload = { action: 'UNDO_BATCH_PRODUCTION', batchId: window.lastBatchId };
        await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) }); 
        systemLog('UNDO_PRODUCTION', `ยกเลิกรายการผลิต Batch: ${window.lastBatchId}`);
        btn.innerHTML = "✅ ยกเลิกสำเร็จ!";
        btn.classList.remove('bg-red-600', 'hover:bg-red-700');
        btn.classList.add('bg-green-600', 'hover:bg-green-700');
        setTimeout(() => {
            window.closeUndoToast();
            setTimeout(() => {
                btn.classList.remove('bg-green-600', 'hover:bg-green-700');
                btn.classList.add('bg-red-600', 'hover:bg-red-700');
            }, 500);
        }, 1500);
    } catch(e) { 
        alert("❌ เกิดข้อผิดพลาดในการยกเลิก: " + e.message); 
        btn.innerHTML = "↩️ ยกเลิก (Undo)";
        btn.disabled = false;
    } 
};

document.getElementById('productionForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn'); 
    const txt = btn.innerText;
    btn.disabled = true; 
    btn.innerText = "⏳ กำลังตรวจสอบยอดปัจจุบัน...";
    
    const fd = new FormData(e.target);
    const shiftType = document.querySelector('input[name="shift_type_toggle"]:checked').value;
    const currentRec = fd.get('recorder');
    const date = fd.get('productionDate');
    const hourSlot = fd.get('hourSlot');
    
    if(currentRec && !recorderList.some(r => r.toLowerCase() === currentRec.toLowerCase())) { 
        recorderList.push(currentRec); 
        window.renderRecorderOptions(); 
    }
    
    const newBatchId = 'BATCH-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);

    const common = { 
        timestamp: new Date().toLocaleString('th-TH'), 
        productionDate: date, shift: fd.get('shift'), shiftType: shiftType, 
        recorder: currentRec, hourSlot: hourSlot, batchId: newBatchId 
    };
    
    const items = []; 
    const rowDivs = document.getElementById('batchList').children;
    let newNgTypes = [];
    
    for(let div of rowDivs) {
        const machine = div.querySelector('[name="machine"]').value;
        const product = div.querySelector('[name="productCode"]').value;
        const jobOrderEl = div.querySelector('[name="jobOrder"]');
        const jobOrder = jobOrderEl ? jobOrderEl.value.trim() : '';
        const fg = parseInt(div.querySelector('[name="fgAmount"]').value) || 0;
        if(!machine) continue;
        const ngDetails = batchNgData[div.id] || [];
        ngDetails.forEach(ng => { 
            if (ng.type) {
                const stdType = capitalizeFirst(ng.type);
                ng.type = stdType; 
                if (!ngSymptoms.some(s => s.toLowerCase() === stdType.toLowerCase()) && !newNgTypes.some(s => s.toLowerCase() === stdType.toLowerCase())) {
                    newNgTypes.push(stdType);
                } 
            }
        });
        items.push({ machine, productCode: product, jobOrder, fgAmount: fg, ngDetails });
    }

    if(items.length === 0) { 
        alert("กรุณาเพิ่มรายการ"); 
        btn.disabled = false; 
        btn.innerText = txt; 
        return; 
    }

    try {
        const res = await fetch(`${SCRIPT_URL}?action=GET_DASHBOARD&start=${date}&end=${date}&shift=All&shiftType=All&_t=${Date.now()}`);
        const dbData = await res.json();
        const hourIdx = dbData.hourlyLabels ? dbData.hourlyLabels.indexOf(hourSlot) : -1;
        let validationMsg = `📊 สรุปยอดผลิตในระบบ ช่วงเวลา [${hourSlot}]\n\n`;
        let hasError = false;
        let errorMsg = "";

        for (let item of items) {
            let existingFg = 0;
            if (hourIdx !== -1 && dbData.machineData && dbData.machineData[item.machine]) {
                existingFg = dbData.machineData[item.machine].hourlyFg[hourIdx] || 0;
            }
            let totalFg = existingFg + item.fgAmount;
            const jobInfo = item.jobOrder ? `   - Job Order: ${item.jobOrder}\n` : `   - Job Order: (ไม่ระบุ)\n`;
            validationMsg += `▶ ${item.machine}:\n${jobInfo}   - ยอดในระบบมีแล้ว: ${existingFg} ตัว\n   - กำลังบันทึกเพิ่ม: ${item.fgAmount} ตัว\n   - รวมเป็น: ${totalFg} ตัว\n\n`;

            // เตือน (ไม่บล็อก) เมื่อยอดที่บันทึกเกินจำนวนคงเหลือของ Job Order
            if (item.jobOrder && typeof window.getJobOrderByNo === 'function') {
                const job = window.getJobOrderByNo(item.jobOrder);
                if (job && job.targetQty > 0 && item.fgAmount > job.remainingQty) {
                    validationMsg += `   ⚠️ ${item.jobOrder} คงเหลือตามแผนเพียง ${job.remainingQty} ตัว\n\n`;
                }
            }

            if (totalFg > 2000) {
                hasError = true;
                errorMsg += `❌ ${item.machine}: ยอดรวม (${totalFg} ตัว) เกิน 2,000 ตัว/ชั่วโมง\n`;
            }
        }

        if (hasError) {
            alert("⚠️ ปฏิเสธการบันทึก!\n\n" + errorMsg + "\nไม่อนุญาตให้บันทึกยอด FG เกิน 2,000 ตัวในชั่วโมงเดียวกัน กรุณาตรวจสอบใหม่อีกครั้ง");
            btn.disabled = false;
            btn.innerText = txt;
            return;
        }

        // ตรวจสอบ NG ซ้ำ
        const itemsWithNg = items.filter(it => it.ngDetails && it.ngDetails.length > 0);
        if (itemsWithNg.length > 0) {
            try {
                btn.innerText = "⏳ ตรวจสอบ NG ซ้ำ...";
                const dupRes = await fetch(SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'CHECK_NG_DUPLICATE', date, hour: hourSlot, items: itemsWithNg })
                });
                const dupData = await dupRes.json();
                if (dupData.duplicates && dupData.duplicates.length > 0) {
                    let dupMsg = "⚠️ พบข้อมูล NG ที่อาจซ้ำกับที่บันทึกไปแล้ว:\n\n";
                    dupData.duplicates.forEach(d => {
                        dupMsg += `• ${d.machine} | ${d.hour} | ${d.symptom} | จำนวน ${d.qty}\n`;
                    });
                    dupMsg += "\nต้องการบันทึกซ้ำหรือไม่?";
                    if (!confirm(dupMsg)) {
                        btn.disabled = false;
                        btn.innerText = txt;
                        return;
                    }
                }
            } catch(e) { /* ถ้าเช็คไม่ได้ ให้ผ่านไปบันทึกตามปกติ */ }
        }

        const confirmSave = confirm(validationMsg + "✅ ข้อมูลถูกต้อง ยืนยันที่จะบันทึกใช่หรือไม่?");
        if (!confirmSave) {
            btn.disabled = false; 
            btn.innerText = txt; 
            return; 
        }

        btn.innerText = "กำลังบันทึกข้อมูลเข้าฐานข้อมูล...";
        const payload = { action: 'SAVE_BATCH_PRODUCTION', common, items };
        await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) }); 
        systemLog('SAVE_PRODUCTION', `บันทึกรายการผลิต ${items.length} รายการ (Batch: ${newBatchId})`);

        // อัปเดตความคืบหน้าของ Job Order หลังบันทึกยอดผลิต
        if (typeof window.loadJobOrders === 'function') {
            setTimeout(() => window.loadJobOrders(true), 1500);
        }

        document.getElementById('batchList').innerHTML = ''; 
        batchNgData = {}; 
        window.addBatchRow(); 
        btn.disabled = false; 
        btn.innerText = txt;
        window.lastBatchId = newBatchId;
        window.showUndoToast();

    } catch(e) { 
        alert("Error ระหว่างตรวจสอบ: " + e.message); 
        btn.disabled = false; 
        btn.innerText = txt; 
    } 
};

// 📅 ฟอร์มวางแผนการผลิต (Job Order) ย้ายไปอยู่ใน js/planning.js แล้ว

// ==========================================
// 🌟 ระบบแจ้งซ่อม (Maintenance) - ปรับปรุงใหม่
// ==========================================

window.isSubmittingMaintenance = window.isSubmittingMaintenance || false;
window.lastMaintSubmitTime = window.lastMaintSubmitTime || 0;

window.openMaintenanceModal = function() {
    const modal = document.getElementById('modal-maintenance');
    const dDate = document.getElementById('maint-date');
    const dRec = document.getElementById('maint-reporter');
    const dMac = document.getElementById('maint-machine');
    const dStart = document.getElementById('maint-start-time');
    const dRemark = document.getElementById('maint-remark');
    
    // ฝังคำสั่งเปิดใช้งานระบบตรวจคำผิด (Native Spellchecker) เผื่อใช้สำหรับ Browser ที่รองรับ
    if (dRemark) {
        dRemark.setAttribute('spellcheck', 'true');
        dRemark.setAttribute('lang', 'th'); 
        dRemark.setAttribute('autocomplete', 'on');
    }

    if (dDate) dDate.value = getShiftDateStr();
    if (dRec && window.currentUser) dRec.value = window.currentUser.name || window.currentUser.username;
    
    if (dMac) {
        let macOpts = '<option value="">-- เลือกเครื่องจักร --</option>';
        for(let i=1; i<=16; i++) {
            macOpts += `<option value="CWM-${String(i).padStart(2,'0')}">CWM-${String(i).padStart(2,'0')}</option>`;
        }
        dMac.innerHTML = macOpts;
    }
    
    if (dStart) {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        dStart.value = `${hh}:${mm}`;
    }

    if (modal) modal.classList.remove('hidden');
};

const maintFormEl = document.getElementById('maintenanceForm');
const maintBtn = document.getElementById('btn-save-maint');

if (maintFormEl && maintBtn) {
    maintFormEl.addEventListener('submit', function(e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        maintBtn.click(); 
    }, true); 

    maintBtn.setAttribute('type', 'button');
    maintBtn.removeAttribute('onclick');

    maintBtn.onclick = async function(e) {
        e.preventDefault();
        
        if (!maintFormEl.checkValidity()) {
            maintFormEl.reportValidity();
            return;
        }

        const now = Date.now();
        if (window.isSubmittingMaintenance || (now - window.lastMaintSubmitTime < 3000)) {
            console.warn("🔒 Blocked duplicate submit event.");
            return false;
        }
        window.isSubmittingMaintenance = true; 
        window.lastMaintSubmitTime = now;
        
        const originalText = maintBtn.innerHTML;
        
        maintBtn.disabled = true;
        maintBtn.style.pointerEvents = 'none';
        maintBtn.classList.add('opacity-50');

        if (document.activeElement) document.activeElement.blur();
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const machine = document.getElementById('maint-machine').value;
        const issueType = document.getElementById('maint-issue-type').value;
        const startTime = document.getElementById('maint-start-time').value;
        const endTime = document.getElementById('maint-end-time').value;
        const remark = document.getElementById('maint-remark').value;
        const jobId = document.getElementById('maint-job-id')?.value;

        maintBtn.innerHTML = "🔍 กำลังวิเคราะห์ข้อมูลและตรวจสอบคำผิด...";

        // 1. คำนวณ Downtime
        let downtimeStr = "ยังไม่ระบุเวลาเสร็จสิ้น (รอดำเนินการ)";
        if (startTime && endTime) {
            const [sH, sM] = startTime.split(':').map(Number);
            const [eH, eM] = endTime.split(':').map(Number);
            let mins = (eH * 60 + eM) - (sH * 60 + sM);
            if (mins < 0) mins += 1440; 
            
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            downtimeStr = h > 0 ? `${h} ชม. ${m} นาที (${mins} นาที)` : `${m} นาที`;
        }

        // ==========================================
        // 🛠️ 2. ระบบตรวจสอบคำผิดแบบ Hybrid (Custom Thai + API TH/EN)
        // ==========================================
        let mistakeList = [];

        // 2.1 พจนานุกรมคำผิดภาษาไทย (ศัพท์เฉพาะทางที่มักเขียนผิด)
        const customThaiTypos = [
            { wrong: /อะไหร่|อไหล่/g, correct: "อะไหล่" },
            { wrong: /สวิทช์|สวิท|สวิช|สวิสซ์/g, correct: "สวิตช์" },
            { wrong: /มอเตอ(?!ร์)/g, correct: "มอเตอร์" },
            { wrong: /เซนเซอ(?!ร์)/g, correct: "เซนเซอร์" },
            { wrong: /อินเวอเตอ(?!ร์)/g, correct: "อินเวอร์เตอร์" },
            { wrong: /ปั้ม/g, correct: "ปั๊ม" },
            { wrong: /วาว/g, correct: "วาล์ว" },
            { wrong: /ล๊อค|ล๊อก/g, correct: "ล็อก" },
            { wrong: /พาสติก|พราสติก/g, correct: "พลาสติก" },
            { wrong: /เบรค/g, correct: "เบรก" },
            { wrong: /อุปกร(?!ณ์)/g, correct: "อุปกรณ์" },
            { wrong: /ชาตไฟ|ชารตไฟ|ช๊าต/g, correct: "ชาร์จ" },
            { wrong: /สตาท|สตาร์ท/g, correct: "สตาร์ต" },
            { wrong: /น๊อต/g, correct: "น็อต" },
            { wrong: /เซค|เชค|เช็ก/g, correct: "เช็ก" },
            { wrong: /ซ๊อต|ช๊อต|ช้อต/g, correct: "ช็อต" },
            { wrong: /พาท|พาร์ท/g, correct: "พาร์ต (Part)" }
        ];

        if (remark) {
            customThaiTypos.forEach(t => {
                const matches = remark.match(t.wrong);
                if (matches) {
                    matches.forEach(m => {
                        mistakeList.push(`"${m}" ➡️ อาจหมายถึง: ${t.correct} (ศัพท์ช่าง)`);
                    });
                }
            });
        }

        // 2.2 ตรวจสอบคำผิดทั่วไปด้วย API (ยิงพร้อมกัน 2 ภาษา: ไทย และ อังกฤษ)
        if (remark && remark.trim().length > 2) {
            try {
                // ฟังก์ชันยิง API ไปเช็คทีละภาษา
                const checkLanguage = async (langCode, langLabel) => {
                    const spellRes = await fetch('https://api.languagetool.org/v2/check', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({ text: remark, language: langCode })
                    });
                    const spellData = await spellRes.json();
                    
                    if (spellData.matches && spellData.matches.length > 0) {
                        spellData.matches.forEach(m => {
                            const word = remark.substring(m.offset, m.offset + m.length);
                            
                            // กรองแยก: ถ้าตรวจอังกฤษ ต้องมีตัวอักษรภาษาอังกฤษ
                            if (langCode === 'en-US' && !/[a-zA-Z]/.test(word)) return;
                            
                            const suggestions = m.replacements.slice(0, 3).map(r => r.value).join(', ');
                            if (suggestions) {
                                mistakeList.push(`"${word}" ➡️ อาจหมายถึง: ${suggestions} (${langLabel})`);
                            } else {
                                mistakeList.push(`"${word}" ➡️ อาจสะกดผิด (${langLabel})`);
                            }
                        });
                    }
                };

                // ยิงคำขอไปตรวจทั้งภาษาไทย (th) และภาษาอังกฤษ (en-US) ขนานกันไปเลยเพื่อความเร็ว
                await Promise.all([
                    checkLanguage('th', 'TH'),
                    checkLanguage('en-US', 'EN')
                ]);

            } catch (err) {
                console.warn("LanguageTool API Error:", err);
            }
        }

        // รวบรวมข้อความแจ้งเตือนคำผิด
        let spellWarning = "";
        mistakeList = [...new Set(mistakeList)]; // ตัดคำซ้ำที่อาจตรวจเจอจากทั้ง 2 แหล่ง
        if (mistakeList.length > 0) {
            spellWarning = `\n\n[🔍 ตรวจพบคำที่อาจสะกดผิด]\n- ` + mistakeList.join('\n- ');
        } else {
            spellWarning = `\n\n[✅ ตรวจสอบคำผิด: ไม่พบคำผิดที่ชัดเจน]`;
        }

        // ==========================================

        const isCloseJob = jobId ? "(อัปเดต / ปิดจ๊อบ)" : "(เปิดแจ้งซ่อม)";
        const confirmMsg = `=== ยืนยันข้อมูลการแจ้งซ่อม ${isCloseJob} ===\n\n` +
                           `🏭 เครื่องจักร: ${machine}\n` +
                           `⚠️ ปัญหา: ${issueType}\n` +
                           `⏱️ เวลา: ${startTime} - ${endTime || 'ยังไม่ระบุ'}\n` +
                           `⏳ Downtime: ${downtimeStr}\n\n` +
                           `📝 รายละเอียดที่บันทึก:\n${remark || '-'}` +
                           `${spellWarning}\n\n` +
                           `----------------------------------\n` +
                           `กด OK เพื่อบันทึกข้อมูล หรือ Cancel เพื่อกลับไปแก้ไข`;

        if (!confirm(confirmMsg)) {
            maintBtn.innerHTML = originalText;
            maintBtn.disabled = false;
            maintBtn.style.pointerEvents = 'auto'; 
            maintBtn.classList.remove('opacity-50');
            window.isSubmittingMaintenance = false; 
            window.lastMaintSubmitTime = 0; 
            return;
        }

        maintBtn.innerHTML = "⏳ กำลังอัปโหลดข้อมูลและรูปภาพ...";
        const fileInput = document.getElementById('maint-photo');
        let base64String = "";

        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            try {
                base64String = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            } catch (err) {
                console.error("Error reading file:", err);
                alert("❌ ไม่สามารถอ่านไฟล์ภาพได้ กรุณาลองใหม่อีกครั้ง");
                maintBtn.innerHTML = originalText;
                maintBtn.disabled = false;
                maintBtn.style.pointerEvents = 'auto';
                maintBtn.classList.remove('opacity-50');
                window.isSubmittingMaintenance = false; 
                return;
            }
        }

        const payload = {
            action: 'SAVE_MAINTENANCE',
            jobId: jobId || "", 
            username: window.currentUser ? window.currentUser.username : "Unknown",
            role: window.currentUser ? window.currentUser.role : "Unknown",
            date: document.getElementById('maint-date').value,
            machine: document.getElementById('maint-machine').value,
            issueType: document.getElementById('maint-issue-type').value,
            startTime: document.getElementById('maint-start-time').value,
            endDate: document.getElementById('maint-end-date') ? document.getElementById('maint-end-date').value : "",
            endTime: document.getElementById('maint-end-time').value,
            remark: document.getElementById('maint-remark').value,
            imageBase64: base64String
        };

        try {
            const res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
            const result = await res.json();
            
            if (result.status === 'success') {
                alert("✅ " + result.message);
                document.getElementById('maintenanceForm').reset();
                const previewPanel = document.getElementById('maint-photo-preview');
                if(previewPanel) previewPanel.classList.add('hidden');
                
                if(typeof window.clearPendingSelection === 'function') {
                    window.clearPendingSelection();
                }
                document.getElementById('modal-maintenance').classList.add('hidden');
            } else {
                alert("❌ เกิดข้อผิดพลาด: " + result.message);
            }
        } catch(err) {
            alert("❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
        } finally {
            maintBtn.innerHTML = originalText;
            maintBtn.disabled = false;
            maintBtn.style.pointerEvents = 'auto';
            maintBtn.classList.remove('opacity-50');
            window.isSubmittingMaintenance = false; 
        }
    };
}
