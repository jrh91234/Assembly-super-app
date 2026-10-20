// ✅ Daily Check — OK 1st Part Workstation Check list (Winding Coil)
// ตรวจทุกเครื่อง (CWM-01..16) ทุกกะ — เก็บลงชีต Daily_Check ผ่าน backend (SAVE_DAILY_CHECK / GET_DAILY_CHECKS)
(function(){
  const MACHINES = Array.from({length: 16}, (_, i) => 'CWM-' + String(i + 1).padStart(2, '0'));
  // รายการตรวจตามแบบฟอร์ม "Ok 1st Part Workstation Check list" (key = ชื่อคอลัมน์ในชีต)
  const CHECK_ITEMS = [
    { key: 'C1',  no: '1*', freq: 'เริ่มกะ', title: 'ความปลอดภัยส่วนบุคคล', detail: '1) มี PPE ตามที่ระบุไว้ใน OWS? 2) PPE ชำรุด เสียหาย?' },
    { key: 'C2',  no: '2*', freq: 'เริ่มกะ', title: 'ความปลอดภัยของเครื่องจักร', detail: '1) ทำ AM checklist?' },
    { key: 'C3',  no: '3',  freq: 'เริ่มกะ', title: '5S at station', detail: '1) ตรวจสอบ 5ส' },
    { key: 'C4',  no: '4',  freq: 'เริ่มกะ', title: 'กล่องเหลือง / แดง', detail: '1) มีกล่องเหลือง/แดง ตามที่กำหนดไว้? 2) กล่องต้องไม่มีชิ้นงาน ก่อนเริ่มงาน' },
    { key: 'C5',  no: '5*', freq: 'เริ่ม/เปลี่ยนรุ่น', title: 'OWS', detail: '1) มี OWS อยู่ ณ จุดที่ทำงาน?' },
    { key: 'C6',  no: '6',  freq: 'เริ่ม/เปลี่ยนรุ่น', title: 'วัตถุดิบ/ชิ้นส่วน', detail: '1) ชิ้นส่วนถูกต้อง ครบถ้วน? 2) มีการชี้บ่งหมายเลขชิ้นส่วนอย่างชัดเจน?' },
    { key: 'C7',  no: '7*', freq: 'เริ่ม/เปลี่ยนรุ่น', title: 'เครื่องมือวัด', detail: '1) เครื่องมือวัด/ทดสอบ มี sticker สอบเทียบ? 2) ดู sticker สอบเทียบว่าหมดอายุ?' },
    { key: 'C8',  no: '8*', freq: 'เริ่ม/เปลี่ยนรุ่น', title: 'ตัวอย่างงานเสีย', detail: '1) ตัวอย่างงานเสียมีการชี้บ่งชัดเจน? 2) ดูตัวอย่างหมดอายุหรือไม่?' },
    { key: 'C9',  no: '9*', freq: 'เริ่ม/เปลี่ยนรุ่น', title: 'PY-JD', detail: '1) มีการทดสอบ PY-JD? 2) PY-JD สามารถใช้งานได้?' },
    { key: 'C10', no: '10*', freq: 'เริ่ม/เปลี่ยนรุ่น', title: 'ผลการตรวจชิ้นงานตัวแรก', detail: '1) ชิ้นงานตัวแรกถูกต้อง ตรงตาม CTQ ที่กำหนดไว้?' },
    { key: 'C11', no: '*',  freq: 'เริ่ม/เปลี่ยนรุ่น', title: 'ผลการตรวจสอบชิ้นงานตัวสุดท้าย', detail: '1) ชิ้นงานตัวสุดท้ายถูกต้องตรงตาม CTQ ที่กำหนดไว้?' }
  ];
  const SHIFT_LABEL = { Day: 'กะเช้า', Night: 'กะดึก' };

  let shiftRecords = [];  // รายการของวัน/กะที่เลือก (สำหรับตารางสถานะเครื่อง)
  let histRecords = [];
  let formState = {};     // { C1: 'OK' | 'NOK' | 'N/A' }
  let initialized = false;

  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function $(id){ return document.getElementById(id); }
  function userName(){ return window.currentUser?.name || window.currentUser?.username || '-'; }

  function postDc(payload){
    return fetch(`${SCRIPT_URL}?_t=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      body: JSON.stringify(payload)
    }).then(r => r.json());
  }

  // กะปัจจุบัน: 08:00-19:59 = Day, 20:00-07:59 = Night (วันที่ตัดรอบ 08:00 ตาม getShiftDateStr)
  function currentShift(){
    const h = new Date().getHours();
    return (h >= 8 && h < 20) ? 'Day' : 'Night';
  }
  function nowTime(){
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function addDays(dateStr, n){
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function calcResult(state){
    const vals = CHECK_ITEMS.map(it => state[it.key]);
    if (vals.some(v => v === 'NOK')) return 'NOK';
    if (vals.every(v => v === 'OK' || v === 'N/A')) return 'OK';
    return '';
  }

  // ===== สถานะเครื่องของวัน/กะที่เลือก =====
  async function loadShift(){
    const date = $('dc-date').value;
    const shift = $('dc-shift').value;
    const grid = $('dc-machine-grid');
    grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-3">กำลังโหลด...</div>';
    try {
      const res = await postDc({ action: 'GET_DAILY_CHECKS', dateFrom: date, dateTo: date });
      shiftRecords = (res && res.status === 'success' ? res.data : []).filter(r => r.Shift === shift);
    } catch (e) {
      shiftRecords = [];
      grid.innerHTML = '<div class="col-span-full text-center text-red-500 py-3">โหลดข้อมูลไม่สำเร็จ</div>';
      return;
    }
    renderGrid();
  }

  function renderGrid(){
    const grid = $('dc-machine-grid');
    let okCount = 0, nokCount = 0;
    grid.innerHTML = MACHINES.map(mc => {
      const recs = shiftRecords.filter(r => r.Machine === mc);
      // ใช้ผลล่าสุดของเครื่องนั้นในกะ (เรียงตาม Timestamp ใหม่สุดมาก่อนจาก backend)
      const last = recs[0];
      let cls = 'bg-gray-50 border-gray-300 text-gray-500';
      let status = 'ยังไม่ตรวจ';
      if (last) {
        if (last.Result === 'NOK') { cls = 'bg-red-50 border-red-400 text-red-700'; status = 'NOK'; nokCount++; }
        else { cls = 'bg-green-50 border-green-400 text-green-700'; status = 'OK'; okCount++; }
      }
      const sub = last ? `${esc(last.Check_Time)} · ${esc(last.Inspector)}${recs.length > 1 ? ` (${recs.length} ครั้ง)` : ''}` : '&nbsp;';
      return `<button type="button" data-mc="${mc}" class="dc-mc-btn border-2 rounded-lg p-2 text-center hover:shadow ${cls}">
        <div class="font-bold text-sm">${mc}</div>
        <div class="text-xs font-bold">${status}</div>
        <div class="text-[10px] truncate">${sub}</div>
      </button>`;
    }).join('');
    grid.querySelectorAll('.dc-mc-btn').forEach(btn => btn.addEventListener('click', () => openForm(btn.dataset.mc)));
    const missing = MACHINES.length - okCount - nokCount;
    $('dc-summary').innerHTML = `<span class="font-bold">${SHIFT_LABEL[$('dc-shift').value]} ${esc($('dc-date').value)}</span> — ` +
      `ตรวจแล้ว <b class="text-green-700">${okCount + nokCount}/${MACHINES.length}</b> เครื่อง` +
      (nokCount ? ` · <b class="text-red-600">NOK ${nokCount}</b>` : '') +
      (missing ? ` · <b class="text-gray-600">ยังไม่ตรวจ ${missing}</b>` : ' · <b class="text-green-700">ครบทุกเครื่อง ✔</b>');
  }

  // ===== ฟอร์มบันทึก =====
  function renderItems(){
    $('dc-items').innerHTML = CHECK_ITEMS.map(it => {
      const v = formState[it.key] || '';
      const btn = (val, on, off) => `<button type="button" data-key="${it.key}" data-val="${val}" class="dc-opt px-3 py-1.5 rounded-lg border text-xs font-bold ${v === val ? on : off}">${val}</button>`;
      return `<div class="flex flex-col md:flex-row md:items-center gap-2 border rounded-lg p-2 ${v === 'NOK' ? 'border-red-300 bg-red-50' : 'border-gray-200'}">
        <div class="flex-1">
          <div class="text-sm font-bold text-gray-800"><span class="text-green-700">${esc(it.no)}</span> ${esc(it.title)} <span class="text-[10px] font-normal text-gray-400">(${esc(it.freq)})</span></div>
          <div class="text-xs text-gray-500">${esc(it.detail)}</div>
        </div>
        <div class="flex gap-1">
          ${btn('OK', 'bg-green-600 text-white border-green-600', 'bg-white text-green-700 border-green-300')}
          ${btn('NOK', 'bg-red-600 text-white border-red-600', 'bg-white text-red-600 border-red-300')}
          ${btn('N/A', 'bg-gray-500 text-white border-gray-500', 'bg-white text-gray-500 border-gray-300')}
        </div>
      </div>`;
    }).join('');
    $('dc-items').querySelectorAll('.dc-opt').forEach(b => b.addEventListener('click', () => {
      formState[b.dataset.key] = b.dataset.val;
      renderItems();
    }));
    const result = calcResult(formState);
    const resEl = $('dc-result');
    resEl.textContent = result || 'ยังตรวจไม่ครบ';
    resEl.className = 'font-bold ' + (result === 'OK' ? 'text-green-700' : result === 'NOK' ? 'text-red-600' : 'text-gray-400');
    $('dc-remark-req').classList.toggle('hidden', result !== 'NOK');
  }

  function fillProductOptions(machine){
    const sel = $('dc-product');
    const products = (typeof productList !== 'undefined' && Array.isArray(productList)) ? productList : [];
    sel.innerHTML = '<option value="">เลือกรุ่น...</option>' + products.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    const mapped = (typeof machineMapping !== 'undefined' && machineMapping) ? machineMapping[machine] : '';
    if (mapped) {
      if (!products.includes(mapped)) sel.insertAdjacentHTML('beforeend', `<option value="${esc(mapped)}">${esc(mapped)}</option>`);
      sel.value = mapped;
    }
  }

  function openForm(machine){
    $('dc-form-card').classList.remove('hidden');
    $('dc-machine').value = machine;
    $('dc-form-title').textContent = `${machine} · ${SHIFT_LABEL[$('dc-shift').value]} ${$('dc-date').value}`;
    fillProductOptions(machine);
    $('dc-time').value = nowTime();
    // ถ้าเครื่องนี้ตรวจในกะนี้แล้ว ให้ default เป็น "เปลี่ยนรุ่น"
    $('dc-type').value = shiftRecords.some(r => r.Machine === machine) ? 'เปลี่ยนรุ่น' : 'เริ่มกะ';
    $('dc-inspector').value = userName();
    $('dc-remark').value = '';
    formState = {};
    renderItems();
    $('dc-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveForm(){
    const machine = $('dc-machine').value;
    const product = $('dc-product').value;
    const missing = CHECK_ITEMS.filter(it => !formState[it.key]);
    if (!machine) return alert('กรุณาเลือกเครื่อง');
    if (!product) return alert('กรุณาเลือก Product reference');
    if (missing.length) return alert('กรุณาตรวจให้ครบทุกข้อ (ยังขาด: ' + missing.map(m => m.no).join(', ') + ')');
    const result = calcResult(formState);
    const remark = $('dc-remark').value.trim();
    if (result === 'NOK' && !remark) return alert('มีข้อที่ NOK — กรุณาระบุหมายเหตุ / Recovery plan');

    const btn = $('btn-dc-save');
    btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
    try {
      const res = await postDc(Object.assign({
        action: 'SAVE_DAILY_CHECK',
        shiftDate: $('dc-date').value,
        shift: $('dc-shift').value,
        checkTime: $('dc-time').value,
        machine: machine,
        product: product,
        checkType: $('dc-type').value,
        result: result,
        remark: remark,
        inspector: userName(),
        username: window.currentUser?.username || '',
        role: window.currentUser?.role || ''
      }, { items: Object.assign({}, formState) }));
      if (res && res.status === 'success') {
        $('dc-form-card').classList.add('hidden');
        if (result === 'NOK') alert('บันทึกแล้ว (ผล NOK) — แจ้งหัวหน้างานเพื่อดำเนินการแก้ไข');
        await loadShift();
        loadHistory();
      } else {
        alert('บันทึกไม่สำเร็จ: ' + (res?.message || 'unknown error'));
      }
    } catch (e) {
      alert('บันทึกไม่สำเร็จ: ' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = '💾 บันทึกผลตรวจ';
    }
  }

  // ===== ประวัติ =====
  function renderHistHead(){
    $('dc-hist-head').innerHTML = `<tr>
      <th class="p-1.5 text-left">วันที่</th><th class="p-1.5">กะ</th><th class="p-1.5">เวลา</th><th class="p-1.5">MC</th>
      <th class="p-1.5 text-left">Product</th><th class="p-1.5">จังหวะ</th>
      ${CHECK_ITEMS.map(it => `<th class="p-1.5" title="${esc(it.title)}">${esc(it.no)}</th>`).join('')}
      <th class="p-1.5">ผล</th><th class="p-1.5 text-left">ผู้ตรวจ</th><th class="p-1.5 text-left">หัวหน้างานยืนยัน</th><th class="p-1.5 text-left">หมายเหตุ</th>
    </tr>`;
  }

  async function loadHistory(){
    const body = $('dc-hist-body');
    const cols = 11 + CHECK_ITEMS.length;
    body.innerHTML = `<tr><td colspan="${cols}" class="p-4 text-center text-gray-400">กำลังโหลด...</td></tr>`;
    try {
      const res = await postDc({
        action: 'GET_DAILY_CHECKS',
        dateFrom: $('dc-hist-from').value,
        dateTo: $('dc-hist-to').value,
        machine: $('dc-hist-machine').value
      });
      histRecords = res && res.status === 'success' ? res.data : [];
    } catch (e) {
      histRecords = [];
      body.innerHTML = `<tr><td colspan="${cols}" class="p-4 text-center text-red-500">โหลดข้อมูลไม่สำเร็จ</td></tr>`;
      return;
    }
    if (!histRecords.length) {
      body.innerHTML = `<tr><td colspan="${cols}" class="p-4 text-center text-gray-400">ไม่พบข้อมูล</td></tr>`;
      return;
    }
    const role = window.currentUser?.role;
    const canConfirm = role === 'Admin' || role === 'Production' || role === 'QC';
    body.innerHTML = histRecords.map(r => {
      const cell = v => {
        const c = v === 'OK' ? 'text-green-700' : v === 'NOK' ? 'text-red-600 font-bold bg-red-50' : 'text-gray-400';
        return `<td class="p-1.5 text-center ${c}">${v === 'OK' ? '✓' : esc(v || '-')}</td>`;
      };
      const confirmCell = r.Supervisor
        ? `<span class="text-green-700">${esc(r.Supervisor)}</span>`
        : (canConfirm ? `<button type="button" data-id="${esc(r.Check_ID)}" class="dc-confirm bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700 px-2 py-0.5 rounded text-[11px] font-bold">ยืนยัน</button>` : '-');
      const delBtn = role === 'Admin' ? ` <button type="button" data-id="${esc(r.Check_ID)}" class="dc-del text-red-500 hover:text-red-700 text-[11px]" title="ลบ">🗑️</button>` : '';
      return `<tr class="border-t ${r.Result === 'NOK' ? 'bg-red-50/50' : ''}">
        <td class="p-1.5 whitespace-nowrap">${esc(r.Shift_Date)}</td>
        <td class="p-1.5 text-center">${esc(SHIFT_LABEL[r.Shift] || r.Shift)}</td>
        <td class="p-1.5 text-center">${esc(r.Check_Time)}</td>
        <td class="p-1.5 text-center font-bold">${esc(r.Machine)}</td>
        <td class="p-1.5 whitespace-nowrap">${esc(r.Product)}</td>
        <td class="p-1.5 text-center whitespace-nowrap">${esc(r.Check_Type)}</td>
        ${CHECK_ITEMS.map(it => cell(r[it.key])).join('')}
        <td class="p-1.5 text-center font-bold ${r.Result === 'NOK' ? 'text-red-600' : 'text-green-700'}">${esc(r.Result)}</td>
        <td class="p-1.5 whitespace-nowrap">${esc(r.Inspector)}</td>
        <td class="p-1.5 whitespace-nowrap">${confirmCell}${delBtn}</td>
        <td class="p-1.5">${esc(r.Remark)}</td>
      </tr>`;
    }).join('');
    body.querySelectorAll('.dc-confirm').forEach(b => b.addEventListener('click', () => confirmCheck(b)));
    body.querySelectorAll('.dc-del').forEach(b => b.addEventListener('click', () => deleteCheck(b)));
  }

  async function confirmCheck(btn){
    if (!confirm('ยืนยันผลการตรวจนี้ในฐานะหัวหน้างาน?')) return;
    btn.disabled = true;
    try {
      const res = await postDc({ action: 'CONFIRM_DAILY_CHECK', checkId: btn.dataset.id, supervisor: userName(), username: window.currentUser?.username || '', role: window.currentUser?.role || '' });
      if (res && res.status === 'success') loadHistory();
      else { alert('ยืนยันไม่สำเร็จ: ' + (res?.message || '')); btn.disabled = false; }
    } catch (e) { alert('ยืนยันไม่สำเร็จ: ' + e.message); btn.disabled = false; }
  }

  async function deleteCheck(btn){
    if (!confirm('ลบรายการตรวจนี้?')) return;
    btn.disabled = true;
    try {
      const res = await postDc({ action: 'DELETE_DAILY_CHECK', checkId: btn.dataset.id, username: window.currentUser?.username || '', role: window.currentUser?.role || '' });
      if (res && res.status === 'success') { loadHistory(); loadShift(); }
      else { alert('ลบไม่สำเร็จ: ' + (res?.message || '')); btn.disabled = false; }
    } catch (e) { alert('ลบไม่สำเร็จ: ' + e.message); btn.disabled = false; }
  }

  function exportCsv(){
    if (!histRecords.length) return alert('ไม่มีข้อมูลสำหรับ export');
    const header = ['Date', 'Shift', 'Time', 'MC', 'Product reference', 'Check type']
      .concat(CHECK_ITEMS.map(it => `${it.no} ${it.title}`))
      .concat(['Result', 'Inspector', 'Supervisor', 'Confirmed_At', 'Remark']);
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [header.map(q).join(',')].concat(histRecords.map(r => [
      r.Shift_Date, SHIFT_LABEL[r.Shift] || r.Shift, r.Check_Time, r.Machine, r.Product, r.Check_Type
    ].concat(CHECK_ITEMS.map(it => r[it.key])).concat([r.Result, r.Inspector, r.Supervisor, r.Confirmed_At, r.Remark]).map(q).join(',')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `OK1stPart_DailyCheck_${$('dc-hist-from').value}_${$('dc-hist-to').value}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function init(){
    if (initialized) return;
    initialized = true;
    const today = getShiftDateStr();
    $('dc-date').value = today;
    $('dc-shift').value = currentShift();
    $('dc-hist-from').value = addDays(today, -6);
    $('dc-hist-to').value = today;
    $('dc-machine').innerHTML = MACHINES.map(m => `<option value="${m}">${m}</option>`).join('');
    $('dc-hist-machine').innerHTML = '<option value="">ทั้งหมด</option>' + MACHINES.map(m => `<option value="${m}">${m}</option>`).join('');
    renderHistHead();

    $('btn-dc-refresh').addEventListener('click', loadShift);
    $('dc-date').addEventListener('change', loadShift);
    $('dc-shift').addEventListener('change', loadShift);
    $('dc-machine').addEventListener('change', () => openForm($('dc-machine').value));
    $('btn-dc-close').addEventListener('click', () => $('dc-form-card').classList.add('hidden'));
    $('btn-dc-all-ok').addEventListener('click', () => {
      CHECK_ITEMS.forEach(it => { if (formState[it.key] !== 'N/A') formState[it.key] = 'OK'; });
      renderItems();
    });
    $('btn-dc-save').addEventListener('click', saveForm);
    $('btn-dc-hist').addEventListener('click', loadHistory);
    $('btn-dc-csv').addEventListener('click', exportCsv);
  }

  window.loadDailyCheck = function(){
    init();
    loadShift();
    loadHistory();
  };
})();
