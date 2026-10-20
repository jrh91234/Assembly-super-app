// =====================================================
// APPEARANCE INSPECTION (ตรวจสภาพภายนอก)
// ตรวจบิดงอ/เสียรูป, รอยขีดข่วน ฯลฯ ตามรอบเวลา + บังคับแนบรูป (เก็บใน Google Drive)
// แยกจาก PART_SPECS / Cp-Cpk ทั้งหมด เพื่อไม่ให้กระทบการคำนวณเดิม
// =====================================================

const APPEARANCE_DEFAULTS = {
    // ค่าเริ่มต้น — ผู้มีรหัสแก้ได้จากเมนู ⚙ ตั้งค่ารอบการตรวจ (js/settings.js)
    INTERVAL_MIN: 60,                                   // แก้ได้จาก Config: APPEARANCE_INTERVAL_MIN
    PART_INTERVAL_MIN: {},                              // ความถี่แยกตามรุ่น (ไม่ใส่ = ใช้ INTERVAL_MIN)
    CHECKLIST: ['บิดงอ / เสียรูป', 'รอยขีดข่วนที่ตัวงาน'], // แก้ได้จาก Config: APPEARANCE_CHECKLIST
    PHOTO_MAX_SIDE: 1920,     // ขนาดปกติ (ด้านยาวสุด px)
    PHOTO_QUALITY: 0.85,
    PHOTO_MAX_AGE_SEC: 120,   // รูปต้องเพิ่งถ่าย (กันเอารูปเก่าในเครื่องมาใช้)
    PHOTO_HASH_KEEP: 300,     // จำลายนิ้วมือรูปที่เคยส่งไว้กี่รูป (กันส่งรูปเดิมซ้ำ)
    SOON_MIN: 10,             // เหลือน้อยกว่านี้ (นาที) = ใกล้ถึงรอบ
    RENDER_TICK_MS: 30 * 1000,
    SERVER_POLL_MS: 3 * 60 * 1000,
    HISTORY_PAGE: 12
};

// ---------- รูปที่ต้องถ่าย (บังคับครบทุกช่องที่ใช้กับรุ่นนั้น เรียงตามลำดับนี้) ----------
// onlyParts = ใช้เฉพาะรุ่นที่ระบุ (ไม่ใส่/ว่าง = ทุกรุ่น) · enabled: false = ปิดช่องนี้ (ตั้งจากเมนูตั้งค่า)
const APPEARANCE_PHOTO_SLOTS = [
    { key: 'Single',   label: 'ชิ้นงานเดี่ยว',          hint: 'ถ่ายชิ้นงานเดี่ยว ๆ ให้เห็นผิวงานว่าไม่มีรอย', example: 'images/appearance-example-single.jpg' },
    { key: 'GoNoGo',   label: 'ใส่ Jig Go/NoGo Gauge', hint: 'ถ่ายตอนชิ้นงานใส่อยู่ใน Jig Go/NoGo Gauge',   example: 'images/appearance-example-gonogo.jpg' },
    { key: 'Flatness', label: 'ใส่ Jig ระนาบ',          hint: 'ถ่ายตอนชิ้นงานใส่อยู่ใน Jig ระนาบ',           example: 'images/appearance-example-flatness.jpg',
      onlyParts: ['51207080HC-JR (25/32A)'] } // Jig ระนาบมีเฉพาะรุ่น 25/32A
];

// ---------- เวลาทำงาน / เวลาพัก ----------
// กะเช้า 08:00–17:00 (เวลาปกติ) + OT 17:30–20:00 · กะดึก 20:00–08:00
// ช่วงพักใช้ชุดเดียวกับตารางสุ่มตัวอย่าง (SAMPLING_SCHEDULE) — ไม่นับเวลาพักเข้ารอบตรวจ
// ช่วง OT และกะดึก นับรอบเฉพาะเครื่องที่ "มีการบันทึกข้อมูล" ในช่วงนั้น (= เครื่องเดินอยู่จริง)
const WORK_SCHEDULE = {
    DAY_START: '08:00',
    REGULAR_END: '17:00',
    OT_START: '17:30',
    DAY_END: '20:00',
    BREAKS: [...SAMPLING_SCHEDULE.day.breaks, ...SAMPLING_SCHEDULE.night.breaks]
};

const WorkTime = {
    _min(hhmm) {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
    },

    // เวลา hh:mm ของวันผลิต dayStart (dayStart = 08:00 ของวันนั้น) — เวลาก่อน 08:00 คือวันถัดไป
    _at(dayStart, hhmm) {
        let offset = this._min(hhmm) - this._min(WORK_SCHEDULE.DAY_START);
        if (offset < 0) offset += 24 * 60;
        return dayStart + offset * 60000;
    },

    prodDayStart(ts) {
        const d = new Date(ts);
        if (d.getHours() < 8) d.setDate(d.getDate() - 1);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0, 0).getTime();
    },

    // ช่วงเวลาของวันผลิต:
    //   window   = ช่วงที่ใช้เช็คว่าเครื่องเดินอยู่ (มีการบันทึกในช่วงนี้)
    //   count    = ช่วงที่นับรอบตรวจ (ใช้คำนวณ "ตรวจครบรอบ")
    //   anchor   = จุดเริ่มนับรอบ ถ้ายังไม่ได้ตรวจในกะนี้
    segments(dayStart) {
        const at = (t) => this._at(dayStart, t);
        return [
            { kind: 'regular', window: [dayStart, at(WORK_SCHEDULE.OT_START)],
              count: [dayStart, at(WORK_SCHEDULE.REGULAR_END)], anchor: dayStart },
            { kind: 'ot', window: [at(WORK_SCHEDULE.REGULAR_END), at(WORK_SCHEDULE.DAY_END)],
              count: [at(WORK_SCHEDULE.OT_START), at(WORK_SCHEDULE.DAY_END)], anchor: dayStart },
            { kind: 'night', window: [at(WORK_SCHEDULE.DAY_END), dayStart + 24 * 3600000],
              count: [at(WORK_SCHEDULE.DAY_END), dayStart + 24 * 3600000], anchor: at(WORK_SCHEDULE.DAY_END) }
        ];
    },

    // ช่วงที่ now อยู่ (ช่วงพักเย็น 17:00–17:30 ยังนับเป็นเวลาปกติ แต่นาฬิกาหยุดเดิน)
    currentSegment(now) {
        const dayStart = this.prodDayStart(now);
        const segs = this.segments(dayStart);
        const at = (t) => this._at(dayStart, t);
        if (now < at(WORK_SCHEDULE.OT_START)) return { ...segs[0], window: [dayStart, at(WORK_SCHEDULE.OT_START)] };
        if (now < at(WORK_SCHEDULE.DAY_END)) return segs[1];
        return segs[2];
    },

    // ช่วงพักที่ครอบคลุมช่วง [a, b]
    _breaks(a, b) {
        const out = [];
        const first = this.prodDayStart(a) - 24 * 3600000;
        for (let day = first; day <= b; day += 24 * 3600000) {
            WORK_SCHEDULE.BREAKS.forEach(([s, e]) => out.push([this._at(day, s), this._at(day, e)]));
        }
        return out;
    },

    // จำนวนนาทีทำงานจริงระหว่าง a → b (หักช่วงพักออก)
    workMinutes(a, b) {
        if (b <= a) return 0;
        let ms = b - a;
        this._breaks(a, b).forEach(([s, e]) => {
            const overlap = Math.min(b, e) - Math.max(a, s);
            if (overlap > 0) ms -= overlap;
        });
        return ms / 60000;
    },

    // เวลาที่ได้หลังทำงานไปอีก minutes นาที นับจาก start (ข้ามช่วงพัก)
    addWorkMinutes(start, minutes) {
        let t = start;
        let remain = minutes * 60000;
        const breaks = this._breaks(start, start + remain + 48 * 3600000).sort((x, y) => x[0] - y[0]);
        for (const [s, e] of breaks) {
            if (e <= t) continue;
            if (s <= t) { t = e; continue; }       // เริ่มต้นอยู่ในช่วงพัก → ข้ามไปหลังพัก
            if (t + remain <= s) break;            // ทำงานครบก่อนถึงพักครั้งถัดไป
            remain -= (s - t);
            t = e;
        }
        return t + remain;
    },

    breakAt(now) {
        return this._breaks(now, now).find(([s, e]) => now >= s && now < e) || null;
    }
};

// ---------- Data service ----------
class AppearanceService {
    constructor(url, useCloud) {
        this.url = url;
        this.useCloud = useCloud;
        this._memRecords = [];      // โหมดทดสอบ (In-Memory)
    }

    async _post(action, data) {
        const res = await fetch(this.url, {
            method: 'POST',
            body: JSON.stringify({ action, data }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'เกิดข้อผิดพลาดจาก server');
        return json.data;
    }

    async uploadPhoto(payload) {
        if (!this.useCloud) {
            return { id: `local-${Date.now()}-${payload.index}`, url: payload.dataUrl, name: 'local.jpg' };
        }
        return this._post('upload_appearance_photo', payload);
    }

    async addRecord(record) {
        if (!this.useCloud) {
            const ts = Date.now();
            const failed = record.checklist.filter(c => c.result === 'FAIL').map(c => c.label);
            this._memRecords.push({
                ...record,
                ts,
                timestamp: new Date(ts).toLocaleString('th-TH', { hour12: false }),
                result: failed.length ? 'FAIL' : 'PASS',
                failedItems: failed.join(', '),
                photoIds: record.photos.map(p => p.id),
                photoLabels: record.photos.map(p => p.label || '')
            });
            return { ts, result: failed.length ? 'FAIL' : 'PASS' };
        }
        return this._post('add_appearance', record);
    }

    async getRecords(range) {
        if (!this.useCloud) {
            const lastByMachine = {};
            this._memRecords.forEach(r => {
                if (!lastByMachine[r.machine] || lastByMachine[r.machine].ts < r.ts) {
                    lastByMachine[r.machine] = { ts: r.ts, result: r.result, operator: r.operator };
                }
            });
            return { records: [...this._memRecords], lastByMachine, lastActivityByMachine: {} };
        }
        const params = new URLSearchParams({ action: 'get_appearance' });
        if (range?.from) params.set('from', range.from);
        if (range?.to) params.set('to', range.to);
        const res = await fetch(`${this.url}?${params.toString()}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'โหลดข้อมูลตรวจสภาพภายนอกไม่สำเร็จ');
        return json.data || { records: [], lastByMachine: {} };
    }
}

// ---------- Module (UI + logic) ----------
class AppearanceModule {
    constructor(controller) {
        this.controller = controller;
        this.service = new AppearanceService(AppConfig.GOOGLE_SHEET_URL, AppConfig.USE_GOOGLE_SHEET);
        this.mode = 'measure';
        this.intervalMin = APPEARANCE_DEFAULTS.INTERVAL_MIN;
        this.checklist = [...APPEARANCE_DEFAULTS.CHECKLIST];
        this.machines = [];
        this.results = [];          // 'PASS' | 'FAIL' | '' ต่อข้อ
        this.photos = APPEARANCE_PHOTO_SLOTS.map(() => null); // ต่อช่อง: { dataUrl, uploaded: { id, url, sig } | null } | null
        this.records = [];
        this.lastByMachine = {};
        this.lastActivityByMachine = {}; // เวลาบันทึกข้อมูลล่าสุดของแต่ละเครื่อง (วัดขนาด + ตรวจสภาพภายนอก) จาก server
        this._localActivityCache = { ref: null, len: -1, map: {} };
        this.rangeKey = null;
        this.range = { from: '', to: '' };
        this.historyLimit = APPEARANCE_DEFAULTS.HISTORY_PAGE;
        this.historyAllMachines = false;
        this.localThumbs = {};      // fileId → dataUrl (แสดงทันทีระหว่างรอ Drive สร้าง thumbnail)
        this.isSubmitting = false;
        this.processingSlot = null;   // ช่องรูปที่กำลังย่อขนาด
        this.chart = null;
        this.baseTitle = document.title;
        this.loadError = '';
    }

    // ===== Lifecycle =====

    init(masterData) {
        const interval = Number(masterData?.appearanceIntervalMin);
        if (interval > 0) this.intervalMin = interval;
        if (Array.isArray(masterData?.appearanceChecklist) && masterData.appearanceChecklist.length) {
            this.checklist = masterData.appearanceChecklist.map(s => String(s).trim()).filter(Boolean);
        }
        this.machines = Object.keys(masterData?.machineAssignments || {}).sort();
        this.results = this.checklist.map(() => '');

        this._renderFormSection();
        this._bindEvents();
        this._renderStatus();
        this._updateFormValidity();

        setInterval(() => this._renderStatus(), APPEARANCE_DEFAULTS.RENDER_TICK_MS);
        setInterval(() => {
            if (document.visibilityState === 'visible') this.reload(true);
        }, APPEARANCE_DEFAULTS.SERVER_POLL_MS);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') this.reload(true);
        });
    }

    // เรียกจาก AppController ทุกครั้งที่ dashboard refresh — โหลดใหม่เฉพาะเมื่อช่วงวันที่เปลี่ยน
    onRangeChange(range) {
        if (range.key === this.rangeKey) return;
        this.range = { from: range.from, to: range.to };
        this.rangeKey = range.key;
        this.historyLimit = APPEARANCE_DEFAULTS.HISTORY_PAGE;
        this.reload(false);
    }

    async reload(silent) {
        const key = this.rangeKey;
        if (!silent) this._setHistoryLoading(true);
        try {
            const data = await this.service.getRecords(this.range);
            if (key !== this.rangeKey) return; // ผู้ใช้เปลี่ยนช่วงวันที่ระหว่างโหลด
            this.records = (data.records || []).sort((a, b) => b.ts - a.ts);
            this.lastByMachine = data.lastByMachine || {};
            this.lastActivityByMachine = data.lastActivityByMachine || {};
            this.loadError = '';
        } catch (err) {
            console.error('Appearance load error:', err);
            this.loadError = 'โหลดข้อมูลตรวจสภาพภายนอกไม่สำเร็จ — ตรวจสอบว่า Deploy backend เวอร์ชันใหม่แล้ว';
        } finally {
            if (!silent) this._setHistoryLoading(false);
            this._renderStatus();
            this._renderHistory();
        }
    }

    // ===== Helpers =====

    _esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    _shortMachine(machine) {
        return String(machine || '').replace(/^Machine_/i, '');
    }

    _formatDuration(minutes) {
        const m = Math.max(0, Math.round(minutes));
        if (m < 60) return `${m} นาที`;
        const h = Math.floor(m / 60);
        const r = m % 60;
        return r ? `${h} ชม. ${r} นาที` : `${h} ชม.`;
    }

    _formatTime(ts) {
        const d = new Date(ts);
        const p = n => String(n).padStart(2, '0');
        return `${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    _formatDateTime(ts) {
        const d = new Date(ts);
        const p = n => String(n).padStart(2, '0');
        return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    _thumbUrl(id, size = 400) {
        if (this.localThumbs[id]) return this.localThumbs[id];
        return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${size}`;
    }

    _driveUrl(id) {
        if (this.localThumbs[id] && String(id).startsWith('local-')) return this.localThumbs[id];
        return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
    }

    _currentMachine() {
        return document.getElementById('machine-id')?.value || '';
    }

    _toast(message, kind = 'success') {
        const el = document.createElement('div');
        const color = kind === 'success' ? 'bg-green-600' : kind === 'error' ? 'bg-red-600' : 'bg-gray-800';
        el.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] ${color} text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-2xl transition-opacity duration-300`;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; }, 2600);
        setTimeout(() => el.remove(), 3000);
    }

    // ===== Status (รอบตรวจ) =====

    // เวลาบันทึกล่าสุดของเครื่องจากข้อมูลวัดขนาดที่โหลดไว้ในหน้าเว็บ (รวมรายการที่ยังรออัปโหลด)
    _localActivity() {
        const data = this.controller?.db?.getLocalData?.() || [];
        const cache = this._localActivityCache;
        if (cache.ref === data && cache.len === data.length) return cache.map;
        const map = {};
        data.forEach(r => {
            const dt = StatUtils.parseThaiDateTime(r.timestamp);
            if (!dt || !r.machine) return;
            const t = dt.getTime();
            if (!map[r.machine] || map[r.machine] < t) map[r.machine] = t;
        });
        this._localActivityCache = { ref: data, len: data.length, map };
        return map;
    }

    _lastActivity(machine) {
        return Math.max(
            Number(this.lastActivityByMachine[machine]) || 0,
            Number(this._localActivity()[machine]) || 0,
            Number(this.lastByMachine[machine]?.ts) || 0
        );
    }

    // ความถี่ตรวจของรุ่น (ตั้งแยกรุ่นได้ ไม่ตั้ง = ค่าเริ่มต้น)
    _intervalFor(part) {
        return APPEARANCE_DEFAULTS.PART_INTERVAL_MIN[part] || this.intervalMin;
    }

    _machineStatus(machine, now = Date.now()) {
        const last = this.lastByMachine[machine] || null;
        const seg = WorkTime.currentSegment(now);
        const brk = WorkTime.breakAt(now);

        // เครื่องเดินอยู่ในช่วงนี้หรือไม่ ดูจากการบันทึกข้อมูล (วัดขนาดหรือตรวจสภาพภายนอก)
        if (this._lastActivity(machine) < seg.window[0]) {
            return { level: 'idle', reason: seg.kind === 'regular' ? 'no-production' : 'off-hours', last, brk };
        }

        // นับจากการตรวจครั้งล่าสุด หรือจากเวลาเริ่มกะ ถ้ายังไม่ได้ตรวจในกะนี้
        const checkedThisShift = last && last.ts >= seg.anchor;
        const from = checkedThisShift ? last.ts : seg.anchor;
        const elapsedMin = WorkTime.workMinutes(from, now);
        const remainMin = this._intervalFor(this.controller.machineAssignments?.[machine]) - elapsedMin;
        const base = { last, checkedThisShift, from, elapsedMin, remainMin, brk };
        if (remainMin < 0) return { level: 'overdue', ...base };
        if (remainMin <= APPEARANCE_DEFAULTS.SOON_MIN) return { level: 'soon', ...base };
        return { level: 'ok', ...base };
    }

    _renderStatus() {
        const now = Date.now();
        const statuses = this.machines.map(m => ({ machine: m, ...this._machineStatus(m, now) }));
        const overdue = statuses.filter(s => s.level === 'overdue');

        // ป้ายบอกจำนวนบนแท็บ + title ของหน้าเว็บ
        const badge = document.getElementById('appearance-tab-badge');
        if (badge) {
            badge.textContent = String(overdue.length);
            badge.classList.toggle('hidden', overdue.length === 0);
        }
        document.title = overdue.length ? `(⚠${overdue.length}) ${this.baseTitle}` : this.baseTitle;

        const intervalEl = document.getElementById('appearance-interval-label');
        if (intervalEl) {
            const part = this.controller.machineAssignments?.[this._currentMachine()];
            intervalEl.textContent = `ทุก ${this._formatDuration(this._intervalFor(part))}`;
        }

        // แบนเนอร์ในฟอร์ม (สำคัญบนมือถือ ที่แผงสถานะอยู่ด้านล่าง)
        const banner = document.getElementById('appearance-due-banner');
        if (banner) {
            if (overdue.length && this.mode === 'measure') {
                const worst = [...overdue].sort((a, b) => a.remainMin - b.remainMin)[0];
                const others = overdue.length > 1 ? ` และอีก ${overdue.length - 1} เครื่อง` : '';
                banner.innerHTML = `
                    <div class="flex items-center gap-3 bg-red-50 border border-red-300 text-red-800 rounded-lg px-3 py-2 animate-pulse">
                        <span class="text-lg">⚠️</span>
                        <div class="flex-1 text-xs leading-snug">
                            <b>ถึงรอบตรวจสภาพภายนอก</b><br>
                            ${this._esc(this._shortMachine(worst.machine))} เลยกำหนด ${this._formatDuration(-worst.remainMin)}${others}
                        </div>
                        <button type="button" data-appearance-goto="${this._esc(worst.machine)}"
                            class="shrink-0 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">ตรวจเลย</button>
                    </div>`;
                banner.classList.remove('hidden');
            } else {
                banner.classList.add('hidden');
                banner.innerHTML = '';
            }
        }

        const grid = document.getElementById('appearance-status-grid');
        if (!grid) return;

        if (this.machines.length === 0) {
            grid.innerHTML = '<p class="col-span-full text-xs text-gray-400 text-center py-4">ยังไม่มีรายชื่อเครื่องจักรจาก Config</p>';
            return;
        }

        const style = {
            ok:      { card: 'border-green-300 bg-green-50',  dot: 'bg-green-500',  text: 'text-green-700' },
            soon:    { card: 'border-yellow-300 bg-yellow-50', dot: 'bg-yellow-400', text: 'text-yellow-700' },
            overdue: { card: 'border-red-400 bg-red-50 ring-2 ring-red-200', dot: 'bg-red-500 animate-ping', text: 'text-red-700' },
            idle:    { card: 'border-gray-200 bg-gray-50',    dot: 'bg-gray-300',   text: 'text-gray-500' }
        };
        const selected = this._currentMachine();

        grid.innerHTML = statuses.map(s => {
            const st = style[s.level];
            let main, sub;
            const lastText = s.last
                ? `ล่าสุด ${(Date.now() - s.last.ts) < 12 * 3600000 ? this._formatTime(s.last.ts) + ' น.' : this._formatDateTime(s.last.ts)}`
                : 'ยังไม่เคยตรวจ';
            if (s.level === 'idle') {
                main = s.reason === 'off-hours' ? 'นอกเวลางาน' : 'ยังไม่มีการผลิต';
                sub = lastText;
            } else {
                main = s.level === 'overdue'
                    ? `เลยกำหนด ${this._formatDuration(-s.remainMin)}`
                    : `อีก ${this._formatDuration(s.remainMin)}`;
                sub = s.checkedThisShift ? lastText : `ยังไม่ได้ตรวจกะนี้ (นับจาก ${this._formatTime(s.from)} น.)`;
            }
            if (s.brk && s.level !== 'idle') sub = `⏸ พัก ถึง ${this._formatTime(s.brk[1])} น. · ` + sub;
            const lastFail = s.last && s.last.result === 'FAIL'
                ? '<span class="ml-1 text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded">ครั้งล่าสุด NG</span>'
                : '';
            const isSel = s.machine === selected ? 'outline outline-2 outline-blue-500' : '';
            return `
                <button type="button" data-appearance-goto="${this._esc(s.machine)}" title="${this._esc(s.machine)}"
                    class="text-left border rounded-lg px-3 py-2 hover:shadow-md transition-shadow ${st.card} ${isSel}">
                    <div class="flex items-center gap-1.5">
                        <span class="relative inline-flex h-2.5 w-2.5"><span class="absolute inline-flex h-full w-full rounded-full ${st.dot}"></span><span class="relative inline-flex rounded-full h-2.5 w-2.5 ${st.dot.replace(' animate-ping', '')}"></span></span>
                        <span class="text-xs font-bold text-gray-700 truncate">${this._esc(this._shortMachine(s.machine))}</span>
                        ${lastFail}
                    </div>
                    <p class="text-sm font-bold mt-1 ${st.text}">${main}</p>
                    <p class="text-[11px] text-gray-500">${sub}</p>
                </button>`;
        }).join('');
    }

    // ===== Form =====

    _renderFormSection() {
        const section = document.getElementById('appearance-input-section');
        if (!section) return;
        section.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <label class="block text-sm font-medium text-gray-600">ผลการตรวจสภาพภายนอก</label>
                <button type="button" id="appearance-all-pass" class="text-xs font-bold text-green-700 hover:text-green-800 border border-green-300 hover:bg-green-50 rounded-full px-3 py-1 transition-colors">✓ ผ่านทุกข้อ</button>
            </div>
            <div id="appearance-checklist" class="space-y-2.5"></div>

            <div class="mt-4">
                <div class="flex items-center justify-between mb-1">
                    <label class="block text-sm font-medium text-gray-600">รูปถ่ายชิ้นงาน <span id="appearance-photo-required" class="text-red-500">* ต้องครบ ${this._activeSlots().length} รูป</span></label>
                    <span id="appearance-photo-count" class="text-xs font-semibold text-gray-500"></span>
                </div>
                <div id="appearance-photo-grid" class="grid grid-cols-3 gap-2"></div>
                <p class="text-[11px] text-gray-400 mt-1">แตะช่องเพื่อถ่ายรูปใหม่ด้วยกล้อง (ใช้รูปเก่าในเครื่องไม่ได้) · ระบบประทับเวลา/เครื่อง/ผู้ตรวจลงบนรูปให้อัตโนมัติ</p>
            </div>

            <div class="mt-4">
                <label for="appearance-remark" class="block text-sm font-medium text-gray-600 mb-1">หมายเหตุ <span id="appearance-remark-required" class="hidden text-red-500">* (จำเป็นเมื่อไม่ผ่าน)</span></label>
                <textarea id="appearance-remark" rows="2" class="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500" placeholder="เช่น พบชิ้นงานบิดงอ 2 ชิ้น แจ้งหัวหน้างานแล้ว"></textarea>
            </div>

            <ul id="appearance-missing" class="mt-3 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 space-y-0.5"></ul>
        `;
        this._renderChecklist();
        this._renderPhotos();
    }

    _renderChecklist() {
        const wrap = document.getElementById('appearance-checklist');
        if (!wrap) return;
        const base = 'flex-1 py-2 px-3 rounded-lg border-2 font-bold text-sm transition-colors';
        wrap.innerHTML = this.checklist.map((label, i) => {
            const r = this.results[i];
            const passCls = r === 'PASS'
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-300 text-gray-500 hover:border-green-500 hover:text-green-600 hover:bg-green-50';
            const failCls = r === 'FAIL'
                ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-gray-300 text-gray-500 hover:border-red-500 hover:text-red-600 hover:bg-red-50';
            return `
                <div data-appearance-row="${i}">
                    <p class="text-xs font-semibold text-gray-700 mb-1">${i + 1}. ${this._esc(label)}</p>
                    <div class="flex items-center gap-2">
                        <button type="button" data-appearance-result="PASS" class="${base} ${passCls}">✓ ผ่าน</button>
                        <button type="button" data-appearance-result="FAIL" class="${base} ${failCls}">✗ ไม่ผ่าน</button>
                    </div>
                </div>`;
        }).join('');
    }

    // index ของช่องรูปที่ต้องถ่ายสำหรับรุ่นที่เลือกอยู่
    _activeSlots() {
        const part = document.getElementById('part-id')?.value || '';
        return APPEARANCE_PHOTO_SLOTS
            .map((slot, i) => (slot.enabled !== false && (!slot.onlyParts?.length || slot.onlyParts.includes(part))) ? i : -1)
            .filter(i => i >= 0);
    }

    // เปลี่ยนรุ่น → ล้างรูปของช่องที่ไม่ใช้กับรุ่นนี้ แล้ววาดใหม่
    _onPartChanged() {
        const active = this._activeSlots();
        this.photos = this.photos.map((p, i) => active.includes(i) ? p : null);
        this._renderFormSectionCount();
        this._renderPhotos();
        this._updateFormValidity();
    }

    _renderFormSectionCount() {
        const el = document.getElementById('appearance-photo-required');
        if (el) el.textContent = `* ต้องครบ ${this._activeSlots().length} รูป`;
    }

    _renderPhotos() {
        const grid = document.getElementById('appearance-photo-grid');
        if (!grid) return;
        const spinner = '<svg class="h-5 w-5 animate-spin mb-1" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>';

        const active = this._activeSlots();
        grid.className = `grid gap-2 ${active.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`;
        grid.innerHTML = active.map((i, n) => {
            const slot = APPEARANCE_PHOTO_SLOTS[i];
            const p = this.photos[i];
            const head = `
                <p class="text-[11px] font-bold leading-tight mb-1 ${p ? 'text-green-700' : 'text-gray-700'}" title="${this._esc(slot.hint)}">
                    ${p ? '✓' : `${n + 1}.`} ${this._esc(slot.label)}
                </p>`;
            let body;
            if (p) {
                body = `
                    <div class="relative aspect-square rounded-lg overflow-hidden border-2 ${p.uploaded ? 'border-green-500' : 'border-blue-400'} bg-gray-100">
                        <img src="${p.dataUrl}" alt="${this._esc(slot.label)}" data-appearance-preview="${i}" class="w-full h-full object-cover cursor-zoom-in">
                        ${p.uploaded ? '<span class="absolute bottom-1 left-1 text-[10px] font-bold bg-green-600 text-white px-1.5 rounded">☁ อัปแล้ว</span>' : ''}
                        <button type="button" data-appearance-remove="${i}" title="ลบแล้วถ่ายใหม่"
                            class="absolute top-1 right-1 h-7 w-7 rounded-full bg-black/60 hover:bg-red-600 text-white text-base leading-none flex items-center justify-center">&times;</button>
                    </div>`;
            } else if (this.processingSlot === i) {
                body = `
                    <div class="aspect-square rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 flex flex-col items-center justify-center text-blue-500 text-[11px]">
                        ${spinner}กำลังเตรียมรูป
                    </div>`;
            } else {
                const example = slot.example
                    ? `<img src="${this._esc(slot.example)}" alt="" class="absolute inset-0 w-full h-full object-contain opacity-40">
                       <span class="absolute top-1 left-1 text-[9px] font-bold bg-gray-700/70 text-white px-1 rounded">ตัวอย่าง</span>`
                    : '';
                body = `
                    <label class="relative cursor-pointer aspect-square rounded-lg overflow-hidden border-2 border-dashed border-red-300 bg-red-50/40 hover:border-blue-500 flex flex-col items-center justify-center text-center transition-colors">
                        ${example}
                        <span class="relative text-2xl leading-none">📷</span>
                        <span class="relative text-[11px] font-bold text-red-600 bg-white/80 rounded px-1 mt-1">แตะเพื่อถ่าย</span>
                        <input type="file" accept="image/*" capture="environment" data-appearance-slot="${i}" class="hidden">
                    </label>`;
            }
            return `<div>${head}${body}</div>`;
        }).join('');

        const countEl = document.getElementById('appearance-photo-count');
        if (countEl) {
            const n = this.photos.filter(Boolean).length;
            countEl.textContent = `${n}/${active.length} รูป`;
            countEl.className = `text-xs font-semibold ${n === active.length ? 'text-green-600' : 'text-red-500'}`;
        }
    }

    _missingItems() {
        const missing = [];
        if (!this._currentMachine()) missing.push('เลือกกระบวนการ/เครื่องจักร');
        if (!document.getElementById('operator')?.value) missing.push('เลือกพนักงาน');
        const unanswered = this.results.map((r, i) => r ? null : i + 1).filter(Boolean);
        if (unanswered.length) missing.push(`เลือกผลตรวจข้อ ${unanswered.join(', ')}`);
        const missingPhotos = this._activeSlots().filter(i => !this.photos[i]).map(i => APPEARANCE_PHOTO_SLOTS[i].label);
        if (missingPhotos.length) missing.push(`ถ่ายรูป: ${missingPhotos.join(', ')}`);
        if (this.results.includes('FAIL') && !document.getElementById('appearance-remark')?.value.trim()) {
            missing.push('กรอกหมายเหตุ (มีข้อที่ไม่ผ่าน)');
        }
        if (this.processingSlot !== null) missing.push('รอเตรียมรูปให้เสร็จ');
        return missing;
    }

    _updateFormValidity() {
        const hasFail = this.results.includes('FAIL');
        document.getElementById('appearance-remark-required')?.classList.toggle('hidden', !hasFail);
        const remark = document.getElementById('appearance-remark');
        if (remark) remark.classList.toggle('border-red-400', hasFail && !remark.value.trim());

        if (this.mode !== 'appearance') return;

        const missing = this._missingItems();
        const list = document.getElementById('appearance-missing');
        if (list) {
            list.innerHTML = missing.map(m => `<li>• ${this._esc(m)}</li>`).join('');
            list.classList.toggle('hidden', missing.length === 0);
        }
        if (!this.isSubmitting) {
            const btn = document.getElementById('submit-btn');
            if (btn) {
                btn.disabled = missing.length > 0;
                btn.classList.toggle('opacity-50', missing.length > 0);
                btn.classList.toggle('cursor-not-allowed', missing.length > 0);
                btn.innerText = hasFail ? 'บันทึกผลตรวจ (พบปัญหา ✗)' : 'บันทึกผลตรวจสภาพภายนอก';
            }
        }
    }

    setMode(mode) {
        this.mode = mode;
        const isAppearance = mode === 'appearance';
        document.querySelectorAll('.measure-only').forEach(el => el.classList.toggle('hidden', isAppearance));
        document.getElementById('appearance-input-section')?.classList.toggle('hidden', !isAppearance);
        if (isAppearance) this._onPartChanged(); // ช่องรูปขึ้นกับรุ่นที่เลือกอยู่ตอนนี้

        document.querySelectorAll('[data-entry-mode]').forEach(tab => {
            const active = tab.dataset.entryMode === mode;
            tab.classList.toggle('bg-white', active);
            tab.classList.toggle('shadow', active);
            tab.classList.toggle('text-blue-700', active);
            tab.classList.toggle('text-gray-500', !active);
        });

        const title = document.getElementById('entry-title');
        if (title) title.textContent = isAppearance ? 'ตรวจสภาพภายนอก (Appearance)' : 'บันทึกข้อมูลการวัด (Data Entry)';

        const btn = document.getElementById('submit-btn');
        if (btn && !isAppearance) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.innerText = 'บันทึกข้อมูล (Save)';
        }
        this._updateFormValidity();
        this._renderStatus();
    }

    gotoMachine(machine) {
        const select = document.getElementById('machine-id');
        if (select && machine && select.value !== machine) {
            select.value = machine;
            select.dispatchEvent(new Event('change'));
        }
        this.setMode('appearance');
        document.getElementById('entry-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    _resetForm() {
        this.results = this.checklist.map(() => '');
        this.photos = APPEARANCE_PHOTO_SLOTS.map(() => null);
        const remark = document.getElementById('appearance-remark');
        if (remark) remark.value = '';
        this._renderChecklist();
        this._renderPhotos();
        this._updateFormValidity();
    }

    // ===== Photos =====

    // ลายนิ้วมือของรูป (hash ของข้อมูลรูปหลังย่อ) ใช้ตรวจว่ารูปซ้ำหรือไม่
    _photoHash(dataUrl) {
        let h1 = 0x811c9dc5, h2 = 0;
        for (let i = 0; i < dataUrl.length; i++) {
            const c = dataUrl.charCodeAt(i);
            h1 = Math.imul(h1 ^ c, 16777619);
            h2 = (h2 * 31 + c) | 0;
        }
        return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16) + dataUrl.length.toString(16);
    }

    _usedHashes() {
        try { return JSON.parse(localStorage.getItem('cpk_appearance_photo_hashes') || '[]'); }
        catch (e) { return []; }
    }

    _rememberHashes(hashes) {
        try {
            const all = [...this._usedHashes(), ...hashes].slice(-APPEARANCE_DEFAULTS.PHOTO_HASH_KEEP);
            localStorage.setItem('cpk_appearance_photo_hashes', JSON.stringify(all));
        } catch (e) { /* ไม่ critical */ }
    }

    async _setSlotFile(slotIndex, file) {
        if (!file || !this._activeSlots().includes(slotIndex)) return;
        if (!(file.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(file.name))) return;

        // ต้องเป็นรูปที่เพิ่งถ่ายจากกล้อง — ไฟล์ที่สร้างไว้นานแล้ว (รูปเก่าในเครื่อง) ใช้ไม่ได้
        const ageSec = file.lastModified ? (Date.now() - file.lastModified) / 1000 : 0;
        if (ageSec > APPEARANCE_DEFAULTS.PHOTO_MAX_AGE_SEC) {
            alert('รูปนี้ไม่ได้เพิ่งถ่าย — ต้องถ่ายรูปใหม่ด้วยกล้องเท่านั้น ห้ามใช้รูปเก่าในเครื่อง');
            return;
        }

        this.processingSlot = slotIndex;
        this._renderPhotos();
        this._updateFormValidity();
        try {
            const dataUrl = await this._compress(file);
            const hash = this._photoHash(dataUrl);
            const dupSlot = this.photos.findIndex((p, i) => p && i !== slotIndex && p.hash === hash);
            if (dupSlot >= 0) {
                alert(`รูปนี้ซ้ำกับรูปช่อง "${APPEARANCE_PHOTO_SLOTS[dupSlot].label}" — ต้องถ่ายแยกแต่ละหัวข้อ`);
            } else if (this._usedHashes().includes(hash)) {
                alert('รูปนี้เคยใช้บันทึกไปแล้ว — ต้องถ่ายรูปใหม่ทุกครั้ง');
            } else {
                this.photos[slotIndex] = { dataUrl, hash, uploaded: null };
            }
        } catch (err) {
            console.error(err);
            alert('เปิดรูปนี้ไม่ได้ ลองถ่ายใหม่อีกครั้ง');
        } finally {
            this.processingSlot = null;
        }
        this._renderPhotos();
        this._updateFormValidity();
    }

    _loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('decode failed'));
            img.src = src;
        });
    }

    async _compress(file) {
        const objectUrl = URL.createObjectURL(file);
        try {
            const img = await this._loadImage(objectUrl);
            const max = APPEARANCE_DEFAULTS.PHOTO_MAX_SIDE;
            let w = img.naturalWidth, h = img.naturalHeight;
            const scale = Math.min(1, max / Math.max(w, h));
            w = Math.round(w * scale);
            h = Math.round(h * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            return canvas.toDataURL('image/jpeg', APPEARANCE_DEFAULTS.PHOTO_QUALITY);
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }

    // ประทับข้อมูลการตรวจลงบนรูป (หลักฐานย้อนหลังแม้ไฟล์ถูกคัดลอกออกไป)
    async _stamp(dataUrl, info) {
        const img = await this._loadImage(dataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const fontSize = Math.max(14, Math.round(canvas.width / 45));
        const pad = Math.round(fontSize * 0.6);
        const lines = [
            `${info.time}  |  ${info.machine}  |  ${info.part}`,
            `ผู้ตรวจ: ${info.operator}  |  ผล: ${info.result === 'PASS' ? 'ผ่าน (OK)' : 'ไม่ผ่าน (NG)'}  |  รูป ${info.index}/${info.total}: ${info.label}`
        ];
        const barH = lines.length * fontSize * 1.35 + pad * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, canvas.height - barH, canvas.width, barH);
        ctx.font = `bold ${fontSize}px Sarabun, sans-serif`;
        ctx.textBaseline = 'top';
        lines.forEach((line, i) => {
            ctx.fillStyle = i === 1 && info.result !== 'PASS' ? '#fca5a5' : '#ffffff';
            ctx.fillText(line, pad, canvas.height - barH + pad + i * fontSize * 1.35, canvas.width - pad * 2);
        });
        return canvas.toDataURL('image/jpeg', APPEARANCE_DEFAULTS.PHOTO_QUALITY);
    }

    // ===== Submit =====

    async submit() {
        if (this.isSubmitting) return;
        const missing = this._missingItems();
        if (missing.length) {
            alert('ยังบันทึกไม่ได้:\n- ' + missing.join('\n- '));
            return;
        }

        const machine = this._currentMachine();
        const part = document.getElementById('part-id')?.value || '';
        const operator = document.getElementById('operator')?.value || '';
        const remark = document.getElementById('appearance-remark')?.value.trim() || '';
        const checklist = this.checklist.map((label, i) => ({ label, result: this.results[i] }));
        const result = checklist.some(c => c.result === 'FAIL') ? 'FAIL' : 'PASS';
        const sig = `${machine}|${part}|${operator}|${result}`;

        const btn = document.getElementById('submit-btn');
        const setBtn = (text) => { if (btn) btn.innerText = text; };
        this.isSubmitting = true;
        if (btn) btn.disabled = true;

        try {
            const active = this._activeSlots();
            const total = active.length;
            const now = new Date();
            const p2 = n => String(n).padStart(2, '0');
            const timeText = `${p2(now.getDate())}/${p2(now.getMonth() + 1)}/${now.getFullYear()} ${p2(now.getHours())}:${p2(now.getMinutes())}`;

            for (let n = 0; n < total; n++) {
                const i = active[n];
                const photo = this.photos[i];
                // อัปโหลดแล้วด้วยข้อมูลชุดเดิม → ข้ามได้ (กรณีกดบันทึกซ้ำหลังเน็ตหลุด)
                if (photo.uploaded && photo.uploaded.sig === sig) continue;
                setBtn(`กำลังอัปโหลดรูป ${n + 1}/${total}...`);
                const slot = APPEARANCE_PHOTO_SLOTS[i];
                const stamped = await this._stamp(photo.dataUrl, {
                    time: timeText, machine, part, operator, result, index: n + 1, total, label: slot.label
                });
                const saved = await this.service.uploadPhoto({
                    dataUrl: stamped, machine, part, operator, result, index: n + 1, slot: slot.key, label: slot.label
                });
                photo.uploaded = { id: saved.id, url: saved.url, sig };
                this.localThumbs[saved.id] = stamped;
                this._renderPhotos();
            }

            setBtn('กำลังบันทึกผลตรวจ...');
            const photos = active.map(i => ({ id: this.photos[i].uploaded.id, url: this.photos[i].uploaded.url, label: APPEARANCE_PHOTO_SLOTS[i].label }));
            const saved = await this.service.addRecord({ machine, part, operator, remark, checklist, photos });

            this._rememberHashes(active.map(i => this.photos[i].hash));
            const ts = Number(saved?.ts) || Date.now();
            this.lastByMachine[machine] = { ts, result, operator };
            this.lastActivityByMachine[machine] = Math.max(Number(this.lastActivityByMachine[machine]) || 0, ts);
            if (AppConfig.USE_GOOGLE_SHEET) {
                this.records.unshift({
                    ts,
                    timestamp: saved?.timestamp || '',
                    machine, part, operator, result, remark, checklist,
                    failedItems: checklist.filter(c => c.result === 'FAIL').map(c => c.label).join(', '),
                    photoIds: photos.map(p => p.id),
                    photoLabels: photos.map(p => p.label)
                });
            } else {
                await this.reload(true);
            }

            this._toast(result === 'PASS' ? '✓ บันทึกผลตรวจสภาพภายนอกแล้ว' : '⚠ บันทึกแล้ว — พบปัญหา แจ้งหัวหน้างานด้วย', result === 'PASS' ? 'success' : 'error');
            this._resetForm();
            this._renderStatus();
            this._renderHistory();
        } catch (err) {
            console.error('Appearance submit error:', err);
            const done = this.photos.filter(p => p && p.uploaded && p.uploaded.sig === sig).length;
            alert(`บันทึกไม่สำเร็จ: ${err.message}\n\nรูปที่อัปโหลดแล้ว ${done}/${this._activeSlots().length} รูปจะไม่ถูกส่งซ้ำ — ตรวจสอบอินเทอร์เน็ตแล้วกดบันทึกอีกครั้ง`);
        } finally {
            this.isSubmitting = false;
            this._updateFormValidity();
        }
    }

    // ===== History / Dashboard =====

    _setHistoryLoading(isLoading) {
        document.getElementById('appearance-history-loading')?.classList.toggle('hidden', !isLoading);
    }

    _historyRecords() {
        const machine = this._currentMachine();
        if (this.historyAllMachines || !machine) return this.records;
        return this.records.filter(r => r.machine === machine);
    }

    // นับรอบที่ควรตรวจ vs รอบที่ตรวจจริง ต่อเครื่อง ต่อช่วงทำงาน (เวลาปกติ / OT / กะดึก)
    // นับเฉพาะช่วงที่เครื่องมีการตรวจ และหักเวลาพักออก — วันหยุด/ไม่มี OT จึงไม่ถูกนับเป็นรอบที่ขาด
    _coverage(records) {
        const now = Date.now();
        const groups = {};
        records.forEach(r => {
            const dayStart = WorkTime.prodDayStart(r.ts);
            const seg = WorkTime.segments(dayStart).find(sg => r.ts >= sg.window[0] && r.ts < sg.window[1]);
            if (!seg) return;
            const key = `${r.machine}|${dayStart}|${seg.kind}`;
            if (!groups[key]) groups[key] = { seg, times: [], intervalMin: this._intervalFor(r.part) };
            groups[key].times.push(r.ts);
        });
        let expected = 0, covered = 0;
        Object.values(groups).forEach(({ seg, times, intervalMin }) => {
            const [start, end] = seg.count;
            const slots = Math.max(1, Math.ceil(WorkTime.workMinutes(start, Math.min(now, end)) / intervalMin));
            const hit = new Set(times.map(t =>
                Math.min(slots - 1, Math.floor(WorkTime.workMinutes(start, Math.max(t, start)) / intervalMin))));
            expected += slots;
            covered += hit.size;
        });
        return { expected, covered };
    }

    _renderHistory() {
        if (!document.getElementById('appearance-panel')) return;

        const machine = this._currentMachine();
        const scopeLabel = document.getElementById('appearance-history-scope');
        if (scopeLabel) {
            scopeLabel.textContent = this.historyAllMachines || !machine ? 'ทุกเครื่อง' : this._shortMachine(machine);
        }
        const toggle = document.getElementById('appearance-history-all');
        if (toggle) toggle.checked = this.historyAllMachines;

        const errEl = document.getElementById('appearance-error');
        if (errEl) {
            errEl.textContent = this.loadError;
            errEl.classList.toggle('hidden', !this.loadError);
        }

        const records = this._historyRecords();
        const pass = records.filter(r => r.result === 'PASS').length;
        const fail = records.length - pass;
        const rate = records.length ? (pass / records.length * 100) : null;
        const cov = this._coverage(records);
        const covPct = cov.expected ? (cov.covered / cov.expected * 100) : null;

        const setText = (id, text, cls) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = text;
            if (cls) el.className = cls;
        };
        setText('appearance-kpi-total', String(records.length));
        setText('appearance-kpi-fail', String(fail), `text-2xl font-bold ${fail ? 'text-red-600' : 'text-gray-800'}`);
        setText('appearance-kpi-rate', rate === null ? '-' : `${rate.toFixed(1)}%`,
            `text-2xl font-bold ${rate === null ? 'text-gray-800' : rate >= 100 ? 'text-green-600' : rate >= 95 ? 'text-yellow-600' : 'text-red-600'}`);
        setText('appearance-kpi-coverage', covPct === null ? '-' : `${cov.covered}/${cov.expected}`,
            `text-2xl font-bold ${covPct === null ? 'text-gray-800' : covPct >= 90 ? 'text-green-600' : covPct >= 70 ? 'text-yellow-600' : 'text-red-600'}`);
        setText('appearance-kpi-coverage-sub', covPct === null ? 'รอบที่ตรวจ/ควรตรวจ' : `ตรงรอบ ${covPct.toFixed(0)}%`);

        this._renderChart(records);

        const list = document.getElementById('appearance-history-list');
        if (!list) return;
        if (records.length === 0) {
            list.innerHTML = '<p class="col-span-full text-center text-sm text-gray-400 py-8">ยังไม่มีผลตรวจสภาพภายนอกในช่วงเวลานี้</p>';
        } else {
            list.innerHTML = records.slice(0, this.historyLimit).map((r, idx) => {
                const isPass = r.result === 'PASS';
                const firstId = r.photoIds?.[0];
                const thumb = firstId
                    ? `<img src="${this._esc(this._thumbUrl(firstId))}" alt="รูปตรวจ" loading="lazy" referrerpolicy="no-referrer"
                           class="w-full h-full object-cover" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'w-full h-full flex items-center justify-center text-[10px] text-gray-400 text-center px-1',textContent:'กำลังสร้างรูปย่อ…'}))">`
                    : '<div class="w-full h-full flex items-center justify-center text-gray-300 text-xs">ไม่มีรูป</div>';
                const more = (r.photoIds?.length || 0) > 1
                    ? `<span class="absolute bottom-1 right-1 text-[10px] font-bold bg-black/60 text-white px-1.5 rounded">+${r.photoIds.length - 1}</span>` : '';
                const when = r.ts ? this._formatDateTime(r.ts) : this._esc(r.timestamp);
                return `
                    <div class="flex gap-3 border rounded-lg p-2 ${isPass ? 'border-gray-200' : 'border-red-300 bg-red-50/50'}">
                        <button type="button" data-appearance-open="${idx}" class="relative shrink-0 w-20 h-20 rounded-md overflow-hidden bg-gray-100 cursor-zoom-in">
                            ${thumb}${more}
                        </button>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${isPass ? 'bg-green-100 text-green-700' : 'bg-red-600 text-white'}">${isPass ? '✓ ผ่าน' : '✗ ไม่ผ่าน'}</span>
                                <span class="text-xs text-gray-500">${when}</span>
                            </div>
                            <p class="text-xs text-gray-700 mt-1 truncate"><b>${this._esc(this._shortMachine(r.machine))}</b> · ${this._esc(r.part)}</p>
                            <p class="text-[11px] text-gray-500 truncate">ผู้ตรวจ: ${this._esc(r.operator)}</p>
                            ${!isPass && r.failedItems ? `<p class="text-[11px] text-red-700 font-semibold truncate">พบ: ${this._esc(r.failedItems)}</p>` : ''}
                            ${r.remark ? `<p class="text-[11px] text-gray-600 italic truncate" title="${this._esc(r.remark)}">“${this._esc(r.remark)}”</p>` : ''}
                        </div>
                    </div>`;
            }).join('');
        }

        const moreBtn = document.getElementById('appearance-history-more');
        if (moreBtn) {
            const remaining = records.length - this.historyLimit;
            moreBtn.classList.toggle('hidden', remaining <= 0);
            moreBtn.textContent = `ดูเพิ่มอีก ${Math.min(remaining, APPEARANCE_DEFAULTS.HISTORY_PAGE)} รายการ (เหลือ ${remaining})`;
        }
    }

    _renderChart(records) {
        const canvas = document.getElementById('appearance-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        // รวมผลรายวันผลิต (เริ่ม 08:00)
        const byDay = {};
        records.forEach(r => {
            const d = new Date(r.ts);
            if (d.getHours() < 8) d.setDate(d.getDate() - 1);
            const key = StatUtils.dateToISO(d);
            if (!byDay[key]) byDay[key] = { pass: 0, fail: 0 };
            byDay[key][r.result === 'PASS' ? 'pass' : 'fail']++;
        });
        const days = Object.keys(byDay).sort();
        const labels = days.map(k => { const [, m, d] = k.split('-'); return `${d}/${m}`; });
        const passData = days.map(k => byDay[k].pass);
        const failData = days.map(k => byDay[k].fail);

        if (this.chart) {
            this.chart.data.labels = labels;
            this.chart.data.datasets[0].data = passData;
            this.chart.data.datasets[1].data = failData;
            this.chart.update();
            return;
        }
        this.chart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'ผ่าน', data: passData, backgroundColor: 'rgba(34,197,94,0.75)', borderRadius: 3, stack: 'r' },
                    { label: 'ไม่ผ่าน', data: failData, backgroundColor: 'rgba(239,68,68,0.85)', borderRadius: 3, stack: 'r' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            footer: (items) => {
                                const i = items[0].dataIndex;
                                const total = passData[i] + failData[i];
                                return total ? `อัตราผ่าน ${(passData[i] / total * 100).toFixed(0)}%` : '';
                            }
                        }
                    }
                },
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'จำนวนครั้งตรวจ' } }
                }
            }
        });
    }

    // ===== Lightbox =====

    _openLightbox(record, startIndex = 0) {
        const ids = record.photoIds || [];
        if (!ids.length) return;
        let index = startIndex;
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-[70] bg-black/90 flex flex-col';
        const render = () => {
            const id = ids[index];
            modal.innerHTML = `
                <div class="flex items-center justify-between text-white px-4 py-3 text-sm">
                    <div class="min-w-0">
                        <p class="font-bold truncate">${this._esc(this._shortMachine(record.machine))} · ${this._esc(record.part)}</p>
                        <p class="text-xs text-gray-300">${record.ts ? this._formatDateTime(record.ts) : this._esc(record.timestamp)} · ${this._esc(record.operator)} · ${record.result === 'PASS' ? '✓ ผ่าน' : '✗ ไม่ผ่าน'}</p>
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                        <a href="${this._esc(this._driveUrl(id))}" target="_blank" rel="noopener" class="text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg">เปิดใน Google Drive ↗</a>
                        <button type="button" data-lb="close" class="text-3xl leading-none hover:text-red-400">&times;</button>
                    </div>
                </div>
                <div class="flex-1 min-h-0 flex items-center justify-center relative px-2">
                    ${ids.length > 1 ? '<button type="button" data-lb="prev" class="absolute left-2 z-10 h-12 w-12 rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl">‹</button>' : ''}
                    <img src="${this._esc(this._thumbUrl(id, 1600))}" referrerpolicy="no-referrer" alt="รูปที่ ${index + 1}" class="max-h-full max-w-full object-contain">
                    ${ids.length > 1 ? '<button type="button" data-lb="next" class="absolute right-2 z-10 h-12 w-12 rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl">›</button>' : ''}
                </div>
                <div class="text-center text-gray-300 text-xs py-3">
                    รูป ${index + 1}/${ids.length}${record.photoLabels?.[index] ? `: <b class="text-white">${this._esc(record.photoLabels[index])}</b>` : ''}
                    ${record.failedItems ? ` · <span class="text-red-300 font-bold">พบ: ${this._esc(record.failedItems)}</span>` : ''}
                    ${record.remark ? ` · “${this._esc(record.remark)}”` : ''}
                </div>`;
        };
        const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
        const step = (d) => { index = (index + d + ids.length) % ids.length; render(); };
        const onKey = (e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowLeft') step(-1);
            if (e.key === 'ArrowRight') step(1);
        };
        modal.addEventListener('click', (e) => {
            const action = e.target.closest('[data-lb]')?.dataset.lb;
            if (action === 'close' || e.target === modal) close();
            else if (action === 'prev') step(-1);
            else if (action === 'next') step(1);
        });
        document.addEventListener('keydown', onKey);
        render();
        document.body.appendChild(modal);
    }

    _openPreview(i) {
        const photo = this.photos[i];
        if (!photo) return;
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out';
        modal.innerHTML = `<img src="${photo.dataUrl}" alt="ตัวอย่างรูป" class="max-h-full max-w-full object-contain">`;
        modal.addEventListener('click', () => modal.remove());
        document.body.appendChild(modal);
    }

    // ===== Events =====

    _bindEvents() {
        document.querySelectorAll('[data-entry-mode]').forEach(tab => {
            tab.addEventListener('click', () => this.setMode(tab.dataset.entryMode));
        });

        document.addEventListener('click', (e) => {
            const goto = e.target.closest('[data-appearance-goto]');
            if (goto) {
                this.gotoMachine(goto.dataset.appearanceGoto);
                return;
            }
            const open = e.target.closest('[data-appearance-open]');
            if (open) {
                const rec = this._historyRecords()[Number(open.dataset.appearanceOpen)];
                if (rec) this._openLightbox(rec);
            }
        });

        const section = document.getElementById('appearance-input-section');
        section?.addEventListener('click', (e) => {
            const resultBtn = e.target.closest('[data-appearance-result]');
            if (resultBtn) {
                const row = resultBtn.closest('[data-appearance-row]');
                this.results[Number(row.dataset.appearanceRow)] = resultBtn.dataset.appearanceResult;
                this._renderChecklist();
                this._updateFormValidity();
                if (resultBtn.dataset.appearanceResult === 'FAIL') document.getElementById('appearance-remark')?.focus();
                return;
            }
            if (e.target.closest('#appearance-all-pass')) {
                this.results = this.checklist.map(() => 'PASS');
                this._renderChecklist();
                this._updateFormValidity();
                return;
            }
            const removeBtn = e.target.closest('[data-appearance-remove]');
            if (removeBtn) {
                this.photos[Number(removeBtn.dataset.appearanceRemove)] = null;
                this._renderPhotos();
                this._updateFormValidity();
                return;
            }
            const preview = e.target.closest('[data-appearance-preview]');
            if (preview) this._openPreview(Number(preview.dataset.appearancePreview));
        });

        section?.addEventListener('change', (e) => {
            const input = e.target;
            if (input.type !== 'file') return;
            const file = input.files?.[0];
            const slot = Number(input.dataset.appearanceSlot);
            input.value = '';
            this._setSlotFile(slot, file);
        });

        section?.addEventListener('input', (e) => {
            if (e.target.id === 'appearance-remark') this._updateFormValidity();
        });

        // ฟิลด์ที่ใช้ร่วมกับฟอร์มวัดขนาด
        document.getElementById('part-id')?.addEventListener('change', () => this._onPartChanged());
        document.getElementById('machine-id')?.addEventListener('change', () => {
            this._onPartChanged();
            this._renderStatus();
            this._renderHistory();
        });
        document.addEventListener('change', (e) => {
            if (e.target.id === 'operator') this._updateFormValidity();
        });

        document.getElementById('appearance-history-all')?.addEventListener('change', (e) => {
            this.historyAllMachines = e.target.checked;
            this.historyLimit = APPEARANCE_DEFAULTS.HISTORY_PAGE;
            this._renderHistory();
        });
        document.getElementById('appearance-history-more')?.addEventListener('click', () => {
            this.historyLimit += APPEARANCE_DEFAULTS.HISTORY_PAGE;
            this._renderHistory();
        });
        document.getElementById('appearance-refresh-btn')?.addEventListener('click', () => this.reload(false));

        // กันปิดหน้าโดยไม่ได้ตั้งใจระหว่างมีรูปที่ยังไม่บันทึก
        window.addEventListener('beforeunload', (e) => {
            if (this.photos.some(Boolean) && !this.isSubmitting) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }
}
