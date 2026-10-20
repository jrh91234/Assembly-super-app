// ============================================
// 🖊️ Chart Draw Tool — ตีเส้นบนกราฟแบบ TradingView
// ใช้กับกราฟ Chart.js ใดก็ได้: window.initChartDrawTool(chart, key)
// - ✏️ เส้นแนวโน้ม (ลากจากจุดหนึ่งไปอีกจุด)
// - ━ เส้นแนวนอน (คลิกครั้งเดียว, แสดงค่า % ที่ขอบขวา)
// - ⏱️ วัดคาบเวลา (คลิกวันเริ่ม-วันสิ้นสุด ได้แถบช่วงเวลาพร้อมจำนวนวัน)
// - 🔁 คาบซ้ำ Cycle Lines (กำหนดคาบครั้งเดียว เส้นแบ่งคาบทำซ้ำเท่าๆ กันไปทางขวาจนสุดกราฟ)
// - ✋ โหมดขยับ/แก้ไข (คลิกเลือกเส้น ลากทั้งเส้นหรือลากจุดปลาย, กด Delete ลบเส้นที่เลือก)
// - 🧽 โหมดลบ (คลิกใกล้เส้นเพื่อลบทีละเส้น)
// - ↩️ ลบเส้นล่าสุด / 🗑️ ลบทั้งหมด
// - ⠿ ลาก toolbar ย้ายตำแหน่งได้ (กันบัง legend) และจำตำแหน่งไว้
// เส้นถูกเก็บเป็นพิกัดข้อมูล (วันที่ + ค่า) จึงอยู่ถูกตำแหน่งเมื่อ zoom/pan
// และบันทึกลง localStorage เพื่อให้อยู่ครบตอนเปิดใหม่/re-render
// ============================================

window.chartDrawings = window.chartDrawings || {};

(function() {
    const STORAGE_PREFIX = 'chartDrawings_';
    const COLORS = ['#ef4444', '#3b82f6', '#16a34a', '#8b5cf6', '#111827'];
    const HIT_TOLERANCE = 8; // px ระยะคลิกโดนเส้นในโหมดลบ

    function loadDrawings(key) {
        if (!window.chartDrawings[key]) {
            try {
                window.chartDrawings[key] = JSON.parse(localStorage.getItem(STORAGE_PREFIX + key)) || [];
            } catch (e) { window.chartDrawings[key] = []; }
        }
        return window.chartDrawings[key];
    }

    function saveDrawings(key) {
        try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(window.chartDrawings[key] || [])); } catch (e) {}
    }

    // ---- แปลงพิกัด pixel <-> ข้อมูล (x เก็บเป็น label วันที่ + เศษ index กันช่วงวันที่เปลี่ยน) ----
    function pxToData(chart, px, py) {
        const xs = chart.scales.x, ys = chart.scales.y;
        const labels = chart.data.labels || [];
        const xVal = xs.getValueForPixel(px);
        let i = Math.round(xVal);
        i = Math.max(0, Math.min(labels.length - 1, i));
        return { label: labels[i], off: xVal - i, y: ys.getValueForPixel(py) };
    }

    function dataToPx(chart, pt) {
        const labels = chart.data.labels || [];
        const idx = labels.indexOf(pt.label);
        if (idx < 0) return null; // วันที่นี้ไม่อยู่ในช่วงข้อมูลปัจจุบัน
        return { x: chart.scales.x.getPixelForValue(idx + (pt.off || 0)), y: chart.scales.y.getPixelForValue(pt.y) };
    }

    function hexToRgba(hex, alpha) {
        const n = parseInt(hex.slice(1), 16);
        return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
    }

    // ข้อความบอกความยาวคาบเวลา: นับจากวันที่จริงถ้า parse ได้ ไม่งั้นนับจำนวนช่วงบนแกน
    function timeSpanText(chart, d) {
        const t1 = Date.parse(d.p1.label), t2 = Date.parse(d.p2.label);
        if (!isNaN(t1) && !isNaN(t2)) return Math.abs(Math.round((t2 - t1) / 86400000)) + ' วัน';
        const labels = chart.data.labels || [];
        return Math.abs(labels.indexOf(d.p2.label) - labels.indexOf(d.p1.label)) + ' ช่วง';
    }

    // ตำแหน่ง x (pixel) ของเส้นแบ่งคาบซ้ำทั้งหมด: เริ่มที่คาบแรก ทำซ้ำความกว้างเท่ากันไปทางขวาจนพ้นกราฟ
    function cycleXs(chart, d) {
        const labels = chart.data.labels || [];
        const i1 = labels.indexOf(d.p1.label), i2 = labels.indexOf(d.p2.label);
        if (i1 < 0 || i2 < 0) return null;
        const a1 = i1 + (d.p1.off || 0), a2 = i2 + (d.p2.off || 0);
        const start = Math.min(a1, a2), w = Math.abs(a2 - a1);
        const xs = chart.scales.x;
        const startPx = xs.getPixelForValue(start);
        const wPx = xs.getPixelForValue(start + w) - startPx;
        if (!(wPx > 4)) return null; // คาบแคบเกินไป
        const area = chart.chartArea;
        const arr = [];
        for (let k = 0; k < 300; k++) {
            const x = startPx + k * wPx;
            arr.push(x);
            if (x > area.right) break;
        }
        return arr;
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    // ตำแหน่ง pixel ของเส้น (null = อยู่นอกช่วงข้อมูลปัจจุบัน)
    function linePixels(chart, d) {
        const area = chart.chartArea;
        if (d.type === 'h') {
            // เส้นแนวนอนขึ้นกับค่า y อย่างเดียว ไม่ผูกกับช่วงวันที่
            const y = chart.scales.y.getPixelForValue(d.p1.y);
            return { x1: area.left, y1: y, x2: area.right, y2: y };
        }
        const p1 = dataToPx(chart, d.p1), p2 = dataToPx(chart, d.p2);
        if (!p1 || !p2) return null;
        return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }

    // ---- วาดเส้นทั้งหมดของกราฟ (เรียกจาก plugin) ----
    function drawLine(chart, ctx, d, preview) {
        const area = chart.chartArea;
        if (d.type === 'time') { drawTimeSpan(chart, ctx, d, preview); return; }
        if (d.type === 'cycle') { drawCycle(chart, ctx, d, preview); return; }
        const px = linePixels(chart, d);
        if (!px) return;
        const { x1, y1, x2, y2 } = px;
        const selected = chart.$drawSelected === d;
        ctx.save();
        ctx.beginPath();
        ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
        ctx.clip();
        ctx.strokeStyle = d.color;
        ctx.lineWidth = selected ? 3 : 2;
        if (preview) ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // จุดปลาย (เส้นที่ถูกเลือกแสดง handle ใหญ่ขึ้นสำหรับลากแก้ไข)
        if (d.type !== 'h') {
            ctx.setLineDash([]);
            [[x1, y1], [x2, y2]].forEach(([x, y]) => {
                ctx.beginPath(); ctx.arc(x, y, selected ? 5 : 3, 0, Math.PI * 2);
                ctx.fillStyle = selected ? '#ffffff' : d.color;
                ctx.fill();
                if (selected) { ctx.strokeStyle = d.color; ctx.lineWidth = 2; ctx.stroke(); }
            });
        }
        // ป้ายค่าของเส้นแนวนอน (หน่วยตามกราฟ เช่น %)
        if (d.type === 'h') {
            const txt = (typeof d.p1.y === 'number' ? d.p1.y.toFixed(2) : d.p1.y) + (chart.$drawSuffix || '');
            ctx.font = 'bold 11px sans-serif';
            const w = ctx.measureText(txt).width + 8;
            ctx.fillStyle = d.color;
            ctx.fillRect(area.right - w, y1 - 9, w, 18);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(txt, area.right - w / 2, y1);
        }
        ctx.restore();
    }

    // ---- แถบวัดคาบเวลา (Date Range แบบ TradingView) ----
    function drawTimeSpan(chart, ctx, d, preview) {
        const area = chart.chartArea;
        const q1 = dataToPx(chart, d.p1), q2 = dataToPx(chart, d.p2);
        if (!q1 || !q2) return;
        const xa = Math.min(q1.x, q2.x), xb = Math.max(q1.x, q2.x);
        const selected = chart.$drawSelected === d;
        const midY = (area.top + area.bottom) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
        ctx.clip();
        // พื้นแถบโปร่งแสง
        ctx.fillStyle = hexToRgba(d.color, selected ? 0.16 : 0.10);
        ctx.fillRect(xa, area.top, xb - xa, area.bottom - area.top);
        // เส้นขอบซ้าย-ขวา
        ctx.strokeStyle = d.color;
        ctx.lineWidth = selected ? 3 : 2;
        if (preview) ctx.setLineDash([5, 4]);
        [xa, xb].forEach(x => {
            ctx.beginPath(); ctx.moveTo(x, area.top); ctx.lineTo(x, area.bottom); ctx.stroke();
        });
        // เส้นเชื่อมกลาง + ป้ายจำนวนวัน
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xa, midY); ctx.lineTo(xb, midY); ctx.stroke();
        ctx.setLineDash([]);
        const txt = timeSpanText(chart, d);
        ctx.font = 'bold 11px sans-serif';
        const w = ctx.measureText(txt).width + 10;
        const lx = (xa + xb) / 2;
        ctx.fillStyle = d.color;
        ctx.fillRect(lx - w / 2, area.top + 4, w, 18);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, lx, area.top + 13);
        // handle สำหรับลากขอบตอนถูกเลือก
        if (selected) {
            [xa, xb].forEach(x => {
                ctx.beginPath(); ctx.arc(x, midY, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff'; ctx.fill();
                ctx.strokeStyle = d.color; ctx.lineWidth = 2; ctx.stroke();
            });
        }
        ctx.restore();
    }

    // ---- เส้นแบ่งคาบซ้ำ (Cycle Lines แบบ TradingView) ----
    function drawCycle(chart, ctx, d, preview) {
        const area = chart.chartArea;
        const xs = cycleXs(chart, d);
        if (!xs || xs.length < 2) return;
        const selected = chart.$drawSelected === d;
        const midY = (area.top + area.bottom) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
        ctx.clip();
        // แรเงาสลับคาบเว้นคาบให้เห็นจังหวะ
        ctx.fillStyle = hexToRgba(d.color, 0.06);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            ctx.fillRect(xs[k], area.top, xs[k + 1] - xs[k], area.bottom - area.top);
        }
        // เส้นแบ่งคาบ
        ctx.strokeStyle = d.color;
        ctx.lineWidth = selected ? 3 : 2;
        ctx.setLineDash(preview ? [5, 4] : [7, 4]);
        xs.forEach(x => {
            ctx.beginPath(); ctx.moveTo(x, area.top); ctx.lineTo(x, area.bottom); ctx.stroke();
        });
        ctx.setLineDash([]);
        // ป้ายความยาวคาบในคาบแรก
        const txt = timeSpanText(chart, d) + '/รอบ';
        ctx.font = 'bold 11px sans-serif';
        const w = ctx.measureText(txt).width + 10;
        const lx = (xs[0] + xs[1]) / 2;
        ctx.fillStyle = d.color;
        ctx.fillRect(lx - w / 2, area.top + 4, w, 18);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, lx, area.top + 13);
        // handle ที่เส้นแรก (ย้ายทั้งชุด) และเส้นที่สอง (ปรับความกว้างคาบ)
        if (selected) {
            [xs[0], xs[1]].forEach(x => {
                ctx.beginPath(); ctx.arc(x, midY, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff'; ctx.fill();
                ctx.strokeStyle = d.color; ctx.lineWidth = 2; ctx.stroke();
            });
        }
        ctx.restore();
    }

    let pluginRegistered = false;
    function ensurePlugin() {
        if (pluginRegistered || typeof Chart === 'undefined') return;
        pluginRegistered = true;
        Chart.register({
            id: 'userDrawTool',
            afterDatasetsDraw(chart) {
                const key = chart.$drawKey;
                if (!key) return;
                const ctx = chart.ctx;
                (window.chartDrawings[key] || []).forEach(d => drawLine(chart, ctx, d));
                if (chart.$drawTemp) drawLine(chart, ctx, chart.$drawTemp, true);
            }
        });
    }

    // ---- Toolbar ----
    function buildToolbar(chart, key, state) {
        const parent = chart.canvas.parentElement;
        if (!parent) return;
        const old = parent.querySelector('.chart-draw-toolbar');
        if (old) old.remove();
        if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

        const bar = document.createElement('div');
        bar.className = 'chart-draw-toolbar';
        bar.style.cssText = 'position:absolute;top:4px;left:4px;z-index:20;display:flex;gap:2px;background:rgba(255,255,255,0.9);border:1px solid #e5e7eb;border-radius:8px;padding:2px;box-shadow:0 1px 3px rgba(0,0,0,0.1);';

        // ตำแหน่งที่ผู้ใช้เคยลากไว้ (จำต่อกราฟ)
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'toolbarPos_' + key));
            if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
                bar.style.left = saved.left + 'px';
                bar.style.top = saved.top + 'px';
            }
        } catch (e) {}

        // ⠿ ที่จับสำหรับลากย้าย toolbar
        const grip = document.createElement('div');
        grip.textContent = '⠿';
        grip.title = 'ลากเพื่อย้ายแถบเครื่องมือ';
        grip.style.cssText = 'cursor:grab;color:#9ca3af;font-size:12px;display:flex;align-items:center;justify-content:center;width:16px;user-select:none;touch-action:none;';
        grip.addEventListener('pointerdown', function(e) {
            e.preventDefault(); e.stopPropagation();
            grip.setPointerCapture(e.pointerId);
            grip.style.cursor = 'grabbing';
            const startX = e.clientX, startY = e.clientY;
            const startLeft = bar.offsetLeft, startTop = bar.offsetTop;
            function move(ev) {
                // จำกัดไม่ให้หลุดออกนอกกรอบกราฟ
                const maxL = Math.max(0, parent.clientWidth - bar.offsetWidth);
                const maxT = Math.max(0, parent.clientHeight - bar.offsetHeight);
                bar.style.left = Math.max(0, Math.min(maxL, startLeft + ev.clientX - startX)) + 'px';
                bar.style.top = Math.max(0, Math.min(maxT, startTop + ev.clientY - startY)) + 'px';
            }
            function up(ev) {
                grip.releasePointerCapture(ev.pointerId);
                grip.style.cursor = 'grab';
                grip.removeEventListener('pointermove', move);
                grip.removeEventListener('pointerup', up);
                try { localStorage.setItem(STORAGE_PREFIX + 'toolbarPos_' + key, JSON.stringify({ left: bar.offsetLeft, top: bar.offsetTop })); } catch (err) {}
            }
            grip.addEventListener('pointermove', move);
            grip.addEventListener('pointerup', up);
        });
        bar.appendChild(grip);

        const btnStyle = 'border:none;background:transparent;border-radius:6px;width:26px;height:26px;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;';

        function mkBtn(icon, title, onClick) {
            const b = document.createElement('button');
            b.type = 'button';
            b.style.cssText = btnStyle;
            b.title = title;
            b.innerHTML = icon;
            b.addEventListener('click', (e) => { e.stopPropagation(); onClick(b); });
            bar.appendChild(b);
            return b;
        }

        function refreshActive() {
            [state.btnTrend, state.btnH, state.btnTime, state.btnCycle, state.btnEdit, state.btnErase].forEach(b => { if (b) b.style.background = 'transparent'; });
            const map = { trend: state.btnTrend, h: state.btnH, time: state.btnTime, cycle: state.btnCycle, edit: state.btnEdit, erase: state.btnErase };
            if (state.mode && map[state.mode]) map[state.mode].style.background = '#fde68a';
            chart.canvas.style.cursor = state.mode === 'edit' ? 'grab' : (state.mode ? 'crosshair' : '');
        }

        state.setMode = function(mode) {
            state.mode = (state.mode === mode) ? null : mode;
            state.pending = null;
            state.drag = null;
            chart.$drawTemp = null;
            chart.$drawSelected = null;
            chart.$drawMode = state.mode; // ให้ onClick ของกราฟหลักเช็คได้
            // ปิด pan ของ zoom plugin ระหว่างวาด กันลากกราฟชนกับลากเส้น
            const zoomOpts = chart.options.plugins && chart.options.plugins.zoom;
            if (zoomOpts && zoomOpts.pan) {
                if (state.savedPan === undefined) state.savedPan = zoomOpts.pan.enabled;
                zoomOpts.pan.enabled = state.mode ? false : state.savedPan;
                chart.update('none');
            } else {
                chart.draw();
            }
            refreshActive();
        };

        state.btnTrend = mkBtn('✏️', 'วาดเส้นแนวโน้ม (คลิกจุดเริ่ม แล้วคลิกจุดปลาย)', () => state.setMode('trend'));
        state.btnH = mkBtn('━', 'วาดเส้นแนวนอน (คลิก 1 ครั้งที่ระดับที่ต้องการ)', () => state.setMode('h'));
        state.btnTime = mkBtn('⏱️', 'วัดคาบเวลา (คลิกวันเริ่ม แล้วคลิกวันสิ้นสุด ได้แถบพร้อมจำนวนวัน)', () => state.setMode('time'));
        state.btnCycle = mkBtn('🔁', 'คาบซ้ำ Cycle Lines (คลิกกำหนดคาบแรก เส้นแบ่งทำซ้ำเท่าๆ กันไปทางขวาจนสุดกราฟ)', () => state.setMode('cycle'));
        state.btnEdit = mkBtn('✋', 'ขยับ/แก้ไขเส้น (คลิกเลือกเส้น ลากทั้งเส้นหรือลากจุดปลาย, กด Delete ลบ)', () => state.setMode('edit'));

        const colorBtn = mkBtn('', 'เปลี่ยนสีเส้น', (b) => {
            state.colorIdx = (state.colorIdx + 1) % COLORS.length;
            b.querySelector('span').style.background = COLORS[state.colorIdx];
        });
        colorBtn.innerHTML = '<span style="display:block;width:14px;height:14px;border-radius:50%;background:' + COLORS[state.colorIdx] + ';"></span>';

        state.btnErase = mkBtn('🧽', 'โหมดลบ (คลิกใกล้เส้นเพื่อลบ)', () => state.setMode('erase'));
        mkBtn('↩️', 'ลบเส้นล่าสุด', () => {
            const list = loadDrawings(key);
            list.pop();
            saveDrawings(key);
            chart.draw();
        });
        mkBtn('🗑️', 'ลบเส้นทั้งหมด', () => {
            window.chartDrawings[key] = [];
            saveDrawings(key);
            chart.draw();
        });

        parent.appendChild(bar);
        refreshActive();
    }

    // ---- Event handlers บน canvas ----
    function bindEvents(chart, key, state) {
        const canvas = chart.canvas;
        // ถอด handler เก่า (กรณี re-render สร้าง chart ใหม่บน canvas เดิม)
        if (canvas.$drawHandlers) {
            Object.entries(canvas.$drawHandlers).forEach(([ev, fn]) => canvas.removeEventListener(ev, fn));
        }

        function getPos(e) {
            const rect = canvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }

        function inArea(p) {
            const a = chart.chartArea;
            return p.x >= a.left && p.x <= a.right && p.y >= a.top && p.y <= a.bottom;
        }

        // ระยะจากจุดคลิกถึงเส้น/แถบ (แถบเวลา: โดนขอบ = ระยะจริง, คลิกข้างในแถบ = โดนแบบ priority ต่ำ)
        function hitDist(d, p) {
            const a = chart.chartArea;
            if (d.type === 'cycle') {
                const xs = cycleXs(chart, d);
                if (!xs || p.y < a.top || p.y > a.bottom) return Infinity;
                return Math.min.apply(null, xs.map(x => Math.abs(p.x - x)));
            }
            if (d.type === 'time') {
                const q1 = dataToPx(chart, d.p1), q2 = dataToPx(chart, d.p2);
                if (!q1 || !q2 || p.y < a.top || p.y > a.bottom) return Infinity;
                const xa = Math.min(q1.x, q2.x), xb = Math.max(q1.x, q2.x);
                const edge = Math.min(Math.abs(p.x - xa), Math.abs(p.x - xb));
                if (edge < HIT_TOLERANCE) return edge;
                return (p.x > xa && p.x < xb) ? HIT_TOLERANCE - 0.5 : Infinity;
            }
            const px = linePixels(chart, d);
            if (!px) return Infinity;
            return distToSegment(p.x, p.y, px.x1, px.y1, px.x2, px.y2);
        }

        // หาเส้นที่อยู่ใกล้จุดคลิกที่สุด (ใช้ทั้งโหมดลบและโหมดขยับ)
        function hitTestLine(p) {
            const list = loadDrawings(key);
            let bestIdx = -1, bestDist = HIT_TOLERANCE;
            list.forEach((d, i) => {
                const dist = hitDist(d, p);
                if (dist < bestDist) { bestDist = dist; bestIdx = i; }
            });
            return bestIdx;
        }

        const onDown = function(e) {
            if (!state.mode) return;
            const p = getPos(e);
            if (!inArea(p)) return;
            e.preventDefault(); e.stopPropagation();

            if (state.mode === 'h') {
                const pt = pxToData(chart, p.x, p.y);
                loadDrawings(key).push({ type: 'h', p1: pt, color: COLORS[state.colorIdx] });
                saveDrawings(key);
                chart.draw();
                return;
            }
            if (state.mode === 'erase') {
                const idx = hitTestLine(p);
                if (idx >= 0) {
                    loadDrawings(key).splice(idx, 1);
                    saveDrawings(key);
                    chart.draw();
                }
                return;
            }
            if (state.mode === 'edit') {
                // คลิกเลือกเส้น: โดนจุดปลาย/ขอบแถบ = ลากปรับจุดนั้น, โดนตัวเส้น/ในแถบ = ลากทั้งเส้น
                const list = loadDrawings(key);
                const a = chart.chartArea;
                let hit = null;
                for (const d of list) {
                    if (d.type === 'cycle') {
                        // เส้นที่สอง = ปรับความกว้างคาบ, เส้นอื่นๆ = ย้ายทั้งชุด
                        const q1 = dataToPx(chart, d.p1), q2 = dataToPx(chart, d.p2);
                        const xs = cycleXs(chart, d);
                        if (!q1 || !q2 || !xs || p.y < a.top || p.y > a.bottom) continue;
                        const px = { x1: q1.x, y1: a.top, x2: q2.x, y2: a.bottom };
                        if (Math.abs(p.x - q2.x) <= HIT_TOLERANCE) { hit = { d, kind: 'p2', px }; break; }
                        if (xs.some(x => Math.abs(p.x - x) <= HIT_TOLERANCE)) { hit = { d, kind: 'body', px }; break; }
                        continue;
                    }
                    if (d.type === 'time') {
                        const q1 = dataToPx(chart, d.p1), q2 = dataToPx(chart, d.p2);
                        if (!q1 || !q2 || p.y < a.top || p.y > a.bottom) continue;
                        const px = { x1: q1.x, y1: a.top, x2: q2.x, y2: a.bottom };
                        if (Math.abs(p.x - q1.x) <= HIT_TOLERANCE) { hit = { d, kind: 'p1', px }; break; }
                        if (Math.abs(p.x - q2.x) <= HIT_TOLERANCE) { hit = { d, kind: 'p2', px }; break; }
                        if (p.x > Math.min(q1.x, q2.x) && p.x < Math.max(q1.x, q2.x)) { hit = { d, kind: 'body', px }; break; }
                        continue;
                    }
                    const px = linePixels(chart, d);
                    if (!px) continue;
                    if (d.type !== 'h') {
                        if (Math.hypot(p.x - px.x1, p.y - px.y1) <= HIT_TOLERANCE) { hit = { d, kind: 'p1', px }; break; }
                        if (Math.hypot(p.x - px.x2, p.y - px.y2) <= HIT_TOLERANCE) { hit = { d, kind: 'p2', px }; break; }
                    }
                    if (distToSegment(p.x, p.y, px.x1, px.y1, px.x2, px.y2) <= HIT_TOLERANCE) { hit = { d, kind: 'body', px }; break; }
                }
                chart.$drawSelected = hit ? hit.d : null;
                state.drag = hit ? { d: hit.d, kind: hit.kind, startX: p.x, startY: p.y, orig: hit.px } : null;
                chart.canvas.style.cursor = hit ? 'grabbing' : 'grab';
                chart.draw();
                return;
            }
            // โหมดเส้นแนวโน้ม/คาบเวลา: คลิกแรก = จุดเริ่ม, คลิกสอง = จุดจบ
            if (!state.pending) {
                state.pending = pxToData(chart, p.x, p.y);
            } else {
                const p2 = pxToData(chart, p.x, p.y);
                loadDrawings(key).push({ type: state.mode, p1: state.pending, p2: p2, color: COLORS[state.colorIdx] });
                saveDrawings(key);
                state.pending = null;
                chart.$drawTemp = null;
                chart.draw();
            }
        };

        const onMove = function(e) {
            // ลากขยับ/แก้ไขเส้นที่เลือกในโหมด edit
            if (state.mode === 'edit' && state.drag) {
                e.preventDefault();
                const p = getPos(e);
                const dx = p.x - state.drag.startX, dy = p.y - state.drag.startY;
                const d = state.drag.d, o = state.drag.orig;
                if (d.type === 'time' || d.type === 'cycle') {
                    // แถบเวลา/คาบซ้ำขยับเฉพาะแกนวันที่ (ลากขอบ = ปรับข้างนั้น, ลากตัวเส้น = เลื่อนทั้งชุด)
                    const k = state.drag.kind;
                    if (k === 'p1' || k === 'body') {
                        const n1 = pxToData(chart, o.x1 + dx, o.y1);
                        d.p1.label = n1.label; d.p1.off = n1.off;
                    }
                    if (k === 'p2' || k === 'body') {
                        const n2 = pxToData(chart, o.x2 + dx, o.y1);
                        d.p2.label = n2.label; d.p2.off = n2.off;
                    }
                } else if (d.type === 'h') {
                    d.p1.y = chart.scales.y.getValueForPixel(o.y1 + dy);
                } else if (state.drag.kind === 'p1') {
                    d.p1 = pxToData(chart, o.x1 + dx, o.y1 + dy);
                } else if (state.drag.kind === 'p2') {
                    d.p2 = pxToData(chart, o.x2 + dx, o.y2 + dy);
                } else {
                    d.p1 = pxToData(chart, o.x1 + dx, o.y1 + dy);
                    d.p2 = pxToData(chart, o.x2 + dx, o.y2 + dy);
                }
                chart.draw();
                return;
            }
            if ((state.mode !== 'trend' && state.mode !== 'time' && state.mode !== 'cycle') || !state.pending) return;
            const p = getPos(e);
            chart.$drawTemp = { type: state.mode, p1: state.pending, p2: pxToData(chart, p.x, p.y), color: COLORS[state.colorIdx] };
            chart.draw();
        };

        const onUp = function() {
            if (state.drag) {
                state.drag = null;
                saveDrawings(key);
                if (state.mode === 'edit') chart.canvas.style.cursor = 'grab';
            }
        };

        const onKey = function(e) {
            if (e.key === 'Escape' && state.mode) state.setMode(state.mode); // toggle ปิด
            // Delete/Backspace ลบเส้นที่เลือกอยู่ในโหมดขยับ
            if ((e.key === 'Delete' || e.key === 'Backspace') && chart.$drawSelected) {
                const list = loadDrawings(key);
                const i = list.indexOf(chart.$drawSelected);
                if (i >= 0) list.splice(i, 1);
                chart.$drawSelected = null;
                state.drag = null;
                saveDrawings(key);
                chart.draw();
            }
        };

        canvas.$drawHandlers = { pointerdown: onDown, pointermove: onMove };
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        // pointerup ผูกกับ document เพื่อจับการปล่อยเมาส์นอก canvas ด้วย
        if (canvas.$drawUpHandler) document.removeEventListener('pointerup', canvas.$drawUpHandler);
        canvas.$drawUpHandler = onUp;
        document.addEventListener('pointerup', onUp);
        // Escape ผูกกับ document ครั้งเดียวต่อ canvas
        if (canvas.$drawKeyHandler) document.removeEventListener('keydown', canvas.$drawKeyHandler);
        canvas.$drawKeyHandler = onKey;
        document.addEventListener('keydown', onKey);
    }

    window.initChartDrawTool = function(chart, key, opts) {
        if (!chart || !chart.canvas) return;
        ensurePlugin();
        loadDrawings(key);
        chart.$drawKey = key;
        chart.$drawSuffix = (opts && opts.suffix !== undefined) ? opts.suffix : '%';
        const state = { mode: null, pending: null, colorIdx: 0 };
        buildToolbar(chart, key, state);
        bindEvents(chart, key, state);
        // วาดเส้นที่บันทึกไว้ทันที (กันเฟรมแรกที่ render ก่อน init เสร็จ)
        if ((window.chartDrawings[key] || []).length) requestAnimationFrame(() => { if (chart.ctx) chart.draw(); });
    };
})();
