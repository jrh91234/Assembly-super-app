const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyt3Bf_2h21BBcCHQSjizowy_kD5vsoUqgaC_YmVjLuQybJO1BBRt3eaSM0PuKEFfvruw/exec";
        
// อาการ NG ต้องมาจาก Cloud เท่านั้น (ไม่มีค่า default ในเครื่อง)
let ngSymptoms = [];
let ngSymptomsLoaded = false;
let productList = ["S1B29288-JR (10A)", "S1B71819-JR (16A)", "S1B29292-JR (20A)", "51207080HC-JR (25/32A)"];
let recorderList = ["พนักงาน 1", "พนักงาน 2"];

let machineMapping = {};
let hiddenWidgets = []; 

const DAY_HOURS = ["08:00-09:00", "09:00-10:00", "10:00-11:00", "11:00-12:00", "12:00-13:00", "13:00-14:00", "14:00-15:00", "15:00-16:00", "16:00-17:00", "OT 17:30-18:00", "OT 18:00-19:00", "OT 19:00-20:00"];
const NIGHT_HOURS = ["20:00-21:00", "21:00-22:00", "22:00-23:00", "23:00-00:00", "00:00-01:00", "01:00-02:00", "02:00-03:00", "03:00-04:00", "04:00-05:00", "OT 05:00-06:00", "OT 06:00-07:00", "OT 07:00-08:00"];

const WIDGET_LIST = [
    { id: 'card-stat-target', label: 'TARGET (PLAN)' },
    { id: 'card-stat-fg', label: 'TOTAL FG' },
    { id: 'card-stat-ach', label: '% ACH' },
    { id: 'card-stat-ng', label: 'TOTAL NG' },
    { id: 'card-stat-yield', label: '% YIELD' },
    { id: 'card-stat-uph', label: 'UPH' },
    { id: 'card-fg-model', label: 'FG & ACH by Model' },
    { id: 'card-job-orders', label: 'Job Order (แผนการผลิต)' },
    { id: 'card-pareto', label: 'NG Analysis (Pareto)' },
    { id: 'card-simulator', label: 'Yield Simulator' },
    { id: 'card-model-analysis', label: 'Model Analysis' },
    { id: 'card-yield-machine', label: '% Yield by Machine' },
    { id: 'card-daily-output', label: 'Daily Output' },
    { id: 'card-qc-trend', label: 'Daily NG Rate Trend' },
    { id: 'card-ng-trend', label: 'Trend อาการ NG' },
    { id: 'card-ng-machine', label: 'NG by Machine' },
    { id: 'card-hourly', label: 'Hourly Production' },
    { id: 'card-ng-breakdown', label: 'NG Breakdown' },
    { id: 'card-table', label: 'Detailed Machine Performance' }
];

let currentRowIdForNg = null;
let batchNgData = {};
let currentDashboardData = null;
let machineDetailChart = null;
let machineDailyChartInst = null; 
let charts = {};
let currentManageType = '';

window.isDualLayout = true;
window.lastBatchId = null;
window.currentUser = null; 

// ==========================================
// 🌟 Utilities & Global UI Functions
// ==========================================

window.formatNumber = function(value, decimals = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "0";
    return num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
};

window.formatKg = function(value, decimals = 2) {
    return window.formatNumber(value, decimals);
};

function systemLog(logType, details) {
    if (!window.currentUser) return;
    const payload = {
        action: 'LOG_ACTION',
        username: window.currentUser.username,
        role: window.currentUser.role,
        logType: logType,
        details: details
    };
    fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) }).catch(e=>console.log("Log error", e));
}

function formatMaintTime(t) {
    if (!t) return '?';
    if (String(t).includes('T')) {
        return t.split('T')[1].substring(0, 5);
    }
    return t;
}

function capitalizeFirst(str) {
    if (!str) return "";
    let strTrimmed = str.trim();
    if (strTrimmed.length > 0) {
        return strTrimmed.charAt(0).toUpperCase() + strTrimmed.slice(1);
    }
    return strTrimmed;
}

function normalizeSymptomList(list) {
    const unique = [];
    list.forEach(item => {
        if (item && item.trim() !== '') {
            const stdStr = capitalizeFirst(item);
            if (!unique.some(u => u.toLowerCase() === stdStr.toLowerCase())) {
                unique.push(stdStr);
            }
        }
    });
    return unique;
}

function normalizeNgSymptomName(raw) {
    const text = (raw || '').trim();
    if (!text) return '';
    const setupMatch = text.match(/^setup\s*-\s*(.+)$/i);
    if (setupMatch) return capitalizeFirst(setupMatch[1]);
    if (text.toLowerCase() === 'setup') return 'Setup';
    return capitalizeFirst(text);
}

function normalizeNgSymptomMasterList(list) {
    const unique = [];
    (list || []).forEach(item => {
        const normalized = normalizeNgSymptomName(item);
        if (!normalized) return;
        if (!unique.some(u => u.toLowerCase() === normalized.toLowerCase())) {
            unique.push(normalized);
        }
    });
    if (!unique.some(s => s.toLowerCase() === 'setup')) {
        unique.push('Setup');
    }
    return unique;
}

function getShiftDateStr() {
    const now = new Date();
    if (now.getHours() < 8) {
        now.setDate(now.getDate() - 1);
    }
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

window.fetchOptions = async function() {
    try {
        const res = await fetch(`${SCRIPT_URL}?action=GET_OPTIONS&_t=${Date.now()}`);
        const data = await res.json();
        
        if (data.recorders && data.recorders.length > 0) {
            recorderList = data.recorders; 
        }
        
        if(typeof window.renderRecorderOptions === 'function') {
            window.renderRecorderOptions();
        }
        
        if (data.ngTypes && data.ngTypes.length > 0) {
            ngSymptoms = normalizeNgSymptomMasterList(data.ngTypes);
            ngSymptomsLoaded = true;
            if (typeof window.renderRtvSymptomsOptions === 'function') {
                window.renderRtvSymptomsOptions();
            }
        }
        
        if (data.machineMapping) {
            machineMapping = data.machineMapping;
            localStorage.setItem('CWM_MACHINE_MAPPING', JSON.stringify(machineMapping));
            
            const rows = document.getElementById('batchList');
            if(rows) {
                for(let r of rows.children) {
                    const mSel = r.querySelector('.machine-select-trigger');
                    const pSel = r.querySelector('.product-select-target');
                    if(mSel && mSel.value && machineMapping[mSel.value]) {
                        pSel.value = machineMapping[mSel.value];
                        pSel.dispatchEvent(new Event('change'));
                    }
                }
            }
        }

        if (data.hiddenWidgets) {
            hiddenWidgets = data.hiddenWidgets;
            if(typeof window.applyWidgetVisibility === 'function') {
                window.applyWidgetVisibility();
            }
        }

    } catch (e) { 
        console.log("Error fetching options", e); 
    }
};

window.initSortable = function() {
    const grid = document.getElementById('sortable-grid');
    if(!grid) return;
    Sortable.create(grid, { 
        handle: '.drag-handle', 
        animation: 150, 
        ghostClass: 'sortable-ghost', 
        onEnd: function() { 
            Object.values(charts).forEach(c => { if(c && typeof c.resize === 'function') c.resize(); }); 
        } 
    });
};

window.toggleMenu = function() {
    const menu = document.getElementById('dropdown-menu');
    if(menu) menu.classList.toggle('hidden');
};

window.toggleLayout = function() {
    const debugOut = document.getElementById('debug-output');
    try {
        if(debugOut) debugOut.innerText += "\n[System] ฟังก์ชัน toggleLayout ทำงานแล้ว...";
        window.isDualLayout = !window.isDualLayout;
        if(debugOut) debugOut.innerText += `\n[System] สถานะเลย์เอาต์ที่ต้องการ: ${window.isDualLayout ? 'คู่' : 'เดี่ยว'}`;
        
        const grid = document.getElementById('sortable-grid');
        const btn = document.getElementById('layoutBtn');
        
        if (!grid || !btn) return;

        if (window.isDualLayout) {
            grid.classList.add('md:grid-cols-2');
            grid.classList.remove('layout-single'); 
            btn.innerText = '🔀 Layout: คู่';
        } else {
            grid.classList.remove('md:grid-cols-2');
            grid.classList.add('layout-single'); 
            btn.innerText = '🔀 Layout: เดี่ยว';
        }
        
        if(debugOut) debugOut.innerText += "\n[System] เปลี่ยนคลาสสำเร็จ เริ่มรีไซส์กราฟ...";

        setTimeout(() => {
            let count = 0;
            Object.values(charts).forEach(c => { 
                if(c && typeof c.resize === 'function') {
                    c.resize(); 
                    count++;
                }
            });
            if(debugOut) debugOut.innerText += `\n[System] รีไซส์กราฟเสร็จสิ้น ${count} อัน (สำเร็จ!)`;
        }, 150);
    } catch (err) {
        if(debugOut) debugOut.innerText += `\n[Fatal Error] โค้ดพัง: ${err.message}`;
    }
};

window.toggleCardSize = function(btn) {
    const card = btn.closest('.widget-card');
    if (card.classList.contains('md:col-span-2')) {
        card.classList.remove('md:col-span-2'); 
    } else {
        card.classList.add('md:col-span-2');
    }
    setTimeout(() => {
        const canvas = card.querySelector('canvas');
        if(canvas) { 
            const chartInstance = Chart.getChart(canvas); 
            if(chartInstance) chartInstance.resize(); 
        }
    }, 150);
};

window.toggleCardHeight = function(btn) {
    const card = btn.closest('.widget-card');
    if (card.classList.contains('h-[350px]')) {
        card.classList.remove('h-[350px]');
        card.classList.add('h-[600px]'); 
    } else if (card.classList.contains('h-[600px]')) {
        card.classList.remove('h-[600px]');
        card.classList.add('h-[350px]');
    }
    setTimeout(() => {
        const canvas = card.querySelector('canvas');
        if(canvas) { 
            const chartInstance = Chart.getChart(canvas); 
            if(chartInstance) chartInstance.resize(); 
        }
    }, 150);
};

// ===== ช่วงข้อมูลที่โหลดมาจริง (queryMeta) =====
// กราฟและรายงานทุกตัวต้องอ้างช่วงนี้ ไม่ใช่ค่าปัจจุบันในช่องกรอง
// เพราะช่องกรองเปลี่ยนได้โดยที่ยังไม่ได้กด 🔍 ค้นหา ทำให้หัวเรื่องไม่ตรงกับตัวเลข
window.getLoadedQueryMeta = function() {
    const data = (typeof currentDashboardData !== 'undefined') ? currentDashboardData : null;
    return (data && data.queryMeta) ? data.queryMeta : null;
};

// เงื่อนไขในช่องกรองตอนนี้ ต่างจากเงื่อนไขที่ใช้โหลดข้อมูลชุดปัจจุบันหรือไม่
window.isFilterStale = function() {
    const meta = window.getLoadedQueryMeta();
    if (!meta) return false;
    const allTime = typeof window.isAllTimeActive === 'function' && window.isAllTimeActive();
    if (allTime !== !!meta.allTime) return true;
    if (allTime) return false;
    const val = (id) => (document.getElementById(id)?.value || '').trim();
    return val('startDate') !== meta.start
        || val('endDate') !== meta.end
        || val('filterShift') !== meta.shift
        || val('filterShiftType') !== meta.shiftType;
};

// ข้อความช่วงวันที่ของข้อมูลที่โหลดมาจริง เช่น "2026-08-05" หรือ "2026-08-01 ถึง 2026-08-05 (5 วัน)"
window.getLoadedRangeLabel = function() {
    const meta = window.getLoadedQueryMeta();
    if (!meta) return '';
    if (meta.allTime) return 'All Time (ข้อมูลทั้งหมด)';
    if (meta.start === meta.end) return meta.start;
    const days = meta.dayCount > 0 ? ` (${meta.dayCount} วันที่มีข้อมูล)` : '';
    return `${meta.start} ถึง ${meta.end}${days}`;
};

window.toggleCardMaximize = function(btn) {
    const card = btn.closest('.widget-card');
    const isMaximized = card.classList.contains('maximized-card');
    
    let dateLabel = card.querySelector('.max-date-label');
    if (!dateLabel) {
        dateLabel = document.createElement('div');
        dateLabel.className = 'max-date-label hidden text-sm font-medium text-blue-600 mb-2 pb-2 border-b border-gray-100 text-center w-full';
        const header = card.querySelector('.widget-header');
        if (header) header.insertAdjacentElement('afterend', dateLabel);
    }
    
    if (isMaximized) {
        card.classList.remove('maximized-card');
        document.body.style.overflow = ''; 
        btn.innerHTML = '⛶'; 
        btn.title = 'ขยายเต็มจอ';
        dateLabel.classList.add('hidden'); 
    } else {
        card.classList.add('maximized-card');
        document.body.style.overflow = 'hidden'; 
        btn.innerHTML = '✖'; 
        btn.title = 'ย่อหน้าจอ';
        
        // ยึดตามเงื่อนไขที่ใช้โหลดข้อมูลชุดที่กราฟกำลังวาดอยู่ (ไม่ใช่ค่าปัจจุบันในช่องกรอง)
        const meta = window.getLoadedQueryMeta();
        const shiftElement = document.getElementById('filterShift');
        const typeElement = document.getElementById('filterShiftType');

        const rangeLabel = meta
            ? window.getLoadedRangeLabel()
            : `${document.getElementById('startDate')?.value || ''} ถึง ${document.getElementById('endDate')?.value || ''}`;
        const shift = meta ? (meta.shiftLabel || meta.shift)
                           : (shiftElement ? shiftElement.options[shiftElement.selectedIndex].text : '');
        const shiftType = meta ? (meta.shiftTypeLabel || meta.shiftType)
                               : (typeElement ? typeElement.options[typeElement.selectedIndex].text : '');

        const staleWarn = window.isFilterStale()
            ? ` <span class="mx-2 text-gray-300">|</span> <span class="text-red-600 font-bold">⚠️ ตัวกรองบนหน้าจอถูกเปลี่ยนแล้ว กด 🔍 ค้นหา เพื่อโหลดข้อมูลใหม่</span>`
            : '';

        dateLabel.innerHTML = `📅 ข้อมูลวันที่: <span class="text-gray-700 font-bold">${rangeLabel}</span> <span class="mx-2 text-gray-300">|</span> กะ: <span class="text-gray-700 font-bold">${shift}</span> <span class="mx-2 text-gray-300">|</span> ช่วง: <span class="text-gray-700 font-bold">${shiftType}</span>${staleWarn}`;
        dateLabel.classList.remove('hidden'); 
    }
    
    setTimeout(() => {
        const canvas = card.querySelector('canvas');
        if(canvas) { 
            const chartInstance = Chart.getChart(canvas); 
            if(chartInstance) {
                chartInstance.resize(); 
                chartInstance.update(); 
            }
        }
    }, 150);
};

window.detectCurrentShift = function() {
    const hour = new Date().getHours();
    let type = (hour >= 8 && hour < 20) ? "Day" : "Night";
    const toggle = document.querySelector(`input[name="shift_type_toggle"][value="${type}"]`);
    if(toggle) toggle.checked = true;
    window.updateHourSlots(type);
};

window.updateHourSlots = function(type) {
    const select = document.getElementById('hourSlot');
    if(!select) return;
    const hours = (type === "Day") ? DAY_HOURS : NIGHT_HOURS;
    select.innerHTML = hours.map(h => `<option value="${h}">${h}</option>`).join('');
    
    const currentHourStr = new Date().getHours().toString().padStart(2, '0') + ":00";
    const match = hours.find(h => h.startsWith(currentHourStr));
    if(match) select.value = match;
};

// 🌟 อัปเดตสิทธิ์การเข้าถึง (สลับ Section) 🌟
window.switchTab = function(tab) {
    if (!window.currentUser) return;
    const role = window.currentUser.role;

    // จำกัดสิทธิ์
    if (role === 'Production' && (tab === 'admin' || tab === 'cost')) return;
    if (role === 'QC' && (tab === 'planning' || tab === 'admin' || tab === 'packing' || tab === 'parts' || tab === 'cost')) return;
    if (role === 'Planning' && (tab === 'form' || tab === 'rw' || tab === 'admin' || tab === 'maint' || tab === 'rtv' || tab === 'scrap' || tab === 'dailycheck' || tab === 'packing' || tab === 'sort' || tab === 'parts' || tab === 'cost')) return;
    if (role === 'Viewer' && tab !== 'dashboard') return;

    // สลับหน้าจอ Section (แยกเมนูที่เป็นลิงก์ออก ไม่ต้องนำมาจัดการในนี้)
    ['inbox', 'form', 'planning', 'dashboard', 'admin', 'rtv', 'scrap', 'dailycheck', 'packing', 'parts', 'cost'].forEach(t => {
        const el = document.getElementById('section-'+t);
        if(el) el.classList.toggle('hidden', t !== tab);

        const btn = document.getElementById('tab-'+t);
        if(btn) {
            if(t === tab) {
                btn.classList.add('tab-active','text-blue-600');
                btn.classList.remove('text-gray-500');
            } else {
                btn.classList.remove('tab-active','text-blue-600');
                btn.classList.add('text-gray-500');
            }
        }
    });
    if(tab === 'inbox' && typeof window.loadInbox === 'function') window.loadInbox();
    if(tab === 'dashboard' && typeof window.loadDashboard === 'function') window.loadDashboard();
    if(tab === 'parts' && typeof window.loadPartsMaster === 'function') window.loadPartsMaster();
    if(tab === 'cost' && typeof window.loadCostModule === 'function') window.loadCostModule();
    if(tab === 'scrap' && typeof window.refreshScrapRecorder === 'function') window.refreshScrapRecorder();
    if(tab === 'dailycheck' && typeof window.loadDailyCheck === 'function') window.loadDailyCheck();
    if(tab === 'planning' && typeof window.loadJobOrders === 'function') window.loadJobOrders();
    // เข้าหน้าบันทึกผลิต: โหลด Job Order ที่ยังเปิดอยู่มาให้เลือก (โหลดครั้งแรกครั้งเดียว)
    if(tab === 'form' && typeof window.loadJobOrders === 'function' && (!window.jobOrderList || window.jobOrderList.length === 0)) {
        window.loadJobOrders(true);
    }
};

function applyPermissions() {
    const role = window.currentUser?.role;
    if (!role) return;

    // รองรับ ID ทั้งรูปแบบเก่าและใหม่ที่คุณอาจจะพิมพ์ลงใน index.html
    const desktopSortIds = ['btn-desktop-sort', 'btn-link-sort'];
    const mobileSortIds = ['tab-sort', 'tab-sort-mobile'];

    // 1. ซ่อนเมนูทั้งหมดก่อน รวมถึงปุ่ม Sort ทุกแบบที่อาจมี
    const allMenus = ['tab-inbox', 'tab-form', 'tab-planning', 'tab-dashboard', 'tab-rw', 'tab-admin', 'tab-maint', 'tab-parts', 'tab-rtv', 'tab-scrap', 'tab-dailycheck', 'tab-packing', 'tab-cost', ...desktopSortIds, ...mobileSortIds];
    
    allMenus.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.classList.add('hidden');
            el.style.setProperty('display', 'none', 'important'); // บังคับซ่อนเด็ดขาด
        }
    });

    let defaultTab = '';
    let allowedMenus = [];

    // 2. กำหนดว่า Role ไหนเห็นเมนูไหนบ้าง
    if (role === 'Production') {
        allowedMenus = ['tab-inbox', 'tab-form', 'tab-planning', 'tab-dashboard', 'tab-rw', 'tab-maint', 'tab-parts', 'tab-rtv', 'tab-scrap', 'tab-dailycheck', 'tab-packing', ...desktopSortIds, ...mobileSortIds];
        defaultTab = 'form';
    }
    else if (role === 'QC') {
        allowedMenus = ['tab-inbox', 'tab-form', 'tab-dashboard', 'tab-rw', 'tab-rtv', 'tab-scrap', 'tab-dailycheck', ...desktopSortIds, ...mobileSortIds];
        defaultTab = 'form';
    }
    else if (role === 'Planning') {
        allowedMenus = ['tab-inbox', 'tab-planning', 'tab-dashboard'];
        defaultTab = 'planning';
    }
    else if (role === 'Viewer') {
        allowedMenus = ['tab-inbox', 'tab-dashboard'];
        defaultTab = 'dashboard';
    } 
    else if (role === 'Admin') {
        allowedMenus = allMenus;
        defaultTab = 'dashboard'; 
        
        const btnWidgetMgr = document.getElementById('btn-widget-manager');
        if (btnWidgetMgr) {
            btnWidgetMgr.classList.remove('hidden');
            btnWidgetMgr.style.display = 'flex';
        }
    }

    // 3. เปิดแสดงเฉพาะปุ่มที่ได้รับสิทธิ์ แบบบังคับเปิดทะลุคลาส Tailwind
    allowedMenus.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.classList.remove('hidden');
            if (id.includes('desktop') || id.includes('link')) {
                el.style.setProperty('display', 'flex', 'important'); // เปิดปุ่ม Desktop
            } else {
                el.style.setProperty('display', 'block', 'important'); // เปิดปุ่ม Hamburger
            }
        }
    });

    window.switchTab(defaultTab);
}

// ==========================================
// Sorting by Timestamp (Reconcile Stock)
// ==========================================
let _sortTsData = [];

window.openSortingTimestampQuery = function() {
    const modal = document.getElementById('modal-sorting-ts');
    if (!modal) return;
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('sortTs-start').value = today;
    document.getElementById('sortTs-end').value = today;
    modal.classList.remove('hidden');
};

window.fetchProductionByTimestamp = async function() {
    const start = document.getElementById('sortTs-start').value.trim();
    const end = document.getElementById('sortTs-end').value.trim();
    const filter = document.getElementById('sortTs-filter').value;
    const resultEl = document.getElementById('sortTs-result');
    const summaryEl = document.getElementById('sortTs-summary');
    if (!start || !end) { alert('กรุณาเลือกวันที่'); return; }

    resultEl.innerHTML = '<p class="text-center text-gray-400 py-8 animate-pulse">กำลังโหลด...</p>';
    summaryEl.textContent = '';

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'GET_PRODUCTION_BY_TIMESTAMP', start, end, filter })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Error');

        _sortTsData = json.data || [];
        const t = json.totals || {};
        const filterLabels = { all: 'ทั้งหมด', fg_only: 'เฉพาะ FG', ng_only: 'เฉพาะ NG', production: 'งานผลิต', sorting: 'Sorting' };
        const filterLabel = filterLabels[filter] || 'ทั้งหมด';
        summaryEl.innerHTML = `[${filterLabel}] รวม <b>${t.rows || 0}</b> รายการ · FG <b class="text-green-700">${(t.fg || 0).toLocaleString()}</b> ชิ้น · NG <b class="text-red-600">${(t.ngPcs || 0).toLocaleString()}</b> ชิ้น (<span class="text-gray-600">${(t.ngKg || 0).toLocaleString()} kg</span>)`;

        if (_sortTsData.length === 0) {
            resultEl.innerHTML = '<p class="text-center text-gray-400 py-8">ไม่พบข้อมูลในช่วงวันที่เลือก</p>';
            document.getElementById('btn-export-sortTs').classList.add('hidden');
            return;
        }

        document.getElementById('btn-export-sortTs').classList.remove('hidden');

        let html = `<table class="w-full text-xs border-collapse">
            <thead class="bg-gray-100 sticky top-0">
                <tr>
                    <th class="p-2 text-left">ประเภท</th>
                    <th class="p-2 text-left">Timestamp</th>
                    <th class="p-2 text-left">เวลา</th>
                    <th class="p-2 text-left">วันที่ผลิต</th>
                    <th class="p-2 text-left">รุ่น</th>
                    <th class="p-2 text-left">Job Order</th>
                    <th class="p-2 text-left">เครื่อง</th>
                    <th class="p-2 text-center">Shift</th>
                    <th class="p-2 text-left">ชม.</th>
                    <th class="p-2 text-left">ผู้บันทึก</th>
                    <th class="p-2 text-right">FG</th>
                    <th class="p-2 text-right">NG (kg)</th>
                    <th class="p-2 text-right">NG (ชิ้น)</th>
                    <th class="p-2 text-left">อาการ NG</th>
                </tr>
            </thead><tbody>`;

        _sortTsData.forEach(r => {
            const dateMismatch = r.tsDate !== r.prodDate;
            const typeColor = r.type === 'Sorting' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700';
            html += `<tr class="border-b hover:bg-gray-50 ${dateMismatch ? 'bg-yellow-50' : ''}">
                <td class="p-2"><span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${typeColor}">${r.type}</span></td>
                <td class="p-2">${r.tsDate}</td>
                <td class="p-2 text-[10px] text-gray-500 font-mono">${r.tsTime || '-'}</td>
                <td class="p-2 ${dateMismatch ? 'text-orange-600 font-bold' : ''}">${r.prodDate}</td>
                <td class="p-2">${r.model}</td>
                <td class="p-2 text-[10px] font-bold text-indigo-700">${r.jobOrder || '-'}</td>
                <td class="p-2">${r.machine}</td>
                <td class="p-2 text-center">${r.shift}</td>
                <td class="p-2 text-[10px]">${r.hour}</td>
                <td class="p-2 text-[10px]">${r.recorder}</td>
                <td class="p-2 text-right text-green-700 font-bold">${r.fg.toLocaleString()}</td>
                <td class="p-2 text-right text-gray-500">${r.ngKg > 0 ? r.ngKg.toFixed(3) : '-'}</td>
                <td class="p-2 text-right text-red-600 font-bold">${r.ngPcs > 0 ? r.ngPcs.toLocaleString() : '-'}</td>
                <td class="p-2 text-[10px] text-gray-600">${r.ngSymptom || '-'}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        html += '<p class="text-[10px] text-gray-400 mt-2">* แถวสีเหลือง = วันที่ผลิตไม่ตรงกับ Timestamp (บันทึกย้อนหลัง) · <span class="px-1 bg-pink-100 text-pink-700 rounded">Sorting</span> = งานคัดแยก · <span class="px-1 bg-blue-100 text-blue-700 rounded">FG</span> = งานผลิตปกติ</p>';
        resultEl.innerHTML = html;
    } catch (e) {
        resultEl.innerHTML = `<p class="text-center text-red-500 py-8">${e.message}</p>`;
    }
};

window.exportProductionTsCsv = function() {
    if (!_sortTsData.length) return;
    const headers = ['Type','Batch_ID','Job_Order','Timestamp_Date','Timestamp_Time','Production_Date','Model','Machine','Shift','Hour','Recorder','FG','NG_Kg','NG_Pcs','NG_Symptom'];
    const rows = _sortTsData.map(r => [r.type, r.batchId, r.jobOrder || '', r.tsDate, r.tsTime, r.prodDate, r.model, r.machine, r.shift, r.hour, r.recorder, r.fg, r.ngKg, r.ngPcs, r.ngSymptom || '']);
    let csv = '﻿' + headers.join(',') + '\n';
    rows.forEach(r => { csv += r.map(v => `"${v}"`).join(',') + '\n'; });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const filter = document.getElementById('sortTs-filter').value;
    a.download = `production_by_timestamp_${filter}_${document.getElementById('sortTs-start').value}_${document.getElementById('sortTs-end').value}.csv`;
    a.click();
};

// ==========================================
// All Time toggle — Dashboard date range
// ==========================================
let _allTimeActive = false;

window.toggleAllTime = function() {
    _allTimeActive = !_allTimeActive;
    const btn = document.getElementById('btnAllTime');
    const startEl = document.getElementById('startDate');
    const endEl = document.getElementById('endDate');
    if (_allTimeActive) {
        btn.classList.remove('bg-white', 'text-gray-600', 'border-gray-300');
        btn.classList.add('bg-amber-500', 'text-white', 'border-amber-500');
        startEl.disabled = true;
        endEl.disabled = true;
        startEl.classList.add('opacity-50');
        endEl.classList.add('opacity-50');
    } else {
        btn.classList.remove('bg-amber-500', 'text-white', 'border-amber-500');
        btn.classList.add('bg-white', 'text-gray-600', 'border-gray-300');
        startEl.disabled = false;
        endEl.disabled = false;
        startEl.classList.remove('opacity-50');
        endEl.classList.remove('opacity-50');
    }
};

window.isAllTimeActive = function() { return _allTimeActive; };

// ==========================================
// Force Refresh — ตรวจสอบเวอร์ชันจาก Config ทุก 60 วินาที
// ==========================================
(function initForceRefreshChecker() {
    async function checkForceRefresh() {
        try {
            const res = await fetch(SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'CHECK_REFRESH' })
            });
            const data = await res.json();
            if (!data.success) return;
            const serverVer = String(data.version || "0");
            const localVer = sessionStorage.getItem('CWM_REFRESH_VER');
            if (!localVer) {
                sessionStorage.setItem('CWM_REFRESH_VER', serverVer);
                return;
            }
            if (serverVer !== localVer) {
                sessionStorage.setItem('CWM_REFRESH_VER', serverVer);
                location.reload(true);
            }
        } catch (e) { /* ignore network errors */ }
    }
    setInterval(checkForceRefresh, 60000);
})();
