// 🗑️ Scrap / Waste Log module (บันทึกขยะ)
// เก็บข้อมูลลง Google Sheet (WasteLog / WasteTypes / WasteItems) ผ่าน backend — port จาก Lug-Screw-management-system
(function(){
  const DEFAULT_TYPES = ['ขยะอันตราย','ขยะรีไซเคิล','ขยะอุตสาหกรรมไม่อันตราย','อื่น ๆ'];
  let typesCache = [];  // [{typeId, typeName}]
  let itemsCache = [];  // [{itemId, itemName, typeId, typeName}]
  let formRowsCache = [];  // รายการขยะวันนี้ (เรียงเก่า→ใหม่) สำหรับเติมในฟอร์ม

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function recorderName(){ return window.currentUser?.name || window.currentUser?.username || '-'; }

  function postScrap(payload){
    return fetch(`${SCRIPT_URL}?_t=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      body: JSON.stringify(payload)
    }).then(r => r.json());
  }

  function nowLocalInput(){
    const d = new Date();
    d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    return d.toISOString().slice(0,16);
  }

  // ===== ชนิดขยะ (Waste Types) =====
  async function loadTypes(){
    try {
      const res = await postScrap({ action: 'GET_WASTE_TYPES' });
      if (res && res.status === 'success' && Array.isArray(res.data) && res.data.length) {
        typesCache = res.data;
      } else {
        typesCache = DEFAULT_TYPES.map(n => ({ typeId: '', typeName: n }));
      }
    } catch(_) {
      typesCache = DEFAULT_TYPES.map(n => ({ typeId: '', typeName: n }));
    }
    renderTypeSelect();
  }

  function renderTypeSelect(){
    const sel = document.getElementById('scrap-type');
    const prev = sel ? sel.value : '';
    if(sel){
      sel.innerHTML = typesCache.map(t => `<option value="${esc(t.typeName)}">${esc(t.typeName)}</option>`).join('');
      if(prev && typesCache.some(t => t.typeName === prev)) sel.value = prev;
    }
    // dropdown ในแผงจัดการรายการขยะ (เลือกชนิดที่จะผูก)
    const itemTypeSel = document.getElementById('scrap-item-type');
    if(itemTypeSel){
      const prevIt = itemTypeSel.value;
      itemTypeSel.innerHTML = typesCache.map(t => `<option value="${esc(t.typeId)}" data-name="${esc(t.typeName)}">${esc(t.typeName)}</option>`).join('');
      if(prevIt) itemTypeSel.value = prevIt;
    }
    // dropdown เลือกประเภทที่จะ export (มีตัวเลือก "ทั้งหมด")
    const expSel = document.getElementById('scrap-export-type');
    if(expSel){
      const prevExp = expSel.value;
      expSel.innerHTML = '<option value="">ทั้งหมด</option>' + typesCache.map(t => `<option value="${esc(t.typeName)}">${esc(t.typeName)}</option>`).join('');
      if(prevExp && typesCache.some(t => t.typeName === prevExp)) expSel.value = prevExp;
    }
    renderTypePanelList();
    renderItemSelect();
  }

  function renderTypePanelList(){
    const box = document.getElementById('scrap-type-list');
    if(!box) return;
    box.innerHTML = typesCache.map(t => {
      const delBtn = t.typeId
        ? `<button data-id="${esc(t.typeId)}" class="btn-scrap-type-del text-red-600 text-xs px-2 py-1 hover:bg-red-50 rounded">ลบ</button>`
        : `<span class="text-[10px] text-gray-400">ค่าเริ่มต้น</span>`;
      return `<div class="flex items-center justify-between bg-white border rounded p-1.5"><span class="text-sm">${esc(t.typeName)}</span>${delBtn}</div>`;
    }).join('');
    box.querySelectorAll('.btn-scrap-type-del').forEach(btn => btn.addEventListener('click', async () => {
      if(typesCache.length <= 1) return alert('ต้องมีชนิดขยะอย่างน้อย 1 รายการ');
      if(!confirm('ลบชนิดขยะนี้?')) return;
      btn.disabled = true;
      try {
        const res = await postScrap({ action: 'DELETE_WASTE_TYPE', typeId: btn.dataset.id, recorder: recorderName(), role: window.currentUser?.role || '' });
        if(res && res.status === 'success') await loadTypes();
        else { alert((res && res.message) || 'ลบไม่สำเร็จ'); btn.disabled = false; }
      } catch(e){ alert('ลบไม่สำเร็จ: ' + e); btn.disabled = false; }
    }));
  }

  // ===== รายการขยะ (Waste Items) — ผูกกับชนิดขยะ =====
  async function loadItems(){
    try {
      const res = await postScrap({ action: 'GET_WASTE_ITEMS' });
      itemsCache = (res && res.status === 'success' && Array.isArray(res.data)) ? res.data : [];
    } catch(_) {
      itemsCache = [];
    }
    renderItemSelect();
    renderItemPanelList();
  }

  // แสดงรายการขยะทั้งหมด จัดกลุ่มตามชนิดขยะ (optgroup) — เลือกแล้วชนิดจะเปลี่ยนตาม
  function renderItemSelect(){
    const sel = document.getElementById('scrap-item');
    if(!sel) return;
    const prev = sel.value;
    const groups = {};
    itemsCache.forEach(it => {
      const key = it.typeName || 'ไม่ระบุชนิด';
      (groups[key] = groups[key] || []).push(it);
    });
    let html = '<option value="">— ไม่ระบุ —</option>';
    html += Object.keys(groups).map(typeName =>
      `<optgroup label="${esc(typeName)}">`
      + groups[typeName].map(it => `<option value="${esc(it.itemName)}" data-type="${esc(it.typeName || '')}">${esc(it.itemName)}</option>`).join('')
      + `</optgroup>`
    ).join('');
    sel.innerHTML = html;
    if(prev && itemsCache.some(it => it.itemName === prev)) sel.value = prev;
  }

  // เลือกรายการขยะ → ตั้งชนิดขยะให้ตรงกับที่ผูกไว้
  function syncTypeFromItem(){
    const itemSel = document.getElementById('scrap-item');
    if(!itemSel) return;
    const opt = itemSel.options[itemSel.selectedIndex];
    const itemType = opt ? (opt.dataset.type || '') : '';
    if(!itemType) return;
    const typeSel = document.getElementById('scrap-type');
    if(typeSel && Array.from(typeSel.options).some(o => o.value === itemType)) typeSel.value = itemType;
  }

  // เปลี่ยนชนิดขยะเอง → ถ้ารายการที่เลือกไม่ตรงชนิด ให้รีเซ็ตรายการ
  function clearItemIfTypeMismatch(){
    const itemSel = document.getElementById('scrap-item');
    const typeVal = document.getElementById('scrap-type')?.value || '';
    if(!itemSel || !itemSel.value) return;
    const opt = itemSel.options[itemSel.selectedIndex];
    const itemType = opt ? (opt.dataset.type || '') : '';
    if(itemType !== typeVal) itemSel.value = '';
  }

  function renderItemPanelList(){
    const box = document.getElementById('scrap-item-list');
    if(!box) return;
    if(!itemsCache.length){
      box.innerHTML = '<div class="text-[11px] text-gray-400 text-center p-2">ยังไม่มีรายการขยะ</div>';
      return;
    }
    // จัดกลุ่มตามชนิดขยะ
    const groups = {};
    itemsCache.forEach(it => {
      const key = it.typeName || 'ไม่ระบุชนิด';
      (groups[key] = groups[key] || []).push(it);
    });
    box.innerHTML = Object.keys(groups).map(typeName => {
      const rows = groups[typeName].map(it => {
        const delBtn = it.itemId
          ? `<button data-id="${esc(it.itemId)}" class="btn-scrap-item-del text-red-600 text-xs px-2 py-1 hover:bg-red-50 rounded">ลบ</button>`
          : '';
        return `<div class="flex items-center justify-between bg-white border rounded p-1.5"><span class="text-sm">${esc(it.itemName)}</span>${delBtn}</div>`;
      }).join('');
      return `<div class="space-y-1"><div class="text-[11px] font-bold text-amber-700 mt-1">${esc(typeName)}</div>${rows}</div>`;
    }).join('');
    box.querySelectorAll('.btn-scrap-item-del').forEach(btn => btn.addEventListener('click', async () => {
      if(!confirm('ลบรายการขยะนี้?')) return;
      btn.disabled = true;
      try {
        const res = await postScrap({ action: 'DELETE_WASTE_ITEM', itemId: btn.dataset.id, recorder: recorderName(), role: window.currentUser?.role || '' });
        if(res && res.status === 'success') await loadItems();
        else { alert((res && res.message) || 'ลบไม่สำเร็จ'); btn.disabled = false; }
      } catch(e){ alert('ลบไม่สำเร็จ: ' + e); btn.disabled = false; }
    }));
  }

  // ===== เดือนที่เลือกสำหรับฟอร์ม/Export =====
  function selectedMonth(){
    const inp = document.getElementById('scrap-export-month');
    if(inp && /^\d{4}-\d{2}$/.test(inp.value || '')) return inp.value;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }

  // โหลดรายการของเดือนที่เลือกมาเติมฟอร์มใบนำส่งขยะ
  async function loadFormMonth(){
    const ym = selectedMonth();
    const [y, m] = ym.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    let items = [];
    try {
      const res = await postScrap({ action: 'GET_WASTE_HISTORY', dateFrom: `${ym}-01`, dateTo: `${ym}-${String(lastDay).padStart(2,'0')}` });
      if(res && res.status === 'success' && Array.isArray(res.data)) items = res.data;
    } catch(_) { items = []; }
    // เรียงจากเก่าไปใหม่สำหรับฟอร์มเอกสาร (ลำดับ No. 1,2,3...)
    formRowsCache = items.slice().sort((a,b) => String(a.Timestamp||'').localeCompare(String(b.Timestamp||'')));
    // ช่องประจำเดือน/ปี ในเอกสารให้ตรงกับเดือนที่เลือก
    const monthInp = document.getElementById('scrap-doc-month');
    if(monthInp) monthInp.value = `${String(m).padStart(2,'0')}/${y}`;
    applyScrapForm();
  }

  // ===== รายการทิ้งขยะ (เลือกช่วงวันที่ได้ — ค่าเริ่มต้นคือวันนี้) =====
  function todayDateStr(){
    const d = new Date();
    d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    return d.toISOString().slice(0,10);
  }

  function scrapListRange(){
    const fromInp = document.getElementById('scrap-list-from');
    const toInp = document.getElementById('scrap-list-to');
    const today = todayDateStr();
    let from = (fromInp?.value || '').trim() || today;
    let to = (toInp?.value || '').trim() || today;
    if(from > to) [from, to] = [to, from];  // สลับให้ถูกลำดับหากเลือกกลับด้าน
    return { from, to };
  }

  async function renderTodayList(){
    const body = document.getElementById('scrap-today-body');
    const totalEl = document.getElementById('scrap-today-total');
    if(!body || !totalEl) return;
    const { from, to } = scrapListRange();
    const singleDay = from === to;
    body.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">กำลังโหลด...</td></tr>';
    let items = [];
    try {
      const res = await postScrap({ action: 'GET_WASTE_HISTORY', dateFrom: from, dateTo: to });
      if(res && res.status === 'success' && Array.isArray(res.data)) items = res.data;
    } catch(_) {
      body.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-red-400">โหลดข้อมูลไม่สำเร็จ</td></tr>';
      totalEl.textContent = 'รวม 0.00 กก.';
      return;
    }

    let total = 0;
    if(!items.length){
      body.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">ไม่มีรายการในช่วงที่เลือก</td></tr>';
      totalEl.textContent = 'รวม 0.00 กก.';
      return;
    }
    body.innerHTML = items.map(x => {
      const w = Number(x.WeightKg || 0);
      total += w;
      const ts = String(x.Timestamp || '');
      // ช่วงวันเดียวโชว์แค่เวลา, ช่วงหลายวันโชว์วันที่+เวลา
      const dt = singleDay
        ? (ts.length >= 16 ? ts.substring(11, 16) : '-')
        : (ts.length >= 16 ? `${ts.substring(0,10)} ${ts.substring(11,16)}` : String(x.Date || '-'));
      const desc = x.WasteItem ? `${esc(x.WasteItem)} <span class="text-[11px] text-gray-400">(${esc(x.WasteType)})</span>` : esc(x.WasteType);
      const delBtn = x.WasteID
        ? `<button data-id="${esc(x.WasteID)}" class="btn-scrap-del text-red-600 hover:bg-red-50 text-xs font-bold px-2 py-1 rounded">🗑️ ลบ</button>`
        : '';
      return `<tr class="border-t"><td class="p-2">${esc(dt)}</td><td class="p-2">${desc}</td><td class="p-2 text-right">${w.toFixed(2)}</td><td class="p-2">${esc(x.RecorderName)}</td><td class="p-2 text-center">${delBtn}</td></tr>`;
    }).join('');
    totalEl.textContent = `รวม ${total.toFixed(2)} กก.`;

    body.querySelectorAll('.btn-scrap-del').forEach(btn => btn.addEventListener('click', async () => {
      if(!confirm('ลบรายการทิ้งขยะนี้?')) return;
      btn.disabled = true;
      try {
        const res = await postScrap({ action: 'DELETE_WASTE', wasteId: btn.dataset.id, recorder: recorderName(), username: window.currentUser?.username || '', role: window.currentUser?.role || '' });
        if(res && res.status === 'success'){ await renderTodayList(); await loadFormMonth(); }  // รีเฟรชทั้งรายการ + ฟอร์มใบนำส่งขยะ
        else { alert((res && res.message) || 'ลบไม่สำเร็จ'); btn.disabled = false; }
      } catch(e){ alert('ลบไม่สำเร็จ: ' + e); btn.disabled = false; }
    }));
  }

  // เติมข้อมูลลงตารางใบนำส่งขยะ (Scrap List) อัตโนมัติ — อย่างน้อย 5 แถวเพื่อความสวยงามของเอกสาร
  function renderScrapForm(rows, hideType){
    const body = document.getElementById('scrap-form-body');
    if(!body) return;
    const MIN_ROWS = 5;
    const dataRows = rows.map((x, idx) => {
      const w = Number(x.WeightKg || 0);
      const dateStr = String(x.Date || x.Timestamp || '').substring(0, 10);
      // เมื่อกรองเป็นประเภทเดียว ช่องประเภทของเสียติ๊กไว้แล้ว จึงไม่ต้องมีวงเล็บประเภทซ้ำ
      const desc = x.WasteItem
        ? (hideType ? esc(x.WasteItem) : `${esc(x.WasteItem)} (${esc(x.WasteType)})`)
        : esc(x.WasteType);
      const recorder = esc(x.RecorderName || '');
      return `<tr class="h-14 border-b border-black">`
        + `<td class="border-r-2 border-black text-center align-middle">${esc(dateStr)}</td>`
        + `<td class="border-r-2 border-black text-center align-middle">${idx + 1}</td>`
        + `<td class="border-r-2 border-black px-2 align-middle">${desc}</td>`
        + `<td class="border-r-2 border-black text-center align-middle">${w.toFixed(2)}</td>`
        + `<td class="border-r-2 border-black text-center align-middle">${recorder}</td>`
        + `<td class="text-center align-middle"></td>`
        + `</tr>`;
    });
    // เติมแถวว่างจนครบขั้นต่ำ
    const emptyRow = `<tr class="h-14 border-b border-black"><td class="border-r-2 border-black"></td><td class="border-r-2 border-black"></td><td class="border-r-2 border-black"></td><td class="border-r-2 border-black"></td><td class="border-r-2 border-black"></td><td></td></tr>`;
    while(dataRows.length < MIN_ROWS) dataRows.push(emptyRow);
    body.innerHTML = dataRows.join('');
  }

  // กรองรายการตามประเภทที่เลือก export แล้วเติมฟอร์ม + ทำเครื่องหมายช่องประเภทของเสีย
  function applyScrapForm(){
    const filterType = document.getElementById('scrap-export-type')?.value || '';
    const rows = filterType ? formRowsCache.filter(x => String(x.WasteType || '') === filterType) : formRowsCache;
    renderScrapForm(rows, !!filterType);
    // ประเภทที่ต้องทำเครื่องหมาย: ถ้าเลือกเฉพาะประเภท ใช้ประเภทนั้น, ถ้าทั้งหมด ใช้ประเภทที่มีในรายการ
    const typeNames = filterType ? [filterType] : Array.from(new Set(rows.map(x => String(x.WasteType || '')).filter(Boolean)));
    updateDocCheckboxes(typeNames);
  }

  // ทำเครื่องหมาย ☑ ในช่อง "ประเภทของเสีย" ให้ตรงกับประเภทที่ปรากฏ
  function updateDocCheckboxes(typeNames){
    const span = document.getElementById('scrap-doc-types');
    if(!span) return;
    const cats = [
      { label: 'ขยะอันตราย 危险垃圾', match: t => t.indexOf('อันตราย') !== -1 && t.indexOf('ไม่') === -1 && t.indexOf('อุตสาหกรรม') === -1 },
      { label: 'ขยะรีไซเคิล 回收垃圾', match: t => t.indexOf('รีไซเคิล') !== -1 },
      { label: 'ขยะอุตสาหกรรมที่ไม่เป็นอันตราย (เศษเหลือใช้จากการผลิต) 非危险工业垃圾（如生产边料）', match: t => t.indexOf('อุตสาหกรรม') !== -1 },
      { label: 'อื่น ๆ (ระบุ) Other 其他 ____________', match: null }  // catch-all
    ];
    const checked = [false, false, false, false];
    (typeNames || []).forEach(t => {
      let idx = cats.findIndex(c => c.match && c.match(t));
      if(idx === -1) idx = 3;  // ประเภทอื่น ๆ
      checked[idx] = true;
    });
    span.innerHTML = cats.map((c, i) => `${checked[i] ? '☑' : '☐'} ${c.label}`).join(' &nbsp;&nbsp;&nbsp; ');
  }

  // ===== Export PDF (ดาวน์โหลดใบนำส่งขยะเป็นไฟล์ PDF) =====
  // โหลดไลบรารีเฉพาะตอนใช้งาน (lazy) เพื่อไม่ให้ถ่วงหน้าอื่น
  function loadScriptOnce(src){
    return new Promise((resolve, reject) => {
      if(Array.from(document.scripts).some(s => s.src === src)) return resolve();
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('โหลดไม่สำเร็จ: ' + src));
      document.head.appendChild(el);
    });
  }

  async function ensurePdfLibs(){
    if(window.html2canvas && window.jspdf) return true;
    try {
      await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      return !!(window.html2canvas && window.jspdf && window.jspdf.jsPDF);
    } catch(_) {
      return false;
    }
  }

  function scrapPdfFilename(){
    const type = document.getElementById('scrap-export-type')?.value || '';
    const suffix = type ? '_' + type.replace(/[\s/\\?%*:|"<>]+/g, '-') : '';
    return `ScrapList_${selectedMonth()}${suffix}.pdf`;
  }

  async function exportScrapPdf(){
    const btn = document.getElementById('btn-scrap-export-pdf');
    const oldLabel = btn ? btn.textContent : '';
    const target = document.querySelector('#scrap-print-area .scrap-doc');
    if(!target){ return legacyPrintScrap(); }

    if(btn){ btn.disabled = true; btn.textContent = 'กำลังสร้าง PDF...'; }
    const ok = await ensurePdfLibs();
    if(!ok){
      if(btn){ btn.disabled = false; btn.textContent = oldLabel; }
      // โหลดไลบรารีไม่ได้ (เช่น ออฟไลน์) → ใช้การพิมพ์ผ่านเบราว์เซอร์แทน
      return legacyPrintScrap();
    }
    try {
      const canvas = await window.html2canvas(target, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: target.scrollWidth,
        scrollX: 0,
        scrollY: 0,
        // html2canvas วาด <input> แล้ว baseline ตก → แปลงเป็นข้อความธรรมดาก่อนแคป
        // ใช้ text-decoration แทน border-bottom เพราะเส้นใต้ยึดกับ baseline ของตัวอักษรโดยตรง
        // (border-bottom ยึดกับกล่อง span ซึ่งบางฟอนต์เตี้ยกว่าตัวอักษร ทำให้เส้นคาดกลางตัวหนังสือ)
        onclone: (clonedDoc) => {
          clonedDoc.querySelectorAll('.scrap-doc-input').forEach(inp => {
            const span = clonedDoc.createElement('span');
            if(inp.value){
              const pad = '\u00A0'.repeat(6);
              span.textContent = pad + inp.value + pad;
              span.style.textDecoration = 'underline';
              span.style.textUnderlineOffset = '4px';
            } else {
              // ช่องว่าง: ใช้ขีดล่างแทน (html2canvas ไม่วาดเส้นใต้บนช่องว่างล้วน)
              span.textContent = '____________';
            }
            inp.parentNode.replaceChild(span, inp);
          });
        }
      });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const imgW = pageW - margin * 2;
      const imgH = canvas.height * imgW / canvas.width;
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      if(imgH <= pageH - margin * 2){
        pdf.addImage(imgData, 'JPEG', margin, margin, imgW, imgH);
      } else {
        // เนื้อหายาวเกินหนึ่งหน้า → แบ่งหลายหน้า
        let heightLeft = imgH;
        let position = margin;
        pdf.addImage(imgData, 'JPEG', margin, position, imgW, imgH);
        heightLeft -= (pageH - margin);
        while(heightLeft > 0){
          position = margin - (imgH - heightLeft);
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', margin, position, imgW, imgH);
          heightLeft -= pageH;
        }
      }
      pdf.save(scrapPdfFilename());
    } catch(e){
      alert('สร้าง PDF ไม่สำเร็จ: ' + e + '\nจะใช้การพิมพ์ผ่านเบราว์เซอร์แทน');
      legacyPrintScrap();
    } finally {
      if(btn){ btn.disabled = false; btn.textContent = oldLabel; }
    }
  }

  // สำรอง: พิมพ์เฉพาะฟอร์มขยะผ่านเบราว์เซอร์ (กรณีสร้าง PDF ตรง ๆ ไม่ได้)
  function legacyPrintScrap(){
    const originalTitle = document.title;
    document.title = 'Scrap_List_' + new Date().toISOString().slice(0,10);
    document.body.classList.add('printing-scrap');
    window.scrollTo(0, 0);
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-scrap');
        document.title = originalTitle;
      }, 800);
    }, 300);
  }

  function initScrap(){
    const recorder = document.getElementById('scrap-recorder');
    const dt = document.getElementById('scrap-datetime');
    if(recorder) recorder.value = recorderName();
    if(dt && !dt.value) dt.value = nowLocalInput();
    // ค่าเริ่มต้นเดือนที่ export = เดือนปัจจุบัน
    const monthSel = document.getElementById('scrap-export-month');
    if(monthSel && !monthSel.value) monthSel.value = selectedMonth();
    // ค่าเริ่มต้นช่วงวันที่ของรายการ = วันนี้
    const listFrom = document.getElementById('scrap-list-from');
    const listTo = document.getElementById('scrap-list-to');
    if(listFrom && !listFrom.value) listFrom.value = todayDateStr();
    if(listTo && !listTo.value) listTo.value = todayDateStr();
    document.getElementById('scrap-list-from')?.addEventListener('change', renderTodayList);
    document.getElementById('scrap-list-to')?.addEventListener('change', renderTodayList);
    document.getElementById('btn-scrap-list-today')?.addEventListener('click', () => {
      if(listFrom) listFrom.value = todayDateStr();
      if(listTo) listTo.value = todayDateStr();
      renderTodayList();
    });
    loadTypes();
    loadItems();
    renderTodayList();
    loadFormMonth();

    // ผูกสองทาง: เลือกรายการ → ตั้งชนิด, เปลี่ยนชนิด → รีเซ็ตรายการที่ไม่ตรง
    document.getElementById('scrap-item')?.addEventListener('change', syncTypeFromItem);
    document.getElementById('scrap-type')?.addEventListener('change', clearItemIfTypeMismatch);

    // แผงจัดการชนิดขยะ
    document.getElementById('btn-scrap-type-panel')?.addEventListener('click', () => {
      document.getElementById('scrap-item-panel')?.classList.add('hidden');
      document.getElementById('scrap-type-panel')?.classList.toggle('hidden');
    });
    document.getElementById('btn-scrap-type-add')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const inp = document.getElementById('scrap-type-new');
      const val = (inp?.value || '').trim();
      if(!val) return;
      btn.disabled = true;
      try {
        const res = await postScrap({ action: 'ADD_WASTE_TYPE', typeName: val, recorder: recorderName(), role: window.currentUser?.role || '' });
        if(res && res.status === 'success'){ inp.value = ''; await loadTypes(); }
        else alert((res && res.message) || 'เพิ่มไม่สำเร็จ');
      } catch(e){ alert('เพิ่มไม่สำเร็จ: ' + e); }
      finally { btn.disabled = false; }
    });

    // แผงจัดการรายการขยะ
    document.getElementById('btn-scrap-item-panel')?.addEventListener('click', () => {
      document.getElementById('scrap-type-panel')?.classList.add('hidden');
      document.getElementById('scrap-item-panel')?.classList.toggle('hidden');
    });
    document.getElementById('btn-scrap-item-add')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const inp = document.getElementById('scrap-item-new');
      const typeSel = document.getElementById('scrap-item-type');
      const val = (inp?.value || '').trim();
      const opt = typeSel?.options[typeSel.selectedIndex];
      const typeName = opt ? (opt.dataset.name || opt.textContent) : '';
      const typeId = typeSel?.value || '';
      if(!val) return alert('กรุณากรอกชื่อรายการขยะ');
      if(!typeName) return alert('กรุณาเลือกชนิดขยะที่จะผูก');
      btn.disabled = true;
      try {
        const res = await postScrap({ action: 'ADD_WASTE_ITEM', itemName: val, typeId: typeId, typeName: typeName, recorder: recorderName(), role: window.currentUser?.role || '' });
        if(res && res.status === 'success'){ inp.value = ''; await loadItems(); }
        else alert((res && res.message) || 'เพิ่มไม่สำเร็จ');
      } catch(e){ alert('เพิ่มไม่สำเร็จ: ' + e); }
      finally { btn.disabled = false; }
    });

    document.getElementById('btn-scrap-reset-time')?.addEventListener('click', () => {
      if(dt) dt.value = nowLocalInput();
    });
    document.getElementById('btn-scrap-export-pdf')?.addEventListener('click', exportScrapPdf);
    // เลือกประเภทที่จะ export → กรองฟอร์ม + ทำเครื่องหมายช่องประเภทของเสียทันที
    document.getElementById('scrap-export-type')?.addEventListener('change', applyScrapForm);
    // เลือกเดือน → โหลดรายการของเดือนนั้นมาเติมฟอร์ม
    document.getElementById('scrap-export-month')?.addEventListener('change', loadFormMonth);

    document.getElementById('btn-scrap-save')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-scrap-save');
      const type = document.getElementById('scrap-type')?.value;
      const item = document.getElementById('scrap-item')?.value || '';
      const weight = Number(document.getElementById('scrap-weight')?.value || 0);
      const datetime = document.getElementById('scrap-datetime')?.value;
      if(!type) return alert('กรุณาเลือกชนิดขยะ');
      if(!(weight > 0)) return alert('กรุณาระบุน้ำหนักมากกว่า 0');
      if(!datetime) return alert('กรุณาระบุวันที่และเวลา');
      const oldLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'กำลังบันทึก...';
      try {
        const res = await postScrap({
          action: 'SUBMIT_WASTE',
          wasteType: type,
          wasteItem: item,
          weightKg: weight,
          recordedAt: datetime,
          recorder: recorderName(),
          username: window.currentUser?.username || '',
          role: window.currentUser?.role || ''
        });
        if(res && res.status === 'success'){
          document.getElementById('scrap-weight').value = '';
          await renderTodayList();  // อัปเดตรายการวันนี้
          await loadFormMonth();    // อัปเดตฟอร์มใบนำส่งขยะของเดือนที่เลือก
        } else {
          alert((res && res.message) || 'บันทึกไม่สำเร็จ');
        }
      } catch(e){ alert('บันทึกไม่สำเร็จ: ' + e); }
      finally { btn.disabled = false; btn.textContent = oldLabel; }
    });
  }

  document.addEventListener('DOMContentLoaded', initScrap);
  // เรียกตอนสลับเข้าแท็บ (js/globals.js) — อัปเดตชื่อผู้บันทึก + โหลดข้อมูลใหม่จาก backend
  window.refreshScrapRecorder = function(){
    const recorder = document.getElementById('scrap-recorder');
    if(recorder) recorder.value = recorderName();
    loadTypes();
    loadItems();
    renderTodayList();
    loadFormMonth();
  };
})();
