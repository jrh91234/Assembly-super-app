// ==========================================
// 📦 ระบบจัดการไลน์ Packing & Pallet (Updated)
// ==========================================

// 1. โหลดข้อมูลหมายเลขพาเลทจาก Local Storage (ถ้าไม่มีให้สร้าง P01 ถึง P20)
window.palletList = JSON.parse(localStorage.getItem('CWM_PALLET_LIST')) || 
                    Array.from({length: 20}, (_, i) => `P${String(i + 1).padStart(2, '0')}`);

// 2. ฟังก์ชันสำหรับเรนเดอร์ตัวเลือก Dropdown ของหมายเลขพาเลท
window.renderPalletDropdown = function() {
    // [NEW] แปลงช่องกรอกหมายเลขพาเลทใน HTML ให้เป็น Dropdown อัตโนมัติ (ในกรณีที่หน้า HTML ยังเป็น Input)
    let palletEl = document.getElementById('pack-pallet-no');
    if (palletEl && palletEl.tagName.toLowerCase() === 'input') {
        const selectEl = document.createElement('select');
        selectEl.id = 'pack-pallet-no';
        selectEl.className = palletEl.className + ' pallet-no-select'; // นำ class เดิมมาใช้
        palletEl.parentNode.replaceChild(selectEl, palletEl);
    }

    // ค้นหาและอัปเดตตัวเลือกใน Dropdown พาเลท
    const selects = document.querySelectorAll('.pallet-no-select, #pack-pallet-no'); 
    selects.forEach(sel => {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">เลือกหมายเลขพาเลท...</option>' + 
            window.palletList.map(p => `<option value="${p}">${p}</option>`).join('');
        // ถ้าค่าเดิมยังอยู่ในลิสต์ ให้เลือกค่าเดิม
        if (currentVal && window.palletList.includes(currentVal)) {
            sel.value = currentVal;
        }
    });
};

// 3. ฟังก์ชันเพิ่มหมายเลขพาเลทใหม่ (Local)
window.addPalletLocal = function() {
    const newPalletNo = prompt("ระบุ 'หมายเลขพาเลท' ใหม่ที่ต้องการเพิ่ม (เช่น P21):");
    if (!newPalletNo || newPalletNo.trim() === '') return;
    
    const cleanNo = newPalletNo.trim().toUpperCase();
    if (window.palletList.includes(cleanNo)) {
        alert("มีหมายเลขพาเลทนี้อยู่แล้ว!");
        return;
    }
    window.palletList.push(cleanNo);
    localStorage.setItem('CWM_PALLET_LIST', JSON.stringify(window.palletList));
    window.renderPalletDropdown();
};

// 4. ฟังก์ชันลบหมายเลขพาเลท (Local)
window.deletePalletLocal = function() {
    const palletNo = prompt("ระบุ 'หมายเลขพาเลท' ที่ต้องการลบ (เช่น P01):");
    if (!palletNo || !window.palletList.includes(palletNo.toUpperCase())) {
        if(palletNo) alert("ไม่พบหมายเลขพาเลทนี้ในระบบ");
        return;
    }
    if (!confirm(`ยืนยันการลบ ${palletNo}?`)) return;
    
    window.palletList = window.palletList.filter(p => p !== palletNo.toUpperCase());
    localStorage.setItem('CWM_PALLET_LIST', JSON.stringify(window.palletList));
    window.renderPalletDropdown();
};

// 5. เปิด/ปิด Modal Packing
window.openPackingModal = function() {
    const modal = document.getElementById('modal-packing');
    document.getElementById('pack-date').value = getShiftDateStr();
    if (window.currentUser) {
        document.getElementById('pack-recorder').value = window.currentUser.name || window.currentUser.username;
    }
    document.getElementById('pack-batch-list').innerHTML = '';
    window.addPackingRow(); // แถวเริ่มต้น
    window.renderPalletDropdown(); // โหลด Dropdown พาเลท
    modal.classList.remove('hidden');
};

window.closePackingModal = function() {
    document.getElementById('modal-packing').classList.add('hidden');
};

// 6. เพิ่ม/ลบ แถวรายการ Packing
window.addPackingRow = function() {
    const container = document.getElementById('pack-batch-list');
    const rowId = 'pack-row-' + Date.now();
    
    let machineOpts = '<option value="">เลือกเครื่อง...</option>';
    for(let i=1; i<=16; i++) {
        let m = `CWM-${String(i).padStart(2,'0')}`;
        machineOpts += `<option value="${m}">${m}</option>`;
    }
    
    let productOpts = '<option value="">เลือกรุ่น...</option>';
    if (typeof productList !== 'undefined') {
        productList.forEach(p => productOpts += `<option value="${p}">${p}</option>`);
    }

    const html = `
        <div id="${rowId}" class="pack-row grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200 items-end">
            <div>
                <label class="block text-xs font-bold text-gray-600 mb-1">จากเครื่อง (Machine)</label>
                <select class="pack-machine w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white" onchange="window.autoFillPackingInfo('${rowId}')">
                    ${machineOpts}
                </select>
            </div>
            <div>
                <label class="block text-xs font-bold text-gray-600 mb-1">รุ่นสินค้า (Model)</label>
                <select class="pack-model w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white" onchange="window.autoFillPackingQty('${rowId}')">
                    ${productOpts}
                </select>
            </div>
            <div>
                <label class="block text-xs font-bold text-gray-600 mb-1">จำนวน (Pcs)</label>
                <input type="number" class="pack-qty w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500" min="1" placeholder="ระบุจำนวน...">
            </div>
            <div class="flex justify-end">
                <button type="button" onclick="window.removePackingRow('${rowId}')" class="bg-red-100 hover:bg-red-200 text-red-600 p-2 rounded-lg text-sm transition-colors w-full md:w-auto">
                    ลบรายการ
                </button>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
};

// [NEW] ฟังก์ชันเลือกรุ่นและยอดให้อัตโนมัติเมื่อเลือกเครื่องจักร
window.autoFillPackingInfo = function(rowId) {
    const row = document.getElementById(rowId);
    if(!row) return;
    
    const machineSelect = row.querySelector('.pack-machine');
    const modelSelect = row.querySelector('.pack-model');
    const machine = machineSelect.value;
    
    // 1. เลือกรุ่นให้อัตโนมัติจาก machineMapping (อิงจากการจ่ายงาน Production)
    if (machine && typeof machineMapping !== 'undefined' && machineMapping[machine]) {
        const assignedProduct = machineMapping[machine];
        if (assignedProduct !== 'Unassigned') {
            modelSelect.value = assignedProduct;
        }
    }
    
    // 2. ดึงยอดแพ็คมาตรฐานตามรุ่น
    window.autoFillPackingQty(rowId);
};

// [NEW] ฟังก์ชันดึงยอดมาตรฐานเมื่อมีการเปลี่ยนรุ่นสินค้า
window.autoFillPackingQty = function(rowId) {
    const row = document.getElementById(rowId);
    if(!row) return;
    
    const model = row.querySelector('.pack-model').value;
    const qtyInput = row.querySelector('.pack-qty');
    
    // สมมติค่ายอดแพ็คมาตรฐานต่อรุ่น (แก้ไขตัวเลขได้ตามต้องการ)
    if (model) {
        if (model.includes("10A") || model.includes("16A")) {
            qtyInput.value = 1000;
        } else if (model.includes("20A") || model.includes("25/32A")) {
            qtyInput.value = 800;
        } else {
            qtyInput.value = 1000; // ค่าเริ่มต้นถ้าไม่มีชื่อตรง
        }
    } else {
        qtyInput.value = "";
    }
};

window.removePackingRow = function(rowId) {
    const el = document.getElementById(rowId);
    if(el) el.remove();
};

// 7. ฟังก์ชันบันทึกข้อมูล Packing ลง Google Sheet
window.savePackingToSheet = async function() {
    const date = document.getElementById('pack-date').value;
    const palletNo = document.getElementById('pack-pallet-no').value;
    const recorder = document.getElementById('pack-recorder').value;
    const category = document.getElementById('pack-category') ? document.getElementById('pack-category').value : '-';

    if (!palletNo) {
        alert("กรุณาเลือก 'หมายเลขพาเลท' ก่อนบันทึก");
        return;
    }

    const rows = document.querySelectorAll('.pack-row');
    const items = [];
    
    rows.forEach(row => {
        const machine = row.querySelector('.pack-machine').value;
        const product = row.querySelector('.pack-model').value;
        const qty = parseInt(row.querySelector('.pack-qty').value) || 0;
        
        if (machine && product && qty > 0) {
            items.push({ machine, product, qty });
        }
    });

    if (items.length === 0) {
        alert("กรุณากรอกข้อมูลรายการแพ็คกิ้งให้ครบถ้วนอย่างน้อย 1 รายการ (เครื่อง, รุ่น, และจำนวน)");
        return;
    }

    const payload = {
        action: 'SAVE_PACKING',
        data: {
            date: date,
            palletNo: palletNo,
            category: category,
            recorder: recorder,
            items: items
        }
    };

    const btnSave = document.getElementById('btn-save-packing') || document.querySelector('#modal-packing button.bg-blue-600') || document.getElementById('btn-save-pack');
    let originalText = btnSave ? btnSave.innerHTML : 'บันทึกข้อมูล';
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = "⏳ กำลังบันทึก...";
    }

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        
        if (result.status === 'success') {
            alert("✅ " + result.message);
            // ถามผู้ใช้ว่าต้องการพิมพ์ใบแปะพาเลทด้วยเลยหรือไม่
            if (confirm("บันทึกข้อมูลสำเร็จ! คุณต้องการพิมพ์ใบระบุพาเลท (Pallet Tag) ด้วยหรือไม่?")) {
                window.printPallet();
                window.closePackingModal();
            } else {
                window.closePackingModal();
            }
        } else {
            alert("❌ เกิดข้อผิดพลาด: " + result.message);
        }
    } catch(err) {
        console.error(err);
        alert("❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = originalText;
        }
    }
};

// 8. ฟังก์ชันจัดการการ Submit ฟอร์ม (กันหน้าเว็บรีเฟรช)
window.submitPacking = function(e) {
    if (e) e.preventDefault();
    window.savePackingToSheet();
};

// 9. ฟังก์ชันพิมพ์ใบพาเลท
window.printPallet = function() {
    const date = document.getElementById('pack-date').value;
    const palletNo = document.getElementById('pack-pallet-no').value;
    const recorder = document.getElementById('pack-recorder').value;

    if (!palletNo) {
        alert("กรุณาเลือกหมายเลขพาเลทก่อนพิมพ์");
        return;
    }

    const rows = document.querySelectorAll('.pack-row');
    const items = [];
    rows.forEach(row => {
        const machine = row.querySelector('.pack-machine').value;
        const product = row.querySelector('.pack-model').value;
        const qty = parseInt(row.querySelector('.pack-qty').value) || 0;
        if (machine && product && qty > 0) {
            items.push({ machine, product, qty });
        }
    });

    if (items.length === 0) {
        alert("กรุณากรอกข้อมูลรายการให้ครบถ้วนก่อนพิมพ์");
        return;
    }

    let itemsHtml = '';
    let totalQty = 0;
    items.forEach((item, index) => {
        itemsHtml += `
            <tr>
                <td style="text-align:center;">${index + 1}</td>
                <td>${item.machine}</td>
                <td>${item.product}</td>
                <td class="right">${item.qty.toLocaleString()}</td>
            </tr>
        `;
        totalQty += item.qty;
    });

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Print Pallet - ${palletNo}</title>
            <style>
                body { font-family: 'Sarabun', sans-serif; padding: 20px; }
                .ticket { border: 2px solid #000; padding: 20px; width: 100%; max-width: 600px; margin: 0 auto; }
                .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                .header h1 { margin: 0; font-size: 24px; text-transform: uppercase; }
                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; font-size: 14px; }
                .pallet-box { text-align: center; background: #000; color: #fff; padding: 10px; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid #000; padding: 8px; font-size: 14px; }
                th { background: #f0f0f0; }
                .right { text-align: right; }
                .total-box { border: 2px solid #000; display: flex; justify-content: space-between; padding: 10px; font-weight: bold; font-size: 16px; }
            </style>
        </head>
        <body>
            <div class="ticket">
                <div class="header">
                    <h1>CWM PALLET TAG</h1>
                    <div style="font-size: 12px; margin-top:5px;">เอกสารระบุข้อมูลสินค้าบนพาเลท</div>
                </div>

                <div class="info-grid">
                    <div><strong>วันที่บรรจุ (Date):</strong> ${date}</div>
                    <div><strong>ผู้บรรจุ (Packer):</strong> ${recorder}</div>
                </div>

                <div class="pallet-box">
                    <div>PALLET NO. ${palletNo}</div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="text-align:center; width:40px;">No.</th>
                            <th>แหล่งที่มา (Machine)</th>
                            <th>รุ่น (Model)</th>
                            <th class="right">จำนวน (Pcs)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <div class="total-box">
                    <div class="lbl">TOTAL QUANTITY / ยอดรวมทั้งพาเลท</div>
                    <div class="val">${totalQty.toLocaleString()} PCS</div>
                </div>
                
                <div style="margin-top:30px; display:flex; justify-content:space-between; font-size:12px; text-align:center;">
                    <div style="width:45%; border-top:1px solid #000; padding-top:5px;">ลายเซ็นผู้บรรจุ (Packer)</div>
                    <div style="width:45%; border-top:1px solid #000; padding-top:5px;">ลายเซ็นผู้ตรวจ (QC/Leader)</div>
                </div>
            </div>
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
};
