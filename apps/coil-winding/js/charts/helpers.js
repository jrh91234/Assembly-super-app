try { Chart.register(ChartDataLabels); } catch(e) { console.warn("ChartDataLabels not loaded"); }

// ==========================================
// Helper: แยก Setup vs Production จาก NG data
// "Setup - ลวดถลอก (Scratched)" → base = "ลวดถลอก (Scratched)", isSetup = true
// ==========================================
window.parseSetupType = function(typeName) {
    const t = (typeName || '').trim();
    const match = t.match(/^setup\s*-\s*(.+)$/i);
    if (match) return { base: capitalizeFirst(match[1].trim()), isSetup: true };
    if (t.toLowerCase() === 'setup') return { base: 'Setup', isSetup: true };
    return { base: capitalizeFirst(t), isSetup: false };
};

// รวม NG data โดยแยกชั้น Production vs Setup
// input: { "ลวดถลอก (Scratched)": 100, "Setup - ลวดถลอก (Scratched)": 30, "พันหลวม (Loose)": 50 }
// output: { labels: [...], production: [...], setup: [...] }
window.separateSetupData = function(breakdownMap) {
    const prodMap = {};
    const setupMap = {};

    Object.entries(breakdownMap || {}).forEach(([type, val]) => {
        const parsed = window.parseSetupType(type);
        if (parsed.base.toLowerCase() === 'setup') {
            // "Setup" ที่ไม่มี sub-symptom → ไม่รวมเข้ากับอาการอื่น
            prodMap[parsed.base] = (prodMap[parsed.base] || 0) + val;
        } else if (parsed.isSetup) {
            setupMap[parsed.base] = (setupMap[parsed.base] || 0) + val;
        } else {
            prodMap[parsed.base] = (prodMap[parsed.base] || 0) + val;
        }
    });

    // รวม labels ทั้งหมด (unique)
    const allLabels = [...new Set([...Object.keys(prodMap), ...Object.keys(setupMap)])];
    // sort by total descending
    allLabels.sort((a, b) => ((prodMap[b] || 0) + (setupMap[b] || 0)) - ((prodMap[a] || 0) + (setupMap[a] || 0)));

    return {
        labels: allLabels,
        production: allLabels.map(l => prodMap[l] || 0),
        setup: allLabels.map(l => setupMap[l] || 0),
        total: allLabels.map(l => (prodMap[l] || 0) + (setupMap[l] || 0))
    };
};

// ==========================================
// Helper: WPP (Weight Per Piece) — shared, strict (no fallback)
// ==========================================
const WPP_TABLE = { "10A": 0.00228, "16A": 0.00279, "20A": 0.00357, "25/32A": 0.005335 };

window.getWppStrict = function(prod) {
    if (!prod) return null;
    for (const k in WPP_TABLE) { if (prod.includes(k)) return WPP_TABLE[k]; }
    return null;
};

window.getKgFromPcs = function(prod, pcs) {
    if (!pcs || pcs <= 0) return 0;
    const w = window.getWppStrict(prod);
    if (w === null) return 0;
    return pcs * w;
};


// ==========================================
// Helper: จัดกลุ่มข้อมูลตามช่วงเวลา (รายวัน / สัปดาห์ / เดือน / ไตรมาส / ปี) — แบบกราฟหุ้น
// ใช้ร่วมกันทุกกราฟที่มีแกนเวลา: เลือกช่วงแล้วกราฟรวมข้อมูลเป็นช่วงนั้นทันที
// ==========================================
window.CHART_PERIODS = [
    { value: 'day',     short: 'วัน',     title: 'รายวัน' },
    { value: 'week',    short: 'สัปดาห์', title: 'รายสัปดาห์ (จันทร์–อาทิตย์)' },
    { value: 'month',   short: 'เดือน',   title: 'รายเดือน' },
    { value: 'quarter', short: 'ไตรมาส',  title: 'รายไตรมาส (Quarter)' },
    { value: 'year',    short: 'ปี',      title: 'รายปี' }
];
const PERIOD_STORE_KEY = 'chartPeriods';
const _PERIOD_THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// อ่านวันที่จากสตริง (yyyy-MM-dd หรือ yyyy-MM) → Date (เวลาท้องถิ่น) หรือ null
const _parsePeriodDate = function(dateStr) {
    const s = String(dateStr || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
    if (m) return new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1);
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
};
const _periodPad2 = (n) => String(n).padStart(2, '0');

// คืน key ของช่วงเวลาที่วันที่นั้นอยู่ (เรียงตามตัวอักษรได้ถูกลำดับเวลา)
//   day → 2026-10-13 · week → 2026-10-12 (วันจันทร์) · month → 2026-10 · quarter → 2026-Q4 · year → 2026
window.getPeriodKey = function(dateStr, period) {
    if (!period || period === 'day') return dateStr;
    const dt = _parsePeriodDate(dateStr);
    if (!dt) return dateStr;
    const y = dt.getFullYear();
    if (period === 'week') {
        const day = dt.getDay();
        dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day));
        return `${dt.getFullYear()}-${_periodPad2(dt.getMonth() + 1)}-${_periodPad2(dt.getDate())}`;
    }
    if (period === 'month') return `${y}-${_periodPad2(dt.getMonth() + 1)}`;
    if (period === 'quarter') return `${y}-Q${Math.floor(dt.getMonth() / 3) + 1}`;
    if (period === 'year') return String(y);
    return dateStr;
};

// ข้อความสั้นบนแกน X
window.formatPeriodLabel = function(key, period) {
    if (!period || period === 'day') return key;
    if (period === 'week') {
        const dt = _parsePeriodDate(key);
        return dt ? `W ${_periodPad2(dt.getDate())}/${_periodPad2(dt.getMonth() + 1)}/${String(dt.getFullYear()).slice(2)}` : key;
    }
    if (period === 'month') {
        const dt = _parsePeriodDate(key);
        return dt ? `${_PERIOD_THAI_MONTHS[dt.getMonth()]} ${String(dt.getFullYear()).slice(2)}` : key;
    }
    if (period === 'quarter') {
        const m = String(key).match(/^(\d{4})-Q(\d)$/);
        return m ? `Q${m[2]}/${m[1]}` : key;
    }
    return String(key);
};

// ข้อความเต็มสำหรับ tooltip / หัว popup เช่น "สัปดาห์ 12/10/2026 – 18/10/2026"
window.formatPeriodTitle = function(key, period) {
    if (!period || period === 'day') return key;
    const fmt = (d) => `${_periodPad2(d.getDate())}/${_periodPad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    if (period === 'week') {
        const s = _parsePeriodDate(key);
        if (!s) return key;
        const e = new Date(s); e.setDate(e.getDate() + 6);
        return `สัปดาห์ ${fmt(s)} – ${fmt(e)}`;
    }
    if (period === 'month') {
        const dt = _parsePeriodDate(key);
        return dt ? `เดือน ${_PERIOD_THAI_MONTHS[dt.getMonth()]} ${dt.getFullYear()}` : key;
    }
    if (period === 'quarter') return 'ไตรมาส ' + window.formatPeriodLabel(key, period);
    if (period === 'year') return 'ปี ' + key;
    return String(key);
};

// จัดกลุ่มแถวข้อมูลตามช่วงเวลา
//   rows: array, getDate(row) → 'yyyy-MM-dd', init(key) → ก้อนว่าง, add(acc, row) → บวกค่าเข้า
//   คืน [{ key, label, title, dates: [...], ...acc }] เรียงตามเวลา
window.groupRowsByPeriod = function(rows, period, getDate, init, add) {
    const map = {};
    const keys = [];
    (rows || []).forEach(row => {
        const date = getDate(row);
        const key = window.getPeriodKey(date, period);
        if (!(key in map)) {
            map[key] = Object.assign({ key, dates: [] }, init(key));
            keys.push(key);
        }
        map[key].dates.push(date);
        add(map[key], row);
    });
    keys.sort();
    return keys.map(k => Object.assign(map[k], {
        label: window.formatPeriodLabel(k, period),
        title: window.formatPeriodTitle(k, period)
    }));
};

// รวม object ตัวเลข { key: n } เข้าด้วยกัน (เช่น ngBreakdown)
window.mergeNumberMap = function(target, src) {
    Object.entries(src || {}).forEach(([k, v]) => { target[k] = (target[k] || 0) + (Number(v) || 0); });
    return target;
};

// ---------- สถานะช่วงเวลาของแต่ละกราฟ + ปุ่มสลับ ----------
// renderer ของแต่ละกราฟลงทะเบียนไว้ที่นี่ เพื่อให้กดปุ่มแล้ววาดใหม่ทันที
window.chartPeriodRenderers = window.chartPeriodRenderers || {};
window.registerChartPeriod = function(chartKey, renderFn) {
    window.chartPeriodRenderers[chartKey] = renderFn;
};

const _loadChartPeriods = function() {
    try { return JSON.parse(localStorage.getItem(PERIOD_STORE_KEY) || '{}') || {}; } catch (e) { return {}; }
};
window.chartPeriodState = window.chartPeriodState || _loadChartPeriods();

window.getChartPeriod = function(chartKey, allowed) {
    const p = window.chartPeriodState[chartKey] || 'day';
    if (allowed && allowed.indexOf(p) === -1) return allowed[0];
    return p;
};

// วาดปุ่มสลับลงใน <div class="chart-period-switch" data-period-chart="..." data-periods="day,week,...">
window.renderPeriodSwitches = function(root) {
    (root || document).querySelectorAll('.chart-period-switch').forEach(el => {
        const chartKey = el.getAttribute('data-period-chart');
        const allowed = (el.getAttribute('data-periods') || 'day,week,month,quarter,year').split(',');
        const cur = chartKey === '__all' ? (window.chartPeriodState.__all || '') : window.getChartPeriod(chartKey, allowed);
        el.innerHTML = window.CHART_PERIODS.filter(p => allowed.indexOf(p.value) !== -1).map(p => {
            const active = p.value === cur;
            const cls = active
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-indigo-50';
            return `<button type="button" title="${p.title}" onclick="window.setChartPeriod('${chartKey}','${p.value}')" class="px-1.5 py-0.5 text-[10px] font-bold border ${cls} first:rounded-l last:rounded-r -ml-px first:ml-0">${p.short}</button>`;
        }).join('');
        el.classList.add('inline-flex', 'items-center');
    });
};

// เลือกช่วงเวลาให้กราฟเดียว หรือ '__all' = ทุกกราฟพร้อมกัน แล้ววาดใหม่ทันที
window.setChartPeriod = function(chartKey, period) {
    const st = window.chartPeriodState;
    let toRender;
    if (chartKey === '__all') {
        st.__all = period;
        Object.keys(window.chartPeriodRenderers).forEach(k => { st[k] = period; });
        document.querySelectorAll('.chart-period-switch').forEach(el => {
            const k = el.getAttribute('data-period-chart');
            if (k && k !== '__all') st[k] = period;
        });
        toRender = Object.keys(window.chartPeriodRenderers);
    } else {
        st[chartKey] = period;
        delete st.__all; // ปรับรายกราฟแล้ว ปุ่ม "ทุกกราฟ" ไม่ไฮไลต์
        toRender = [chartKey];
    }
    try { localStorage.setItem(PERIOD_STORE_KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
    window.renderPeriodSwitches();
    const done = new Set();
    toRender.forEach(k => {
        const fn = window.chartPeriodRenderers[k];
        if (typeof fn !== 'function' || done.has(fn)) return;
        done.add(fn);
        try { fn(); } catch (e) { console.error('period render ' + k, e); }
    });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.renderPeriodSwitches());
} else {
    window.renderPeriodSwitches();
}
