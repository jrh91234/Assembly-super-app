// =====================================================
// INSPECTION SETTINGS (ตั้งค่ารอบการตรวจ)
// ตั้งค่ารอบการตรวจวัด (Data Entry) และตรวจสภาพภายนอก (Appearance) จากหน้าเว็บ
// - แก้ได้เฉพาะผู้มีรหัสเมนูตั้งค่า (ตรวจรหัสซ้ำที่ Apps Script ทุกครั้งที่บันทึก)
// - เก็บเป็น JSON ในแท็บ Config ของ Master Sheet (key: INSPECTION_SETTINGS) + ประวัติในแท็บ Settings Log
// - ยังไม่เคยตั้ง / โหลดไม่ได้ = ใช้ค่าเริ่มต้นใน INSPECTION_RULES และ APPEARANCE_DEFAULTS
// - เวลาทำงาน / เวลาพัก ไม่อยู่ในนี้ (ตายตัวตาม WORK_SCHEDULE)
// =====================================================

const INSPECTION_SETTINGS_RANGES = {
    'dataEntry.defaultIntervalMin': [30, 720],
    'dataEntry.partIntervalMin': [30, 720],
    'dataEntry.firstCheckWithinMin': [10, 240],
    'dataEntry.onTimeTolMin': [0, 120],
    'dataEntry.earlyAcceptMin': [0, 120],
    'dataEntry.sessionGapMin': [5, 120],
    'appearance.intervalMin': [15, 720],
    'appearance.partIntervalMin': [15, 720],
    'appearance.photoMaxAgeSec': [30, 1800],
    'appearance.soonMin': [0, 60]
};

const InspectionSettings = {
    defaults: null,     // ค่าตามโค้ด (จับไว้ตอนโหลดหน้า ก่อนถูกแทนด้วยค่าจาก server)
    appliedJson: '',    // ค่าที่ใช้อยู่ในหน้านี้ (ใช้เทียบว่าบน server เปลี่ยนหรือยัง)
    WATCH_MS: 10 * 60 * 1000,

    // ค่าที่ใช้อยู่ตอนนี้ในรูปแบบเดียวกับที่เก็บใน Sheet
    current() {
        const slots = {};
        APPEARANCE_PHOTO_SLOTS.forEach(s => {
            slots[s.key] = { enabled: s.enabled !== false, onlyParts: [...(s.onlyParts || [])] };
        });
        return {
            dataEntry: {
                defaultIntervalMin: INSPECTION_RULES.DEFAULT_INTERVAL_MIN,
                partIntervalMin: { ...INSPECTION_RULES.PART_INTERVAL_MIN },
                firstCheckWithinMin: INSPECTION_RULES.FIRST_CHECK_WITHIN_MIN,
                onTimeTolMin: INSPECTION_RULES.ON_TIME_TOL_MIN,
                earlyAcceptMin: INSPECTION_RULES.EARLY_ACCEPT_MIN,
                sessionGapMin: INSPECTION_RULES.SESSION_GAP_MIN
            },
            appearance: {
                intervalMin: APPEARANCE_DEFAULTS.INTERVAL_MIN,
                partIntervalMin: { ...APPEARANCE_DEFAULTS.PART_INTERVAL_MIN },
                checklist: [...APPEARANCE_DEFAULTS.CHECKLIST],
                photoSlots: slots,
                photoMaxAgeSec: APPEARANCE_DEFAULTS.PHOTO_MAX_AGE_SEC,
                soonMin: APPEARANCE_DEFAULTS.SOON_MIN
            }
        };
    },

    // ตรวจค่าก่อนส่ง (server ตรวจซ้ำอีกชั้น) — คืนรายการข้อผิดพลาด (ว่าง = ผ่าน)
    validate(s) {
        const errors = [];
        const num = (path, v, label) => {
            const [lo, hi] = INSPECTION_SETTINGS_RANGES[path];
            if (!Number.isInteger(v) || v < lo || v > hi) errors.push(`${label} ต้องเป็นจำนวนเต็ม ${lo}–${hi}`);
        };
        const de = s.dataEntry, ap = s.appearance;
        num('dataEntry.defaultIntervalMin', de.defaultIntervalMin, 'Data Entry: ความถี่ตรวจ (ค่าเริ่มต้น)');
        Object.entries(de.partIntervalMin).forEach(([p, v]) => num('dataEntry.partIntervalMin', v, `Data Entry: ความถี่ของ ${p}`));
        num('dataEntry.firstCheckWithinMin', de.firstCheckWithinMin, 'Data Entry: รอบแรกต้องตรวจภายใน');
        num('dataEntry.onTimeTolMin', de.onTimeTolMin, 'Data Entry: ช่วงตรงเวลา ±');
        num('dataEntry.earlyAcceptMin', de.earlyAcceptMin, 'Data Entry: ตรวจก่อนกำหนดได้ไม่เกิน');
        num('dataEntry.sessionGapMin', de.sessionGapMin, 'Data Entry: บันทึกห่างกันไม่เกิน');
        num('appearance.intervalMin', ap.intervalMin, 'Appearance: ความถี่ตรวจ (ค่าเริ่มต้น)');
        Object.entries(ap.partIntervalMin).forEach(([p, v]) => num('appearance.partIntervalMin', v, `Appearance: ความถี่ของ ${p}`));
        num('appearance.photoMaxAgeSec', ap.photoMaxAgeSec, 'Appearance: อายุรูปสูงสุด');
        num('appearance.soonMin', ap.soonMin, 'Appearance: แจ้งใกล้ถึงรอบ');

        if (!ap.checklist.length) errors.push('Appearance: ต้องมีหัวข้อตรวจอย่างน้อย 1 ข้อ');
        if (ap.checklist.length > 20) errors.push('Appearance: หัวข้อตรวจได้สูงสุด 20 ข้อ');
        if (ap.checklist.some(c => c.length > 100)) errors.push('Appearance: หัวข้อตรวจยาวเกิน 100 ตัวอักษร');
        if (new Set(ap.checklist).size !== ap.checklist.length) errors.push('Appearance: หัวข้อตรวจซ้ำกัน');

        // ทุกรุ่นต้องมีรูปที่ต้องถ่ายอย่างน้อย 1 ช่อง
        Object.keys(PART_SPECS).forEach(part => {
            const any = Object.values(ap.photoSlots).some(sl => sl.enabled && (!sl.onlyParts.length || sl.onlyParts.includes(part)));
            if (!any) errors.push(`Appearance: รุ่น ${part} ไม่มีรูปที่ต้องถ่ายเลย`);
        });
        return errors;
    },

    // ใช้ค่าจาก server กับหน้านี้ — เรียกก่อน AppearanceModule / InspectionScheduleModule init
    apply(settings) {
        if (!this.defaults) this.defaults = this.current();
        if (!settings || !settings.dataEntry || !settings.appearance) {
            this.renderLabels();
            return;
        }
        const d = this.defaults;
        const de = { ...d.dataEntry, ...settings.dataEntry };
        const ap = { ...d.appearance, ...settings.appearance };

        INSPECTION_RULES.DEFAULT_INTERVAL_MIN = Number(de.defaultIntervalMin) || d.dataEntry.defaultIntervalMin;
        INSPECTION_RULES.PART_INTERVAL_MIN = { ...(de.partIntervalMin || {}) };
        INSPECTION_RULES.FIRST_CHECK_WITHIN_MIN = Number(de.firstCheckWithinMin) || d.dataEntry.firstCheckWithinMin;
        INSPECTION_RULES.ON_TIME_TOL_MIN = Number(de.onTimeTolMin) >= 0 ? Number(de.onTimeTolMin) : d.dataEntry.onTimeTolMin;
        INSPECTION_RULES.EARLY_ACCEPT_MIN = Number(de.earlyAcceptMin) >= 0 ? Number(de.earlyAcceptMin) : d.dataEntry.earlyAcceptMin;
        INSPECTION_RULES.SESSION_GAP_MIN = Number(de.sessionGapMin) || d.dataEntry.sessionGapMin;

        APPEARANCE_DEFAULTS.INTERVAL_MIN = Number(ap.intervalMin) || d.appearance.intervalMin;
        APPEARANCE_DEFAULTS.PART_INTERVAL_MIN = { ...(ap.partIntervalMin || {}) };
        if (Array.isArray(ap.checklist) && ap.checklist.length) APPEARANCE_DEFAULTS.CHECKLIST = [...ap.checklist];
        APPEARANCE_DEFAULTS.PHOTO_MAX_AGE_SEC = Number(ap.photoMaxAgeSec) || d.appearance.photoMaxAgeSec;
        APPEARANCE_DEFAULTS.SOON_MIN = Number(ap.soonMin) >= 0 ? Number(ap.soonMin) : d.appearance.soonMin;
        APPEARANCE_PHOTO_SLOTS.forEach(slot => {
            const conf = ap.photoSlots?.[slot.key];
            if (!conf) return;
            slot.enabled = conf.enabled !== false;
            slot.onlyParts = Array.isArray(conf.onlyParts) ? [...conf.onlyParts] : [];
        });

        this.appliedJson = JSON.stringify(settings);
        this.renderLabels();
    },

    _dur(min) {
        if (min < 60) return `${min} นาที`;
        const h = Math.floor(min / 60), r = min % 60;
        return r ? `${h} ชม. ${r} นาที` : `${h} ชม.`;
    },

    _esc(v) {
        return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    },

    // ชื่อสั้นของรุ่น เช่น "S1B29288-JR (10A)" → "10A"
    _shortPart(part) {
        const m = /\(([^)]+)\)/.exec(part);
        return m ? m[1] : part;
    },

    // ข้อความสรุปกติกาบนหัวแผงรอบตรวจ
    renderLabels() {
        const rules = document.getElementById('schedule-rules-label');
        if (rules) {
            const special = Object.entries(INSPECTION_RULES.PART_INTERVAL_MIN)
                .filter(([, v]) => v && v !== INSPECTION_RULES.DEFAULT_INTERVAL_MIN)
                .map(([p, v]) => `รุ่น ${this._esc(this._shortPart(p))} <b class="text-blue-700">ทุก ${this._dur(v)}</b>`);
            const others = special.length ? 'รุ่นอื่น' : 'ทุกรุ่น';
            rules.innerHTML = [...special, `${others} <b class="text-blue-700">ทุก ${this._dur(INSPECTION_RULES.DEFAULT_INTERVAL_MIN)}</b>`,
                'ครบทุก Item = 1 รอบ', `ตรงเวลา ±${INSPECTION_RULES.ON_TIME_TOL_MIN} นาที`, 'ไม่นับเวลาพัก'].join(' · ');
        }
        const checklist = document.getElementById('appearance-checklist-label');
        if (checklist) checklist.textContent = APPEARANCE_DEFAULTS.CHECKLIST.join(' · ');
    },

    // ตรวจเป็นระยะว่ามีคนแก้ค่าตั้งบน server หรือไม่ → แสดงแถบให้กดโหลดหน้าใหม่ (ไม่รีโหลดเอง กันข้อมูลที่กรอกค้างหาย)
    watch(db) {
        if (!AppConfig.USE_GOOGLE_SHEET) return;
        const check = async () => {
            if (document.visibilityState !== 'visible' || document.getElementById('settings-changed-banner')) return;
            try {
                const master = await db.getMasterData();
                const json = master?.inspectionSettings ? JSON.stringify(master.inspectionSettings) : '';
                if (json && json !== this.appliedJson) this._showChangedBanner();
            } catch (err) {
                console.error('ตรวจค่าตั้งรอบการตรวจไม่สำเร็จ:', err);
            }
        };
        setInterval(check, this.WATCH_MS);
    },

    _showChangedBanner() {
        const el = document.createElement('div');
        el.id = 'settings-changed-banner';
        el.className = 'fixed top-0 inset-x-0 z-[70] bg-amber-500 text-white text-sm font-semibold px-4 py-2 flex items-center justify-center gap-3 shadow-lg';
        el.innerHTML = `
            <span>⚙ มีการเปลี่ยนค่าตั้งรอบการตรวจ — บันทึกงานที่ค้างอยู่ก่อน แล้วกดโหลดใหม่</span>
            <button type="button" class="bg-white text-amber-700 px-3 py-1 rounded-lg text-xs font-bold hover:bg-amber-50">โหลดใหม่</button>
        `;
        el.querySelector('button').onclick = () => location.reload();
        document.body.appendChild(el);
    }
};

// ---------- หน้าจอตั้งค่า (แสดงใน settings-modal หลังผ่านรหัสแล้ว) ----------
class InspectionSettingsEditor {
    constructor(controller, password) {
        this.controller = controller;
        this.password = password;
        this.original = InspectionSettings.current();
        this.parts = Object.keys(PART_SPECS);
    }

    _esc(v) { return InspectionSettings._esc(v); }

    _numField(id, label, value, unit, hint) {
        return `
            <label class="block">
                <span class="block text-xs font-medium text-gray-700">${label}</span>
                <div class="flex items-center gap-2 mt-1">
                    <input id="${id}" type="number" inputmode="numeric" step="1" value="${value}" class="w-24 p-1.5 border border-gray-300 rounded-lg text-sm text-right focus:ring-blue-500 focus:border-blue-500">
                    <span class="text-xs text-gray-500">${unit}</span>
                </div>
                ${hint ? `<span class="block text-[11px] text-gray-400 mt-0.5">${hint}</span>` : ''}
            </label>`;
    }

    // ตารางความถี่แยกรุ่น — ช่องว่าง = ใช้ค่าเริ่มต้น
    _partIntervals(prefix, map) {
        return `
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                ${this.parts.map((p, i) => `
                    <label class="block border rounded-lg px-2 py-1.5 bg-gray-50">
                        <span class="block text-[11px] font-semibold text-gray-600 truncate" title="${this._esc(p)}">${this._esc(InspectionSettings._shortPart(p))}</span>
                        <div class="flex items-center gap-1 mt-0.5">
                            <input data-${prefix}-part="${i}" type="number" inputmode="numeric" step="1" value="${map[p] ?? ''}" placeholder="ค่าเริ่มต้น" class="w-full p-1 border border-gray-300 rounded text-sm text-right">
                            <span class="text-[11px] text-gray-500">นาที</span>
                        </div>
                    </label>`).join('')}
            </div>`;
    }

    _checklistRows(items) {
        return items.map((c, i) => `
            <div class="flex items-center gap-1" data-checklist-row="${i}">
                <span class="text-xs text-gray-400 w-5 text-right">${i + 1}.</span>
                <input type="text" maxlength="100" value="${this._esc(c)}" data-checklist-input class="flex-1 p-1.5 border border-gray-300 rounded-lg text-sm">
                <button type="button" data-checklist-move="-1" class="px-2 py-1 text-xs border rounded hover:bg-gray-100 ${i === 0 ? 'invisible' : ''}" title="เลื่อนขึ้น">↑</button>
                <button type="button" data-checklist-move="1" class="px-2 py-1 text-xs border rounded hover:bg-gray-100 ${i === items.length - 1 ? 'invisible' : ''}" title="เลื่อนลง">↓</button>
                <button type="button" data-checklist-remove class="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50" title="ลบ">✕</button>
            </div>`).join('');
    }

    _photoSlots(slots) {
        return APPEARANCE_PHOTO_SLOTS.map(slot => {
            const conf = slots[slot.key] || { enabled: true, onlyParts: [] };
            return `
                <div class="border rounded-lg p-2" data-slot="${slot.key}">
                    <label class="flex items-center gap-2 text-sm font-semibold text-gray-800">
                        <input type="checkbox" data-slot-enabled ${conf.enabled ? 'checked' : ''} class="h-4 w-4">
                        ${this._esc(slot.label)}
                    </label>
                    <p class="text-[11px] text-gray-500 mt-1">ใช้กับรุ่น (ไม่เลือกเลย = ทุกรุ่น)</p>
                    <div class="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                        ${this.parts.map((p, i) => `
                            <label class="flex items-center gap-1 text-xs text-gray-700">
                                <input type="checkbox" data-slot-part="${i}" ${conf.onlyParts.includes(p) ? 'checked' : ''} class="h-3.5 w-3.5">
                                ${this._esc(InspectionSettings._shortPart(p))}
                            </label>`).join('')}
                    </div>
                </div>`;
        }).join('');
    }

    open() {
        const modal = document.getElementById('settings-modal');
        if (!modal) return;
        const s = this.original;
        const de = s.dataEntry, ap = s.appearance;
        const section = 'border rounded-xl p-4 space-y-3';
        const head = 'text-sm font-bold';

        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[90vh] max-h-[90vh] overflow-hidden flex flex-col">
                <div class="bg-blue-50 border-b border-blue-200 px-5 py-3 flex items-center justify-between">
                    <div>
                        <h3 class="text-sm font-bold text-blue-900">⚙ ตั้งค่ารอบการตรวจ</h3>
                        <p class="text-xs text-blue-700">มีผลกับทุกเครื่อง · เวลาทำงานและเวลาพักเป็นค่าตายตัว ไม่อยู่ในหน้านี้</p>
                    </div>
                    <button id="settings-close" class="text-gray-400 hover:text-gray-700 text-xl leading-none" type="button">&times;</button>
                </div>
                <form id="inspection-settings-form" class="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                    <section class="${section}">
                        <h4 class="${head} text-blue-800">📏 รอบการตรวจวัด (Data Entry)</h4>
                        ${this._numField('set-de-interval', 'ความถี่ตรวจ (ค่าเริ่มต้น)', de.defaultIntervalMin, 'นาที', 'นับเฉพาะเวลาทำงาน ไม่นับเวลาพัก')}
                        <div>
                            <p class="text-xs font-medium text-gray-700 mb-1">ความถี่แยกตามรุ่น</p>
                            ${this._partIntervals('de', de.partIntervalMin)}
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            ${this._numField('set-de-first', 'รอบแรกต้องตรวจภายใน', de.firstCheckWithinMin, 'นาที', 'นับจากเครื่องเริ่มทำงานในกะ')}
                            ${this._numField('set-de-tol', 'ช่วงที่นับว่าตรงเวลา ±', de.onTimeTolMin, 'นาที', '')}
                            ${this._numField('set-de-early', 'ตรวจก่อนกำหนดได้ไม่เกิน', de.earlyAcceptMin, 'นาที', 'เช่น เปลี่ยนม้วนก่อนถึงรอบ ยังนับเป็นรอบนั้น')}
                            ${this._numField('set-de-gap', 'บันทึกห่างกันไม่เกิน (นับเป็นรอบเดียวกัน)', de.sessionGapMin, 'นาที', '')}
                        </div>
                    </section>

                    <section class="${section}">
                        <h4 class="${head} text-indigo-800">👁️ ตรวจสภาพภายนอก (Appearance)</h4>
                        ${this._numField('set-ap-interval', 'ความถี่ตรวจ (ค่าเริ่มต้น)', ap.intervalMin, 'นาที', 'นับเฉพาะเวลาทำงาน ไม่นับเวลาพัก')}
                        <div>
                            <p class="text-xs font-medium text-gray-700 mb-1">ความถี่แยกตามรุ่น</p>
                            ${this._partIntervals('ap', ap.partIntervalMin)}
                        </div>
                        <div>
                            <p class="text-xs font-medium text-gray-700 mb-1">หัวข้อตรวจ</p>
                            <div id="set-ap-checklist" class="space-y-1">${this._checklistRows(ap.checklist)}</div>
                            <button type="button" id="set-ap-checklist-add" class="mt-2 px-3 py-1 text-xs border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50">+ เพิ่มหัวข้อ</button>
                        </div>
                        <div>
                            <p class="text-xs font-medium text-gray-700 mb-1">รูปที่ต้องถ่าย</p>
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">${this._photoSlots(ap.photoSlots)}</div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            ${this._numField('set-ap-age', 'อายุรูปสูงสุด (กันใช้รูปเก่า)', ap.photoMaxAgeSec, 'วินาที', '')}
                            ${this._numField('set-ap-soon', 'แจ้ง "ใกล้ถึงรอบ" ก่อน', ap.soonMin, 'นาที', '')}
                        </div>
                    </section>

                    <p id="set-errors" class="hidden text-xs text-red-600 whitespace-pre-line bg-red-50 border border-red-200 rounded-lg p-2"></p>
                </form>
                <div class="px-5 py-3 border-t bg-gray-50 flex flex-wrap items-center gap-2">
                    <input id="set-editor" type="text" maxlength="100" placeholder="ชื่อผู้แก้ไข (บันทึกในประวัติ)" class="flex-1 min-w-[12rem] p-2 border border-gray-300 rounded-lg text-sm">
                    <button type="button" id="set-reset" class="px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-100" title="กรอกค่าเริ่มต้นตามระบบเดิม (ยังไม่บันทึก)">ค่าเริ่มต้น</button>
                    <button type="button" id="set-cancel" class="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-100">ยกเลิก</button>
                    <button type="submit" form="inspection-settings-form" id="set-save" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold">บันทึก</button>
                </div>
            </div>
        `;
        this._bind(modal);
    }

    _bind(modal) {
        const close = () => modal.remove();
        document.getElementById('settings-close').onclick = close;
        document.getElementById('set-cancel').onclick = close;

        const list = document.getElementById('set-ap-checklist');
        const readChecklist = () => [...list.querySelectorAll('[data-checklist-input]')].map(el => el.value);
        const redraw = (items) => { list.innerHTML = this._checklistRows(items); };
        document.getElementById('set-ap-checklist-add').onclick = () => {
            redraw([...readChecklist(), '']);
            const inputs = list.querySelectorAll('[data-checklist-input]');
            inputs[inputs.length - 1]?.focus();
        };
        list.addEventListener('click', (e) => {
            const row = e.target.closest('[data-checklist-row]');
            if (!row) return;
            const i = Number(row.dataset.checklistRow);
            const items = readChecklist();
            if (e.target.closest('[data-checklist-remove]')) {
                items.splice(i, 1);
                redraw(items);
            } else if (e.target.closest('[data-checklist-move]')) {
                const j = i + Number(e.target.closest('[data-checklist-move]').dataset.checklistMove);
                if (j < 0 || j >= items.length) return;
                [items[i], items[j]] = [items[j], items[i]];
                redraw(items);
            }
        });

        document.getElementById('set-reset').onclick = () => {
            if (!confirm('กรอกค่าเริ่มต้นตามระบบเดิมลงในฟอร์ม? (ยังไม่บันทึกจนกว่าจะกดบันทึก)')) return;
            const editor = document.getElementById('set-editor').value;
            const saved = this.original;
            this.original = InspectionSettings.defaults || InspectionSettings.current();
            this.open();
            this.original = saved;
            document.getElementById('set-editor').value = editor;
        };

        document.getElementById('inspection-settings-form').onsubmit = (e) => {
            e.preventDefault();
            this._save();
        };
    }

    _read() {
        const int = (id) => {
            const v = document.getElementById(id).value.trim();
            return v === '' ? NaN : Number(v);
        };
        const partMap = (prefix) => {
            const map = {};
            document.querySelectorAll(`[data-${prefix}-part]`).forEach(el => {
                const v = el.value.trim();
                if (v !== '') map[this.parts[Number(el.getAttribute(`data-${prefix}-part`))]] = Number(v);
            });
            return map;
        };
        const photoSlots = {};
        document.querySelectorAll('[data-slot]').forEach(box => {
            photoSlots[box.dataset.slot] = {
                enabled: box.querySelector('[data-slot-enabled]').checked,
                onlyParts: [...box.querySelectorAll('[data-slot-part]:checked')].map(el => this.parts[Number(el.dataset.slotPart)])
            };
        });
        return {
            dataEntry: {
                defaultIntervalMin: int('set-de-interval'),
                partIntervalMin: partMap('de'),
                firstCheckWithinMin: int('set-de-first'),
                onTimeTolMin: int('set-de-tol'),
                earlyAcceptMin: int('set-de-early'),
                sessionGapMin: int('set-de-gap')
            },
            appearance: {
                intervalMin: int('set-ap-interval'),
                partIntervalMin: partMap('ap'),
                checklist: [...document.querySelectorAll('[data-checklist-input]')].map(el => el.value.trim()).filter(Boolean),
                photoSlots,
                photoMaxAgeSec: int('set-ap-age'),
                soonMin: int('set-ap-soon')
            }
        };
    }

    // สรุปสิ่งที่เปลี่ยน (แสดงให้ยืนยัน + เก็บในประวัติ)
    _diff(before, after) {
        const lines = [];
        const fmt = (v) => Array.isArray(v) ? (v.length ? v.join(', ') : '-') : (v === undefined || v === '' ? 'ค่าเริ่มต้น' : String(v));
        const cmp = (label, a, b) => { if (fmt(a) !== fmt(b)) lines.push(`${label}: ${fmt(a)} → ${fmt(b)}`); };
        const short = (p) => InspectionSettings._shortPart(p);
        const b = before, a = after;

        cmp('Data Entry ความถี่ (นาที)', b.dataEntry.defaultIntervalMin, a.dataEntry.defaultIntervalMin);
        this.parts.forEach(p => cmp(`Data Entry ความถี่ ${short(p)} (นาที)`, b.dataEntry.partIntervalMin[p], a.dataEntry.partIntervalMin[p]));
        cmp('Data Entry รอบแรกภายใน (นาที)', b.dataEntry.firstCheckWithinMin, a.dataEntry.firstCheckWithinMin);
        cmp('Data Entry ตรงเวลา ± (นาที)', b.dataEntry.onTimeTolMin, a.dataEntry.onTimeTolMin);
        cmp('Data Entry ตรวจก่อนได้ (นาที)', b.dataEntry.earlyAcceptMin, a.dataEntry.earlyAcceptMin);
        cmp('Data Entry รวมรอบเดียวกัน (นาที)', b.dataEntry.sessionGapMin, a.dataEntry.sessionGapMin);
        cmp('Appearance ความถี่ (นาที)', b.appearance.intervalMin, a.appearance.intervalMin);
        this.parts.forEach(p => cmp(`Appearance ความถี่ ${short(p)} (นาที)`, b.appearance.partIntervalMin[p], a.appearance.partIntervalMin[p]));
        cmp('Appearance หัวข้อตรวจ', b.appearance.checklist, a.appearance.checklist);
        APPEARANCE_PHOTO_SLOTS.forEach(slot => {
            const sb = b.appearance.photoSlots[slot.key], sa = a.appearance.photoSlots[slot.key];
            cmp(`รูป "${slot.label}"`, sb.enabled ? 'เปิด' : 'ปิด', sa.enabled ? 'เปิด' : 'ปิด');
            cmp(`รูป "${slot.label}" ใช้กับรุ่น`, sb.onlyParts.length ? sb.onlyParts.map(short) : ['ทุกรุ่น'], sa.onlyParts.length ? sa.onlyParts.map(short) : ['ทุกรุ่น']);
        });
        cmp('Appearance อายุรูปสูงสุด (วินาที)', b.appearance.photoMaxAgeSec, a.appearance.photoMaxAgeSec);
        cmp('Appearance แจ้งใกล้ถึงรอบ (นาที)', b.appearance.soonMin, a.appearance.soonMin);
        return lines;
    }

    async _save() {
        const errEl = document.getElementById('set-errors');
        const settings = this._read();
        const editor = document.getElementById('set-editor').value.trim();
        const errors = InspectionSettings.validate(settings);
        if (!editor) errors.push('กรุณาระบุชื่อผู้แก้ไข');
        if (errors.length) {
            errEl.textContent = errors.join('\n');
            errEl.classList.remove('hidden');
            errEl.scrollIntoView({ block: 'nearest' });
            return;
        }
        errEl.classList.add('hidden');

        const changes = this._diff(this.original, settings);
        if (!changes.length) {
            alert('ไม่มีค่าที่เปลี่ยนแปลง');
            return;
        }
        if (!confirm(`ยืนยันเปลี่ยนค่าตั้งรอบการตรวจ (มีผลกับทุกเครื่อง):\n\n${changes.join('\n')}`)) return;

        const btn = document.getElementById('set-save');
        btn.disabled = true;
        btn.textContent = 'กำลังบันทึก...';
        try {
            const saved = await this.controller.db.saveInspectionSettings(this.password, settings, editor, changes.join('\n'));
            if (!AppConfig.USE_GOOGLE_SHEET) {
                alert('โหมดทดสอบ (In-Memory) ไม่เก็บค่าตั้งข้ามการโหลดหน้า');
                document.getElementById('settings-modal')?.remove();
                return;
            }
            alert('บันทึกค่าตั้งแล้ว — หน้านี้จะโหลดใหม่เพื่อใช้ค่าใหม่\nเครื่องอื่นจะมีแถบแจ้งให้โหลดใหม่ภายใน 10 นาที');
            location.reload();
        } catch (err) {
            errEl.textContent = 'บันทึกไม่สำเร็จ: ' + err.message;
            errEl.classList.remove('hidden');
            btn.disabled = false;
            btn.textContent = 'บันทึก';
        }
    }
}
