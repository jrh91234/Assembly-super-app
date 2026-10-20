// =====================================================
// INSPECTION SCHEDULE (รอบการตรวจวัด Data Entry)
// - รุ่น 25/32A ตรวจทุก 2 ชม. รุ่นอื่นทุก 3 ชม. (นับเฉพาะเวลาทำงาน หักช่วงพัก)
// - รอบแรกต้องตรวจภายใน 1 ชม. แรกที่เครื่องเริ่มทำงานในกะ
// - รอบถัดไปนับจากรอบแรกของกะ แล้วบวกทีละช่วง (ตรวจช้าไม่ทำให้รอบถัดไปเลื่อน)
// - ตรวจครบทุก Item ของรุ่นนั้น = 1 รอบ/เครื่อง
// - ตรงเวลา = กำหนด ±15 นาที · ตรวจก่อนกำหนดไม่เกิน 30 นาที (เช่น เปลี่ยนม้วน) นับเป็นรอบนั้น
// คำนวณจากเวลาที่บันทึกข้อมูลการวัด ไม่ต้องเก็บข้อมูลเพิ่มใน Sheet
// ค่าด้านล่างเป็นค่าเริ่มต้น — ผู้มีรหัสแก้ได้จากเมนู ⚙ ตั้งค่ารอบการตรวจ (js/settings.js)
// =====================================================

const INSPECTION_RULES = {
    DEFAULT_INTERVAL_MIN: 180,
    PART_INTERVAL_MIN: { '51207080HC-JR (25/32A)': 120 },
    FIRST_CHECK_WITHIN_MIN: 60,
    ON_TIME_TOL_MIN: 15,
    EARLY_ACCEPT_MIN: 30,     // ตรวจก่อนกำหนดไม่เกินนี้ นับเป็นรอบนั้น
    SESSION_GAP_MIN: 30,      // บันทึกห่างกันไม่เกินนี้ = รอบเดียวกัน
    RENDER_TICK_MS: 30 * 1000,
    SERVER_POLL_MS: 2 * 60 * 1000
};

// ---------- Engine (ไม่แตะ DOM — ทดสอบแยกได้) ----------
const InspectionPlanner = {
    intervalFor(part) {
        return INSPECTION_RULES.PART_INTERVAL_MIN[part] || INSPECTION_RULES.DEFAULT_INTERVAL_MIN;
    },

    intervalLabel(part) {
        const m = this.intervalFor(part);
        const h = Math.floor(m / 60), r = m % 60;
        if (m < 60) return `ทุก ${m} นาที`;
        return r ? `ทุก ${h} ชม. ${r} นาที` : `ทุก ${h} ชม.`;
    },

    // กะที่ ts อยู่: กะเช้า 08:00–20:00 (รวม OT) / กะดึก 20:00–08:00
    shiftOf(ts) {
        const dayStart = WorkTime.prodDayStart(ts);
        const dayEnd = WorkTime._at(dayStart, WORK_SCHEDULE.DAY_END);
        if (ts < dayEnd) return { kind: 'day', start: dayStart, end: dayEnd, dayStart };
        return { kind: 'night', start: dayEnd, end: dayStart + 24 * 3600000, dayStart };
    },

    // รวมบันทึกที่ต่อเนื่องกันเป็น "การตรวจ 1 ครั้ง" — records: [{ ts, parameter, part, setupType }]
    buildSessions(records) {
        const gap = INSPECTION_RULES.SESSION_GAP_MIN * 60000;
        const sorted = [...records].sort((a, b) => a.ts - b.ts);
        const sessions = [];
        let cur = null;
        sorted.forEach(r => {
            if (!cur || r.ts - cur.end > gap) {
                cur = { start: r.ts, end: r.ts, params: new Set(), part: r.part, rollChange: false };
                sessions.push(cur);
            }
            cur.end = r.ts;
            cur.params.add(r.parameter);
            if (r.part) cur.part = r.part;
            if (r.setupType === 'roll_change') cur.rollChange = true;
        });
        sessions.forEach(s => {
            const required = Object.keys((typeof PART_SPECS !== 'undefined' && PART_SPECS[s.part]) || {});
            s.required = required;
            s.missing = required.filter(k => !s.params.has(k));
            s.complete = required.length > 0 && s.missing.length === 0;
        });
        return sessions;
    },

    /**
     * สถานะรอบตรวจของเครื่องในกะปัจจุบัน
     * sessions: การตรวจทั้งหมดของเครื่อง · activity: เวลาที่เครื่องมีการบันทึกใด ๆ (รวมตรวจสภาพภายนอก)
     */
    status({ sessions, activity, part, now }) {
        const sh = this.shiftOf(now);
        const interval = this.intervalFor(part);
        const inShift = sessions.filter(s => s.start >= sh.start && s.start < sh.end && s.start <= now);
        const acts = [...activity, ...inShift.map(s => s.start)].filter(t => t >= sh.start && t <= now);
        const otStart = WorkTime._at(sh.dayStart, WORK_SCHEDULE.OT_START);
        const regEnd = WorkTime._at(sh.dayStart, WORK_SCHEDULE.REGULAR_END);
        const base = { interval, shift: sh, sessions: inShift };
        const inProgress = inShift.find(s => !s.complete && now - s.end <= INSPECTION_RULES.SESSION_GAP_MIN * 60000) || null;

        // ช่วง OT ต้องมีการบันทึกหลัง 17:00 จึงถือว่าทำ OT
        if (sh.kind === 'day' && now >= otStart && !acts.some(t => t >= regEnd)) {
            return { ...base, level: 'idle', reason: 'off-hours', inProgress };
        }
        if (acts.length === 0) {
            return { ...base, level: 'idle', reason: sh.kind === 'day' ? 'no-production' : 'off-hours', inProgress };
        }

        const complete = inShift.filter(s => s.complete);
        const tol = INSPECTION_RULES.ON_TIME_TOL_MIN * 60000;
        const early = INSPECTION_RULES.EARLY_ACCEPT_MIN * 60000;

        // ยังไม่มีรอบแรก → ต้องตรวจภายใน 1 ชม. นับจากเครื่องเริ่มทำงานในกะ
        if (complete.length === 0) {
            const firstAct = Math.min(...acts);
            const due = WorkTime.addWorkMinutes(firstAct, INSPECTION_RULES.FIRST_CHECK_WITHIN_MIN);
            const level = now > due ? 'overdue' : 'due';
            return { ...base, level, round: 1, due, first: true, inProgress, rounds: [], missed: 0 };
        }

        const anchor = complete[0].start;
        const dues = [];
        for (let n = 1; n < 24; n++) {
            const d = WorkTime.addWorkMinutes(anchor, n * interval);
            if (d >= sh.end) break;
            dues.push(d);
        }

        // จับคู่การตรวจกับรอบ: รอบ n รับการตรวจในช่วง [กำหนด−30 นาที, กำหนดรอบถัดไป−30 นาที)
        // รอบแรกต้องเสร็จภายใน 1 ชม. หลังเครื่องเริ่มทำงานในกะ
        const firstDue = WorkTime.addWorkMinutes(Math.min(...acts), INSPECTION_RULES.FIRST_CHECK_WITHIN_MIN);
        const firstLate = anchor > firstDue + tol;
        const rounds = [{ round: 1, due: firstDue, done: complete[0], onTime: !firstLate, late: firstLate, first: true }];
        dues.forEach((due, i) => {
            const winStart = due - early;
            const winEnd = i + 1 < dues.length ? dues[i + 1] - early : sh.end;
            const done = complete.find(s => s.start >= winStart && s.start < winEnd && s !== complete[0]) || null;
            rounds.push({
                round: i + 2, due, winStart, winEnd, done,
                onTime: done ? Math.abs(done.start - due) <= tol || done.start < due : null,
                late: done ? done.start > due + tol : null
            });
        });

        const extras = complete.filter(s => !rounds.some(r => r.done === s)).length;
        const started = rounds.filter(r => r.round === 1 || r.winStart <= now);
        const current = started[started.length - 1];
        const next = rounds.find(r => r.round > current.round) || null;
        const missed = started.filter(r => r !== current && !r.done).length;

        const out = { ...base, rounds, current, next, missed, extras, inProgress, anchor };
        if (current.done) {
            if (!next) return { ...out, level: 'finished' };
            return { ...out, level: 'ok', round: next.round, due: next.due };
        }
        const level = now > current.due + tol ? 'overdue' : now >= current.due - tol ? 'due' : 'soon';
        return { ...out, level, round: current.round, due: current.due };
    },

    // เวลาที่กำหนดตรวจ (HH:MM) ของเครื่องในกะหนึ่ง — ใช้แสดงเส้นในกราฟ drill-down
    plannedTimes({ sessions, part, shiftStart, shiftEnd, until }) {
        const complete = sessions.filter(s => s.complete && s.start >= shiftStart && s.start < shiftEnd);
        if (!complete.length) return [];
        const anchor = complete[0].start;
        const out = [anchor];
        for (let n = 1; n < 24; n++) {
            const d = WorkTime.addWorkMinutes(anchor, n * this.intervalFor(part));
            if (d >= shiftEnd || d > until) break;
            out.push(d);
        }
        return out;
    }
};

// ---------- Module (UI) ----------
class InspectionScheduleModule {
    constructor(controller) {
        this.controller = controller;
        this.machines = [];
        this.machineAssignments = {};
        this.serverRecords = [];   // บันทึกของวันผลิตปัจจุบันจาก server
        this.localSaved = [];      // บันทึกที่เพิ่งบันทึกจากหน้านี้ (รอ server)
        this.fetchError = '';
        InspectionScheduleModule.instance = this;
    }

    init(masterData) {
        this.machineAssignments = masterData?.machineAssignments || {};
        this.machines = Object.keys(this.machineAssignments).sort();
        this._bindEvents();
        this.render();
        this.reload();
        setInterval(() => this.render(), INSPECTION_RULES.RENDER_TICK_MS);
        setInterval(() => { if (document.visibilityState === 'visible') this.reload(); }, INSPECTION_RULES.SERVER_POLL_MS);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') this.reload();
        });
    }

    // ===== Data =====

    _toTs(timestamp) {
        const dt = StatUtils.parseThaiDateTime(timestamp);
        return dt ? dt.getTime() : null;
    }

    async reload() {
        if (!AppConfig.USE_GOOGLE_SHEET) { this.render(); return; }
        try {
            // วันผลิตของเมื่อวานถึงวันนี้ ครอบคลุมทั้งกะเช้าและกะดึกที่กำลังทำงาน
            const now = Date.now();
            const today = StatUtils.dateToISO(new Date(WorkTime.prodDayStart(now)));
            const params = new URLSearchParams({ action: 'get', from: today, to: today });
            const res = await fetch(`${AppConfig.GOOGLE_SHEET_URL}?${params.toString()}`);
            const json = await res.json();
            this.serverRecords = (json.data || [])
                .map(r => ({ ...r, ts: this._toTs(r.timestamp) }))
                .filter(r => r.ts);
            // ตัดรายการที่ server มีแล้วออกจาก localSaved
            this.localSaved = this.localSaved.filter(l => !this.serverRecords.some(s =>
                s.machine === l.machine && s.parameter === l.parameter &&
                String(s.value) === String(l.value) && Math.abs(s.ts - l.ts) < 10 * 60000));
            this.fetchError = '';
        } catch (err) {
            console.error('Schedule load error:', err);
            this.fetchError = 'โหลดข้อมูลรอบตรวจไม่สำเร็จ — จะลองใหม่อัตโนมัติ';
        }
        this.render();
    }

    // เรียกจาก AppController หลังบันทึกค่าการวัด
    onSaved(records) {
        (records || []).forEach(r => {
            const ts = this._toTs(r.timestamp) || Date.now();
            this.localSaved.push({ ...r, ts });
        });
        this.render();
        setTimeout(() => this.reload(), 5000);
    }

    _records() {
        if (!AppConfig.USE_GOOGLE_SHEET) {
            return (this.controller?.db?.getLocalData?.() || [])
                .map(r => ({ ...r, ts: this._toTs(r.timestamp) }))
                .filter(r => r.ts);
        }
        return [...this.serverRecords, ...this.localSaved];
    }

    _appearanceActivity(machine) {
        const ap = this.controller?.appearance;
        if (!ap) return [];
        const times = (ap.records || []).filter(r => r.machine === machine).map(r => r.ts);
        const last = Number(ap.lastByMachine?.[machine]?.ts) || 0;
        if (last) times.push(last);
        return times;
    }

    _partOf(machine) {
        return this.machineAssignments[machine] || '';
    }

    statusFor(machine, now = Date.now()) {
        const records = this._records().filter(r => r.machine === machine);
        const sessions = InspectionPlanner.buildSessions(records);
        return InspectionPlanner.status({
            sessions,
            activity: this._appearanceActivity(machine),
            part: this._partOf(machine),
            now
        });
    }

    // ใช้กับกราฟ drill-down: เวลาที่กำหนดตรวจของเครื่องในกะของวันผลิตนั้น
    plannedSlotsFor(machine, dayISO, isNight) {
        if (!machine) return null;
        const [y, m, d] = dayISO.split('-').map(Number);
        const dayStart = new Date(y, m - 1, d, 8, 0, 0).getTime();
        const dayEnd = WorkTime._at(dayStart, WORK_SCHEDULE.DAY_END);
        const [shiftStart, shiftEnd] = isNight ? [dayEnd, dayStart + 24 * 3600000] : [dayStart, dayEnd];
        const records = [...(this.controller?.allRecords || []), ...this._records()]
            .filter(r => r.machine === machine)
            .map(r => ({ ...r, ts: r.ts || this._toTs(r.timestamp) }))
            .filter(r => r.ts && r.ts >= shiftStart && r.ts < shiftEnd);
        // บันทึกเดียวกันอาจมาจากทั้ง 2 แหล่ง — ตัดซ้ำ
        const seen = new Set();
        const unique = records.filter(r => {
            const k = `${r.parameter}|${r.value}|${Math.round(r.ts / 60000)}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
        const sessions = InspectionPlanner.buildSessions(unique);
        const times = InspectionPlanner.plannedTimes({
            sessions, part: this._partOf(machine), shiftStart, shiftEnd, until: Date.now()
        });
        const p2 = n => String(n).padStart(2, '0');
        return times.map(t => { const dt = new Date(t); return `${p2(dt.getHours())}:${p2(dt.getMinutes())}`; });
    }

    // ===== Helpers =====

    _esc(v) {
        return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }
    _short(m) { return String(m || '').replace(/^Machine_/i, ''); }
    _hm(ts) { const d = new Date(ts); const p = n => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}`; }
    _dur(min) {
        const m = Math.max(0, Math.round(min));
        if (m < 60) return `${m} นาที`;
        const h = Math.floor(m / 60), r = m % 60;
        return r ? `${h} ชม. ${r} นาที` : `${h} ชม.`;
    }
    _itemLabel(key) { return String(key).replace(/^item/i, 'Item '); }

    _describe(st, now) {
        const tolMin = INSPECTION_RULES.ON_TIME_TOL_MIN;
        if (st.level === 'idle') {
            return { main: st.reason === 'off-hours' ? 'นอกเวลางาน' : 'ยังไม่มีการผลิต', sub: '' };
        }
        if (st.level === 'finished') return { main: 'ครบทุกรอบของกะ', sub: '' };
        const roundText = st.first ? 'รอบแรกของกะ' : `รอบที่ ${st.round}`;
        if (st.level === 'overdue') {
            return { main: `เลยกำหนด ${this._dur((now - st.due) / 60000)}`, sub: `${roundText} · กำหนด ${this._hm(st.due)} น.` };
        }
        if (st.level === 'due') {
            return st.first
                ? { main: `ตรวจรอบแรกภายใน ${this._hm(st.due)} น.`, sub: `เหลือ ${this._dur(WorkTime.workMinutes(now, st.due))}` }
                : { main: 'ถึงเวลาตรวจ', sub: `${roundText} · กำหนด ${this._hm(st.due)} น. (±${tolMin} นาที)` };
        }
        if (st.level === 'soon') {
            return { main: `ตรวจได้แล้ว · กำหนด ${this._hm(st.due)} น.`, sub: roundText };
        }
        return { main: `อีก ${this._dur(WorkTime.workMinutes(now, st.due))}`, sub: `${roundText} · กำหนด ${this._hm(st.due)} น.` };
    }

    // ===== Render =====

    render() {
        const now = Date.now();
        const statuses = this.machines.map(m => ({ machine: m, ...this.statusFor(m, now) }));
        const rank = { overdue: 0, due: 1, soon: 2, ok: 3, finished: 4, idle: 5 };
        const sorted = [...statuses].sort((a, b) =>
            (rank[a.level] - rank[b.level]) || ((a.due || Infinity) - (b.due || Infinity)) || a.machine.localeCompare(b.machine));
        const overdue = statuses.filter(s => s.level === 'overdue');
        const dueNow = statuses.filter(s => s.level === 'due');

        // ป้ายบนแท็บ "วัดขนาด"
        const badge = document.getElementById('measure-tab-badge');
        if (badge) {
            badge.textContent = String(overdue.length);
            badge.classList.toggle('hidden', overdue.length === 0);
        }

        this._renderBanner(overdue, dueNow, now);
        this._renderGrid(sorted, now);
        this._renderSummary(statuses);
        this._renderFormInfo(now);
    }

    _renderBanner(overdue, dueNow, now) {
        const banner = document.getElementById('schedule-due-banner');
        if (!banner) return;
        const mode = this.controller?.appearance?.mode || 'measure';
        const list = overdue.length ? overdue : dueNow;
        if (!list.length || mode !== 'measure') {
            banner.classList.add('hidden');
            banner.innerHTML = '';
            return;
        }
        const top = [...list].sort((a, b) => a.due - b.due)[0];
        const isLate = overdue.length > 0;
        const others = list.length > 1 ? ` และอีก ${list.length - 1} เครื่อง` : '';
        const text = isLate
            ? `${this._esc(this._short(top.machine))} เลยกำหนด ${this._dur((now - top.due) / 60000)}${others}`
            : `${this._esc(this._short(top.machine))} ${top.first ? 'ตรวจรอบแรกภายใน' : 'กำหนด'} ${this._hm(top.due)} น.${others}`;
        banner.innerHTML = `
            <div class="flex items-center gap-3 ${isLate ? 'bg-red-50 border-red-300 text-red-800 animate-pulse' : 'bg-amber-50 border-amber-300 text-amber-800'} border rounded-lg px-3 py-2">
                <span class="text-lg">📏</span>
                <div class="flex-1 text-xs leading-snug"><b>${isLate ? 'เลยรอบตรวจวัด' : 'ถึงรอบตรวจวัด'}</b><br>${text}</div>
                <button type="button" data-schedule-goto="${this._esc(top.machine)}"
                    class="shrink-0 ${isLate ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'} text-white text-xs font-bold px-3 py-1.5 rounded-lg">ตรวจเลย</button>
            </div>`;
        banner.classList.remove('hidden');
    }

    _renderGrid(sorted, now) {
        const grid = document.getElementById('schedule-grid');
        if (!grid) return;
        if (!this.machines.length) {
            grid.innerHTML = '<p class="col-span-full text-xs text-gray-400 text-center py-4">ยังไม่มีรายชื่อเครื่องจักรจาก Config</p>';
            return;
        }
        const style = {
            overdue:  { card: 'border-red-400 bg-red-50 ring-2 ring-red-200', dot: 'bg-red-500', text: 'text-red-700' },
            due:      { card: 'border-amber-400 bg-amber-50', dot: 'bg-amber-500', text: 'text-amber-700' },
            soon:     { card: 'border-yellow-300 bg-yellow-50', dot: 'bg-yellow-400', text: 'text-yellow-700' },
            ok:       { card: 'border-green-300 bg-green-50', dot: 'bg-green-500', text: 'text-green-700' },
            finished: { card: 'border-green-200 bg-white', dot: 'bg-green-300', text: 'text-green-600' },
            idle:     { card: 'border-gray-200 bg-gray-50', dot: 'bg-gray-300', text: 'text-gray-500' }
        };
        const selected = document.getElementById('machine-id')?.value;
        grid.innerHTML = sorted.map(s => {
            const st = style[s.level] || style.idle;
            const { main, sub } = this._describe(s, now);
            const part = this._partOf(s.machine);
            const freq = InspectionPlanner.intervalLabel(part);
            const missing = s.inProgress
                ? `<p class="text-[10px] text-blue-700 font-semibold truncate">กำลังตรวจ · ขาด ${s.inProgress.missing.map(k => this._itemLabel(k)).join(', ')}</p>` : '';
            const missed = s.missed ? `<span class="text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded">ขาด ${s.missed} รอบ</span>` : '';
            return `
                <button type="button" data-schedule-goto="${this._esc(s.machine)}" title="${this._esc(s.machine)} · ${this._esc(part)}"
                    class="text-left border rounded-lg px-3 py-2 hover:shadow-md transition-shadow ${st.card} ${s.machine === selected ? 'outline outline-2 outline-blue-500' : ''}">
                    <div class="flex items-center gap-1.5">
                        <span class="inline-block h-2.5 w-2.5 rounded-full ${st.dot} ${s.level === 'overdue' ? 'animate-pulse' : ''}"></span>
                        <span class="text-xs font-bold text-gray-700 truncate">${this._esc(this._short(s.machine))}</span>
                        <span class="text-[10px] text-gray-400">${freq}</span>
                        ${missed}
                    </div>
                    <p class="text-sm font-bold mt-1 ${st.text}">${main}</p>
                    ${sub ? `<p class="text-[11px] text-gray-500">${sub}</p>` : ''}
                    ${missing}
                </button>`;
        }).join('');
    }

    _renderSummary(statuses) {
        const el = document.getElementById('schedule-summary');
        if (!el) return;
        let onTime = 0, late = 0, missed = 0, extras = 0;
        statuses.forEach(s => {
            (s.rounds || []).forEach(r => {
                if (!r.done) return;
                if (r.late) late++; else onTime++;
            });
            missed += s.missed || 0;
            extras += s.extras || 0;
        });
        const total = onTime + late + missed;
        const pct = total ? Math.round(onTime / total * 100) : null;
        el.innerHTML = `
            <span>กะนี้: <b class="text-green-700">ตรงเวลา ${onTime}</b></span>
            <span><b class="text-amber-700">ช้า ${late}</b></span>
            <span><b class="${missed ? 'text-red-700' : 'text-gray-500'}">ขาด ${missed}</b></span>
            ${extras ? `<span class="text-gray-500">ตรวจเพิ่ม (เปลี่ยนม้วน) ${extras}</span>` : ''}
            ${pct !== null ? `<span class="ml-auto font-bold ${pct >= 90 ? 'text-green-700' : pct >= 70 ? 'text-amber-700' : 'text-red-700'}">ตรงเวลา ${pct}%</span>` : ''}
            ${this.fetchError ? `<span class="w-full text-red-600">${this._esc(this.fetchError)}</span>` : ''}`;
    }

    // ข้อมูลรอบใต้ช่องเลือกเครื่อง + ปุ่มลัด Item ที่ยังไม่ได้ตรวจในรอบนี้
    _renderFormInfo(now) {
        const box = document.getElementById('schedule-form-info');
        if (!box) return;
        const machine = document.getElementById('machine-id')?.value;
        if (!machine) { box.innerHTML = ''; box.classList.add('hidden'); return; }
        const s = this.statusFor(machine, now);
        const { main, sub } = this._describe(s, now);
        const color = { overdue: 'border-red-300 bg-red-50 text-red-800', due: 'border-amber-300 bg-amber-50 text-amber-800',
            soon: 'border-yellow-300 bg-yellow-50 text-yellow-800', ok: 'border-green-300 bg-green-50 text-green-800',
            finished: 'border-green-200 bg-green-50 text-green-800', idle: 'border-gray-200 bg-gray-50 text-gray-600' }[s.level];

        // Item ของรอบที่กำลังตรวจอยู่ (หรือรอบล่าสุดที่เพิ่งตรวจเสร็จไม่เกิน 30 นาที)
        const part = document.getElementById('part-id')?.value || this._partOf(machine);
        const required = Object.keys(PART_SPECS[part] || {});
        const recent = [...(s.sessions || [])].reverse().find(x => now - x.end <= INSPECTION_RULES.SESSION_GAP_MIN * 60000);
        const done = recent ? recent.params : new Set();
        const currentParam = document.getElementById('parameter-id')?.value;
        const chips = required.map(k => {
            const ok = done.has(k);
            const active = k === currentParam;
            return `<button type="button" data-schedule-item="${this._esc(k)}"
                class="text-[11px] font-bold px-2 py-1 rounded-full border ${ok ? 'border-green-400 bg-green-100 text-green-700' : 'border-gray-300 bg-white text-gray-600 hover:border-blue-400'} ${active ? 'ring-2 ring-blue-400' : ''}">
                ${ok ? '✓' : '○'} ${this._itemLabel(k)}</button>`;
        }).join('');
        const doneCount = required.filter(k => done.has(k)).length;

        box.innerHTML = `
            <div class="border rounded-lg px-3 py-2 ${color}">
                <div class="flex items-center justify-between gap-2">
                    <p class="text-xs font-bold">📏 ${main}</p>
                    <span class="text-[10px] opacity-75">${InspectionPlanner.intervalLabel(part)}</span>
                </div>
                ${sub ? `<p class="text-[11px] opacity-80">${sub}</p>` : ''}
                <div class="mt-2">
                    <p class="text-[11px] text-gray-600 mb-1">รอบนี้บันทึกแล้ว ${doneCount}/${required.length} Item (ต้องครบทุก Item = 1 รอบ)</p>
                    <div class="flex flex-wrap gap-1">${chips}</div>
                </div>
            </div>`;
        box.classList.remove('hidden');
    }

    // ===== Events =====

    _bindEvents() {
        document.addEventListener('click', (e) => {
            const goto = e.target.closest('[data-schedule-goto]');
            if (goto) {
                const select = document.getElementById('machine-id');
                if (select && select.value !== goto.dataset.scheduleGoto) {
                    select.value = goto.dataset.scheduleGoto;
                    select.dispatchEvent(new Event('change'));
                }
                this.controller?.appearance?.setMode('measure');
                document.getElementById('entry-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                this.render();
                return;
            }
            const item = e.target.closest('[data-schedule-item]');
            if (item) {
                const param = document.getElementById('parameter-id');
                if (param) {
                    param.value = item.dataset.scheduleItem;
                    param.dispatchEvent(new Event('change'));
                }
                this._renderFormInfo(Date.now());
            }
        });
        ['machine-id', 'part-id', 'parameter-id'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => this._renderFormInfo(Date.now()));
        });
        document.querySelectorAll('[data-entry-mode]').forEach(tab => tab.addEventListener('click', () => this.render()));
    }
}
