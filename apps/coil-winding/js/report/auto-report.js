window.openAutoReport = async function() {
    if (!currentDashboardData) {
        alert("⚠️ กรุณากดปุ่ม 🔍ค้นหา เพื่อดึงข้อมูลสำหรับสร้างรายงานก่อนครับ");
        return;
    }
    const modal = document.getElementById('modal-auto-report');
    const content = document.getElementById('auto-report-content');
    
    // แสดงหน้าจอ Loading รอการแปลภาษาจาก Google API
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    content.innerHTML = `
        <div class="flex flex-col items-center justify-center h-[50vh] text-gray-600 bg-white shadow-xl rounded-xl mt-10 border border-gray-200">
            <div class="text-5xl mb-4 animate-bounce">🤖</div>
            <div class="text-xl font-bold text-blue-700 mb-2">ระบบกำลังเตรียมข้อมูลรายงาน...</div>
        </div>
    `;
    setTimeout(() => { modal.classList.remove('opacity-0'); }, 10);

    // ประมวลผลเนื้อหา (แบบ Asynchronous)
    await window.renderAutoReportContent();
};

window.renderAutoReportContent = async function() {
    const data = currentDashboardData;
    const content = document.getElementById('auto-report-content');
    const sDate = document.getElementById('startDate').value;
    const eDate = document.getElementById('endDate').value;
    const filterShiftVal = document.getElementById('filterShift').value.trim();
    const filterShiftTypeVal = document.getElementById('filterShiftType').value.trim();

    // 🌟 ฟังก์ชันจัดการสีของเส้นกราฟแต่ละอาการ (Fixed Colors) 🌟
    const getSymptomColor = (symptomName) => {
        // ทำการ trim และ lowercase เพื่อให้เทียบง่ายขึ้น
        const sName = symptomName.trim().toLowerCase();
        
        // กำหนดสีให้แตกต่างกันมากที่สุด (High Contrast)
        const fixedColors = {
            "setup": "#FF0000", // สีแดงสด (Red)
            "ปอกฉนวนไม่หมด (insulator skin incomplete)": "#FFC107", // สีเหลืองอำพัน (Amber)
            "ระยะปอกลวดไม่ได้ตามสเปค ( insulation skinning length error )": "#808080", // สีเทา (Gray)
            "งานเสียตีกลับจากลูกค้า (rtv sorting ng )": "#FF00FF", // สีชมพูบานเย็น (Magenta)
            "ระยะปอกขายาวไม่ได้สเปคสั้นกว่า7.10": "#00FFFF", // สีฟ้าสว่าง (Cyan)
            "ลวดถลอก (scratched)": "#FFA500", // สีส้ม (Orange)
            "งานผิดดรูป (deform)": "#8A2BE2", // สีม่วงน้ำเงิน (Blue Violet)
            "ขาสั้นไม่ได้มาตรฐานต่ำกว่า5.5": "#A52A2A", // สีน้ำตาล (Brown)
            "เส้นสีแดง (oxidize)": "#2E8B57", // สีเขียวทะเล (Sea Green)
            "ขดลวดพันฟู ( fluted coil )": "#FF1493", // สีชมพูเข้ม (Deep Pink)
            "งานไม่ปลอก (not skin)": "#D2691E", // สีช็อกโกแลต (Chocolate)
            "ขาสั้นไม่ได้มาตรฐานมากกว่า6.3": "#4B0082", // สีน้ำเงินเข้ม (Indigo)
            "ปอกเป็นขุย skin insulation fraying": "#DC143C", // สีแดงอมชมพู (Crimson)
            "ขาดีดรูป (leg deform)": "#008080", // สีเขียวอมน้ำเงิน (Teal)
            "ความยาวรวมมีเกินค่า length out max": "#B8860B", // สีเหลืองทอง (Dark Goldenrod)
            "งานครีบสูงเกิน 0.1 mm (burr)": "#4682B4", // สีฟ้าอมเทา (Steel Blue)
        };
        
        // ค้นหาสีตาม key ถ้าเจอตรงๆ
        if (fixedColors[sName]) {
            return fixedColors[sName];
        } 
        
        // ค้นหาแบบรวมๆ (เผื่อพิมพ์ผิดเว้นวรรค)
        for (const key in fixedColors) {
            if (sName.includes(key.split(' ')[0])) { // ตรวจสอบจากคำแรก
                return fixedColors[key];
            }
        }

        // ถ้าไม่มีในรายการที่ตั้งไว้ ให้สุ่มสีจากชุดสีสำรองตาม Hash
        let hash = 0;
        for (let i = 0; i < symptomName.length; i++) {
            hash = symptomName.charCodeAt(i) + ((hash << 5) - hash);
        }
        const fallbackColors = ['#FF4500', '#32CD32', '#DAA520', '#4169E1', '#9932CC', '#D2691E'];
        return fallbackColors[Math.abs(hash) % fallbackColors.length];
    };

    // 🌟 ค้นหาประวัติแจ้งซ่อมที่ค้างอยู่ (Pending Jobs) ย้อนหลัง 60 วัน สำหรับเครื่องที่ไม่ได้รัน 🌟
    let pendingJobsMap = {};
    try {
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center h-[50vh] text-gray-600 bg-white shadow-xl rounded-xl mt-10 border border-gray-200">
                <div class="text-5xl mb-4 animate-spin">🔍</div>
                <div class="text-xl font-bold text-blue-700 mb-2">กำลังตรวจสอบประวัติเครื่องจักรย้อนหลัง...</div>
                <div class="text-sm font-medium">เพื่อค้นหางานซ่อมที่ยังค้างอยู่ (Pending Jobs)</div>
            </div>
        `;

        let endObj = new Date(sDate);
        let startObj = new Date(endObj);
        startObj.setDate(startObj.getDate() - 60); // ย้อนหลัง 60 วัน
        let sStr = startObj.toISOString().split('T')[0];
        
        const res = await fetch(`${SCRIPT_URL}?action=GET_DASHBOARD&start=${sStr}&end=${sDate}&shift=All&shiftType=All`);
        const pastData = await res.json();
        
        if (pastData.maintenanceLogs) {
            pastData.maintenanceLogs.forEach(log => {
                // ถ้าไม่มี endTime หรือระบุว่ายังไม่เสร็จ ถือว่าเป็น Pending
                if (!log.endTime || log.endTime.trim() === '' || log.endTime === '-') {
                    // เก็บรวบรวมจ๊อบค้างทั้งหมดของเครื่องนั้นๆ ใส่ Array
                    if (!pendingJobsMap[log.machine]) {
                        pendingJobsMap[log.machine] = [];
                    }
                    pendingJobsMap[log.machine].push(log);
                }
            });
        }
    } catch(e) {
        console.warn("Failed to fetch past pending jobs", e);
    }

    // 🌟 ดึงข้อมูลงาน Sorting จาก Production_Data (filter ตามวันที่ QC อนุมัติ) → สรุปแยกตามรุ่น 🌟
    let sortingSummaryByModel = {};  // { modelName: { fg, ng, jobs } }
    let sortingTotalFG = 0, sortingTotalNG = 0, sortingJobCount = 0;
    try {
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center h-[50vh] text-gray-600 bg-white shadow-xl rounded-xl mt-10 border border-gray-200">
                <div class="text-5xl mb-4 animate-spin">🗂️</div>
                <div class="text-xl font-bold text-blue-700 mb-2">กำลังดึงข้อมูลงานคัดแยก (Sorting)...</div>
                <div class="text-sm font-medium">อ่านจาก Production_Data (ตามวันที่ QC อนุมัติ)</div>
            </div>
        `;
        const sortRes = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'GET_SORTING_PROD_SUMMARY', start: sDate, end: eDate, shift: filterShiftVal, shiftType: filterShiftTypeVal })
        });
        const sortJson = await sortRes.json();
        sortingSummaryByModel = (sortJson && sortJson.summary) || {};
        const totals = (sortJson && sortJson.totals) || { fg: 0, ng: 0, jobs: 0 };
        sortingTotalFG = totals.fg || 0;
        sortingTotalNG = totals.ng || 0;
        sortingJobCount = totals.jobs || 0;
    } catch(e) {
        console.warn("Failed to fetch sorting summary", e);
    }

    // อัปเดตสถานะเป็นกำลังแปลภาษา
    content.innerHTML = `
        <div class="flex flex-col items-center justify-center h-[50vh] text-gray-600 bg-white shadow-xl rounded-xl mt-10 border border-gray-200">
            <div class="text-5xl mb-4 animate-bounce">🤖</div>
            <div class="text-xl font-bold text-blue-700 mb-2">AI กำลังวิเคราะห์และแปลภาษารายงาน...</div>
            <div class="text-sm font-medium">กำลังเชื่อมต่อ Google Translate API (อาจใช้เวลา 2-5 วินาที)</div>
        </div>
    `;

    // 🌟 ระบบแปลภาษาด้วย Free Google Translate API (ปรับแก้เพื่อลดปัญหามือถือค้าง) 🌟
    const translateText = async (text, targetLang) => {
        if (!text || text.trim() === '-' || text.trim() === '') return '-';
        try {
            // เพิ่ม Timeout 5 วินาที ป้องกันการค้างถาวร
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); 

            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=th&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
            const response = await fetch(url, { signal: controller.signal });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error("API Limit Reached");
            
            const result = await response.json();
            return result[0].map(item => item[0]).join(''); // รวมประโยคทั้งหมดที่แปล
        } catch (error) {
            console.warn("Translation Error for:", text, error);
            // หากดึงไม่สำเร็จ หรือถูก Block จะไม่แสดงวงเล็บ Error ให้รกรายงาน
            return text; 
        }
    };

    // รวบรวม Remark ทั้งหมด (ทั้งจากวันนี้ และที่ค้างจากอดีต) มาแปล
    const translatedRemarks = {};
    let allRemarksToTranslate = [];
    
    if (data.maintenanceLogs && data.maintenanceLogs.length > 0) {
        allRemarksToTranslate.push(...data.maintenanceLogs.map(log => log.remark));
    }
    if (Object.keys(pendingJobsMap).length > 0) {
        Object.values(pendingJobsMap).forEach(machineLogs => {
            allRemarksToTranslate.push(...machineLogs.map(log => log.remark));
        });
    }

    const uniqueRemarks = [...new Set(allRemarksToTranslate.filter(r => r && r.trim() !== '-' && r.trim() !== ''))];
    
    // ทำการแปลทีละข้อความ (Sequential) เพื่อป้องกันไม่ให้มือถือยิง Request ถี่เกินไปจนค้าง หรือโดนแบน
    for (const text of uniqueRemarks) {
        const [enText, chText] = await Promise.all([
            translateText(text, 'en'),
            translateText(text, 'zh-CN')
        ]);
        translatedRemarks[text] = { th: text, en: enText, ch: chText };
        // หน่วงเวลาเล็กน้อยระหว่างแต่ละคำขอ
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    const getTranslatedRemark = (text) => {
        if (!text || text.trim() === '-' || text.trim() === '') return { th: '-', en: '-', ch: '-' };
        return translatedRemarks[text] || { th: text, en: text, ch: text };
    };

    // uses shared getKgFromPcs from helpers.js (strict, no fallback)
    
    const formatTimeStr = (val) => {
        if (!val) return '';
        let str = String(val).trim();
        if (str.includes('T')) {
            try {
                let d = new Date(str);
                if(!isNaN(d.getTime())) return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
            } catch(e){}
        }
        let m = str.match(/(\d{1,2}:\d{2})/);
        return m ? m[1].padStart(5, '0') : str.substring(0, 5);
    };

    // ฟังก์ชันเสริมสำหรับฟอร์แมตวันที่แบบสั้นเพื่อแสดงคู่กับเวลาปิดจ๊อบ
    const formatDateShort = (dateStr) => {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                const day = d.getDate().toString().padStart(2, '0');
                const month = (d.getMonth() + 1).toString().padStart(2, '0');
                const year = d.getFullYear();
                return `${day}/${month}/${year}`;
            }
        } catch(e) {}
        return dateStr;
    };

    const multiLang = (th, en, ch) => `
        <div class="space-y-1.5 mb-4 border-l-2 border-gray-200 pl-3">
            <p class="text-[12px] text-gray-800 leading-relaxed text-justify"><span class="font-bold text-blue-600 mr-1">[TH]</span>${th}</p>
            <p class="text-[11px] text-gray-600 leading-relaxed text-justify"><span class="font-bold text-red-600 mr-1">[EN]</span>${en}</p>
            <p class="text-[11px] text-gray-500 leading-relaxed text-justify"><span class="font-bold text-gray-700 mr-1">[CH]</span>${ch}</p>
        </div>
    `;

    // หัวรายงานต้องบอกช่วงข้อมูล "ที่โหลดมาจริง" ไม่ใช่ค่าที่อยู่ในช่องกรองตอนกดเปิดรายงาน
    // (เปิดรายงานไม่ได้ดึงข้อมูลใหม่ ถ้าผู้ใช้เปลี่ยนวันแล้วยังไม่กดค้นหา ตัวเลขจะยังเป็นของช่วงเดิม)
    const queryMeta = (typeof window.getLoadedQueryMeta === 'function') ? window.getLoadedQueryMeta() : null;
    const metaStart = queryMeta ? queryMeta.start : sDate;
    const metaEnd = queryMeta ? queryMeta.end : eDate;
    const isSingleDay = (metaStart === metaEnd);
    const dateStr = (queryMeta && typeof window.getLoadedRangeLabel === 'function')
        ? window.getLoadedRangeLabel()
        : (isSingleDay ? metaStart : `${metaStart} ถึง ${metaEnd}`);
    const rangeDays = (queryMeta && queryMeta.dayCount > 0) ? queryMeta.dayCount : 1;
    const isMultiDayRange = !isSingleDay;
    const shiftName = queryMeta
        ? (queryMeta.shiftLabel || queryMeta.shift)
        : document.getElementById('filterShift').options[document.getElementById('filterShift').selectedIndex].text;
    const shiftType = queryMeta
        ? (queryMeta.shiftTypeLabel || queryMeta.shiftType)
        : document.getElementById('filterShiftType').options[document.getElementById('filterShiftType').selectedIndex].text;
    const isStaleFilter = (typeof window.isFilterStale === 'function') && window.isFilterStale();
    const printTime = new Date().toLocaleString('th-TH');

    const totalFG = data.totalFg || 0;
    const totalFGKg = data.totalFgKg || 0;
    const totalNG = data.totalNgPcs !== undefined ? data.totalNgPcs : (data.totalNg || 0);
    const totalQty = totalFG + totalNG;
    const yieldPct = totalQty > 0 ? ((totalFG/totalQty)*100).toFixed(2) : "0.00";
    const avgNgRate = (totalQty > 0 ? (totalNG/totalQty)*100 : 0).toFixed(2);
    const isPassTarget = parseFloat(avgNgRate) <= 0.5;

    // 🌟 ส่วนที่ 1: ตาราง Breakdown ตามรุ่น (New KPI) 🌟
    // ยอดในตารางนี้เป็น "ยอดรวมทั้งช่วงที่โหลด" — ถ้าช่วงมีหลายวันจะไม่เท่ากับแท่งวันเดียวในกราฟ Daily Output
    // จึงเพิ่มคอลัมน์เฉลี่ย/วัน และหมายเหตุยอดที่โพสต์กลับจากงานคัดแยก (SORT-*) ไว้ให้กระทบยอดกันได้
    const sortPostedByModel = {};
    (data.dailyTrend || []).forEach(d => {
        Object.keys(d.byModel || {}).forEach(m => {
            const v = d.byModel[m] || {};
            if (!sortPostedByModel[m]) sortPostedByModel[m] = { fg: 0, ng: 0 };
            sortPostedByModel[m].fg += v.sortPostedFg || 0;
            sortPostedByModel[m].ng += v.sortPostedNg || 0;
        });
    });
    const totalSortPostedFg = Object.values(sortPostedByModel).reduce((a, v) => a + v.fg, 0);
    const totalSortPostedNg = Object.values(sortPostedByModel).reduce((a, v) => a + v.ng, 0);

    let productBreakdownHtml = `<div class="mt-6 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden page-break-inside-avoid">`;
    if (isMultiDayRange) {
        productBreakdownHtml += `<div class="px-4 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-800 font-bold">
            📅 ยอดในตารางนี้คือ <u>ยอดรวมทั้งช่วง ${metaStart} ถึง ${metaEnd}</u> (${rangeDays} วันที่มีข้อมูล) — ไม่ใช่ยอดของวันเดียว จึงสูงกว่าแท่งรายวันในกราฟ Daily Output
        </div>`;
    }
    productBreakdownHtml += `
        <table class="w-full text-sm text-left">
            <thead class="bg-gray-100 text-gray-700 font-bold uppercase text-[11px] border-b">
                <tr>
                    <th class="px-4 py-2 text-left">รุ่นสินค้า (Model)</th>
                    <th class="px-4 py-2 text-right">FG (ชิ้น)</th>
                    ${isMultiDayRange ? '<th class="px-4 py-2 text-right">FG เฉลี่ย/วัน</th>' : ''}
                    <th class="px-4 py-2 text-right">NG (ชิ้น)</th>
                    <th class="px-4 py-2 text-right">NG (Kg)</th>
                    <th class="px-4 py-2 text-right">% Yield</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">`;
    if(data.productData && Object.keys(data.productData).length > 0) {
        // กำหนดลำดับการแสดงผลของรุ่น (Model) ตามที่ต้องการ
        const orderedModels = [
            "S1B29288-JR (10A)",
            "S1B71819-JR (16A)",
            "S1B29292-JR (20A)",
            "51207080HC-JR (25/32A)"
        ];
        
        let pKeys = Object.keys(data.productData);
        pKeys.sort((a, b) => {
            let idxA = orderedModels.indexOf(a);
            let idxB = orderedModels.indexOf(b);
            if (idxA === -1) idxA = 999; 
            if (idxB === -1) idxB = 999;
            return idxA - idxB;
        });

        pKeys.forEach(p => {
            let d = data.productData[p];
            let n = d.ngTotalPcs !== undefined ? d.ngTotalPcs : (d.ngTotal || 0);
            let f = d.fg || 0;
            let t = f + n;
            let y = t > 0 ? ((f/t)*100).toFixed(2) : "0.00";
            let kg = getKgFromPcs(p, n).toFixed(2);
            let avgPerDay = Math.round(f / rangeDays);
            productBreakdownHtml += `<tr>
                <td class="px-4 py-2.5 font-bold text-gray-800">${p}</td>
                <td class="px-4 py-2.5 text-right text-blue-700 font-bold">${f.toLocaleString()}</td>
                ${isMultiDayRange ? `<td class="px-4 py-2.5 text-right text-blue-500 text-xs">${avgPerDay.toLocaleString()}</td>` : ''}
                <td class="px-4 py-2.5 text-right text-red-600 font-medium">${n.toLocaleString()}</td>
                <td class="px-4 py-2.5 text-right text-orange-600 text-xs">${kg} Kg</td>
                <td class="px-4 py-2.5 text-right font-black text-green-700 bg-green-50/50">${y}%</td>
            </tr>`;
        });
    } else {
        productBreakdownHtml += `<tr><td colspan="${isMultiDayRange ? 6 : 5}" class="px-4 py-4 text-center text-gray-400 text-xs">ไม่มีข้อมูลการผลิตแยกตามรุ่น</td></tr>`;
    }
    productBreakdownHtml += `</tbody></table>`;
    if (totalSortPostedFg > 0 || totalSortPostedNg > 0) {
        productBreakdownHtml += `<div class="px-4 py-2 bg-gray-50 border-t border-gray-200 text-[11px] text-gray-600">
            ℹ️ ยอด FG ด้านบนรวมงานที่โพสต์กลับจากการคัดแยก (Batch <code>SORT-*</code>) อยู่ด้วย
            <b>${totalSortPostedFg.toLocaleString()}</b> ชิ้น (NG ${totalSortPostedNg.toLocaleString()} ชิ้น) —
            กราฟ Daily Output แยกยอดส่วนนี้ออกไปไว้ในแท่ง <b>FG/NG (คัดแยก)</b> เพื่อไม่ให้นับซ้ำกับฝั่งงานผลิต
        </div>`;
    }
    productBreakdownHtml += `</div>`;

    // 🌟 ส่วนเสริม: สรุปงานคัดแยก (Sorting) แยกตามรุ่น 🌟
    let sortingBreakdownHtml = '';
    const sortingKeys = Object.keys(sortingSummaryByModel);
    if (sortingKeys.length > 0) {
        const orderedForSort = [
            "S1B29288-JR (10A)",
            "S1B71819-JR (16A)",
            "S1B29292-JR (20A)",
            "51207080HC-JR (25/32A)"
        ];
        sortingKeys.sort((a, b) => {
            let idxA = orderedForSort.indexOf(a);
            let idxB = orderedForSort.indexOf(b);
            if (idxA === -1) idxA = 999;
            if (idxB === -1) idxB = 999;
            return idxA - idxB;
        });
        const totalSortQty = sortingTotalFG + sortingTotalNG;
        const totalSortNgPct = totalSortQty > 0 ? ((sortingTotalNG / totalSortQty) * 100).toFixed(2) : "0.00";

        sortingBreakdownHtml = `
        <div class="mt-6 bg-white border border-pink-200 rounded-lg shadow-sm overflow-hidden page-break-inside-avoid">
            <div class="bg-pink-50 border-b border-pink-200 px-4 py-2 flex justify-between items-center">
                <h4 class="text-sm font-bold text-pink-800 flex items-center gap-2">🗂️ สรุปงานคัดแยก (Sorting) แยกตามรุ่น</h4>
                <span class="text-[11px] text-pink-700">รวม ${sortingJobCount.toLocaleString()} จ๊อบ · FG ${sortingTotalFG.toLocaleString()} / NG ${sortingTotalNG.toLocaleString()} (${totalSortNgPct}%)</span>
            </div>
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-100 text-gray-700 font-bold uppercase text-[11px] border-b">
                    <tr>
                        <th class="px-4 py-2 text-left">รุ่นสินค้า (Model)</th>
                        <th class="px-4 py-2 text-right">จ๊อบ</th>
                        <th class="px-4 py-2 text-right">ดี (FG)</th>
                        <th class="px-4 py-2 text-right">เสีย (NG)</th>
                        <th class="px-4 py-2 text-right">% NG</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">`;
        sortingKeys.forEach(m => {
            const s = sortingSummaryByModel[m];
            const total = s.fg + s.ng;
            const ngPct = total > 0 ? ((s.ng / total) * 100).toFixed(2) : "0.00";
            const isHighNg = parseFloat(ngPct) > 5;
            sortingBreakdownHtml += `<tr>
                <td class="px-4 py-2.5 font-bold text-gray-800">${m}</td>
                <td class="px-4 py-2.5 text-right text-gray-600 text-xs">${s.jobs.toLocaleString()}</td>
                <td class="px-4 py-2.5 text-right text-blue-700 font-bold">${s.fg.toLocaleString()}</td>
                <td class="px-4 py-2.5 text-right text-red-600 font-medium">${s.ng.toLocaleString()}</td>
                <td class="px-4 py-2.5 text-right font-black ${isHighNg ? 'text-red-700 bg-red-50/70' : 'text-green-700 bg-green-50/50'}">${ngPct}%</td>
            </tr>`;
        });
        sortingBreakdownHtml += `</tbody></table></div>`;
    } else {
        sortingBreakdownHtml = `<div class="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-500 text-center">🗂️ ไม่มีข้อมูลงานคัดแยก (Sorting) ในช่วงวันที่เลือก</div>`;
    }

    // 🌟 ส่วนเสริม: สรุปความคืบหน้าตาม Job Order (แผนการผลิต) 🌟
    let jobOrderHtml = '';
    const jobOrders = (data.jobOrders || []).filter(j => j.status !== 'Cancelled');
    const joActualById = data.jobOrderData || {};

    if (jobOrders.length > 0) {
        const statusLabelTh = {
            'Open': 'รอผลิต', 'In Progress': 'กำลังผลิต', 'Completed': 'ผลิตครบแล้ว',
            'Closed': 'ปิดงาน', 'Cancelled': 'ยกเลิก'
        };
        // เรียงตามวันที่แผน จากเก่าไปใหม่
        const sortedJobs = jobOrders.slice().sort((a, b) => {
            const da = a.planDate || '9999-12-31';
            const db = b.planDate || '9999-12-31';
            return da < db ? -1 : (da > db ? 1 : 0);
        });

        const joQty = (j) => (typeof window.getJobOrderQty === 'function')
            ? window.getJobOrderQty(j)
            : { fg: j.producedFg || 0, ngNet: j.producedNgPcs || 0, sortingOpen: j.sortingOpenPcs || 0,
                accounted: j.accountedPcs || 0, target: j.targetQty || 0,
                shortage: Math.max(0, (j.targetQty || 0) - (j.accountedPcs || 0)),
                complete: (j.targetQty || 0) > 0 && (j.accountedPcs || 0) >= (j.targetQty || 0) };
        const joTotalTarget = sortedJobs.reduce((s, j) => s + (j.targetQty || 0), 0);
        const joTotalDone = sortedJobs.reduce((s, j) => s + (j.producedFg || 0), 0);
        const joTotalNg = sortedJobs.reduce((s, j) => s + joQty(j).ngNet, 0);
        const joTotalPending = sortedJobs.reduce((s, j) => s + joQty(j).sortingOpen, 0);
        const joTotalAccounted = sortedJobs.reduce((s, j) => s + joQty(j).accounted, 0);
        const joTotalPct = joTotalTarget > 0 ? ((joTotalDone / joTotalTarget) * 100).toFixed(1) : '0.0';

        jobOrderHtml = `
        <div class="mt-6 bg-white border border-indigo-200 rounded-lg shadow-sm overflow-hidden page-break-inside-avoid">
            <div class="bg-indigo-50 border-b border-indigo-200 px-4 py-2 flex justify-between items-center">
                <h4 class="text-sm font-bold text-indigo-800 flex items-center gap-2">📋 ความคืบหน้าตาม Job Order (แผนการผลิต)</h4>
                <span class="text-[11px] text-indigo-700">${sortedJobs.length} จ๊อบ · เป้า ${joTotalTarget.toLocaleString()} / ผลิตแล้ว ${joTotalDone.toLocaleString()} (${joTotalPct}%) · NG สุทธิ ${joTotalNg.toLocaleString()} · รอ Sorting ${joTotalPending.toLocaleString()} · รวมนับได้ ${joTotalAccounted.toLocaleString()}</span>
            </div>
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-100 text-gray-700 font-bold uppercase text-[11px] border-b">
                    <tr>
                        <th class="px-3 py-2 text-left">Job Order</th>
                        <th class="px-3 py-2 text-left">รุ่นสินค้า</th>
                        <th class="px-3 py-2 text-center">วันที่แผน</th>
                        <th class="px-3 py-2 text-right">เป้า (ชิ้น)</th>
                        <th class="px-3 py-2 text-right">ผลิตแล้ว</th>
                        <th class="px-3 py-2 text-right">ผลิตช่วงนี้</th>
                        <th class="px-3 py-2 text-right">NG สุทธิ (ชิ้น)</th>
                        <th class="px-3 py-2 text-right">รอ Sorting</th>
                        <th class="px-3 py-2 text-right">รวมนับได้</th>
                        <th class="px-3 py-2 text-right">คงเหลือ</th>
                        <th class="px-3 py-2 text-right">%</th>
                        <th class="px-3 py-2 text-center">สถานะ</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">`;

        sortedJobs.forEach(j => {
            const inRange = joActualById[j.jobOrder] || { fg: 0, ngPcs: 0 };
            const q = joQty(j);
            const pct = (j.progressPct || 0).toFixed(1);
            const pctCls = (j.progressPct || 0) >= 100 ? 'text-green-700 bg-green-50/60'
                         : ((j.progressPct || 0) >= 50 ? 'text-blue-700' : 'text-amber-700 bg-amber-50/50');
            jobOrderHtml += `<tr>
                <td class="px-3 py-2 font-bold text-indigo-700">${j.jobOrder}</td>
                <td class="px-3 py-2 text-gray-800">${j.product || '-'}</td>
                <td class="px-3 py-2 text-center text-xs text-gray-600">${j.planDate || '-'}</td>
                <td class="px-3 py-2 text-right font-bold text-gray-700">${(j.targetQty || 0).toLocaleString()}</td>
                <td class="px-3 py-2 text-right font-bold text-blue-700">${(j.producedFg || 0).toLocaleString()}</td>
                <td class="px-3 py-2 text-right text-gray-600">${(inRange.fg || 0).toLocaleString()}</td>
                <td class="px-3 py-2 text-right text-red-600">${q.ngNet.toLocaleString()}</td>
                <td class="px-3 py-2 text-right text-amber-600">${q.sortingOpen.toLocaleString()}</td>
                <td class="px-3 py-2 text-right font-bold text-indigo-700">${q.accounted.toLocaleString()}
                    ${q.target > 0 ? (q.complete ? '<span class="text-[10px] text-green-600 font-bold"> ครบ</span>' : `<span class="text-[10px] text-red-500 font-bold"> ขาด ${q.shortage.toLocaleString()}</span>`) : ''}
                </td>
                <td class="px-3 py-2 text-right font-bold ${(j.remainingQty || 0) > 0 ? 'text-amber-700' : 'text-gray-400'}">${(j.remainingQty || 0).toLocaleString()}</td>
                <td class="px-3 py-2 text-right font-black ${pctCls}">${pct}%</td>
                <td class="px-3 py-2 text-center text-xs text-gray-700">${statusLabelTh[j.status] || j.status}</td>
            </tr>`;
        });

        jobOrderHtml += `</tbody></table>
            <div class="px-4 py-2 bg-gray-50 border-t border-gray-200 text-[11px] text-gray-600">
                ℹ️ "ผลิตแล้ว" คือยอดสะสมทั้งหมดของ Job Order นั้น ส่วน "ผลิตช่วงนี้" คือยอดเฉพาะช่วงวันที่ของรายงานฉบับนี้<br>
                ℹ️ "รวมนับได้" = ผลิตแล้ว (FG) + NG + รอ Sorting — งานที่พบระหว่างผลิตยังไม่เคยถูกบันทึกเป็น FG/NG จึงเป็นยอดใหม่ ส่วนงานที่พบที่ FG/RTV ถูกหักออกจาก FG แล้ว ทั้งสามก้อนจึงไม่ซ้ำกัน
            </div>
        </div>`;
    } else {
        jobOrderHtml = `<div class="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-500 text-center">📋 ไม่มีข้อมูล Job Order / แผนการผลิตในช่วงวันที่เลือก</div>`;
    }

    // 🌟 ส่วนที่ 2: บทวิเคราะห์อัตราการผลิต 🌟
    const getChartImg = (id) => {
        const canvas = document.getElementById(id);
        return (canvas && canvas.toDataURL) ? canvas.toDataURL('image/png', 1.0) : '';
    };

    let peakHour = {label: '-', fg: 0};
    if(data.hourlyData && data.hourlyLabels) {
        data.hourlyData.forEach((val, idx) => {
            if(val > peakHour.fg) { peakHour = {label: data.hourlyLabels[idx], fg: val}; }
        });
    }

    let sec2_1_title, sec2_1_desc, sec2_1_img;
    if (isSingleDay) {
        sec2_1_title = "📊 บทวิเคราะห์อัตราการผลิตรายชั่วโมง (Hourly Throughput)";
        sec2_1_desc = multiLang(
            `การประเมินความสม่ำเสมอของการเดินสายพานใน 1 วัน/กะ พบว่ามีจุดสูบฉีดผลผลิตสูงสุด (Peak Performance Hour) ที่ช่วงเวลา <b>${peakHour.label}</b> โดยทำศักยภาพได้ถึง <b>${peakHour.fg.toLocaleString()}</b> ชิ้น หากมีความแตกต่างสูงระหว่างชั่วโมง อาจเกิดจากความสูญเปล่าแฝง (Hidden Waste) หรือการหยุดซ่อมบำรุง`,
            `Evaluating the assembly line consistency in 1 day/shift reveals the peak performance hour at <b>${peakHour.label}</b>, reaching <b>${peakHour.fg.toLocaleString()}</b> pcs. High variance between hours may indicate hidden waste or maintenance downtime.`,
            `通过对 1 天/班次的生产线稳定性评估，发现峰值产能时段在 <b>${peakHour.label}</b>，产量达到 <b>${peakHour.fg.toLocaleString()}</b> 件。如果不同时段差异较大，可能意味着存在隐性浪费或设备停机维护。`
        );
        sec2_1_img = getChartImg('hourlyChart');
    } else {
        sec2_1_title = "📊 บทวิเคราะห์การกระจายตัวของผลผลิตรายวัน (Daily Throughput)";
        sec2_1_desc = multiLang(
            `จากการวิเคราะห์ความสัมพันธ์ระหว่างปริมาณงานดี (FG) และความสูญเสีย (NG) สะท้อนให้เห็นถึงขีดความสามารถการเดินเครื่องของฝ่ายผลิตตลอดช่วงเวลาที่เลือก หากกราฟแท่งมีความสม่ำเสมอ บ่งชี้ถึงประสิทธิภาพการดำเนินงานที่คงที่`,
            `The analysis of Finished Goods (FG) and No Good (NG) reflects the machine's capacity over the selected period. A consistent bar graph indicates stable operational efficiency and resource readiness.`,
            `通过对良品 (FG) 和不良品 (NG) 比例的分析，反映了所选期间内的生产能力。如果柱状图分布均匀，则表明运行效率稳定且资源准备充分。`
        );
        sec2_1_img = getChartImg('dailyOutputChart');
    }

    // 🌟 ส่วนที่ 3: สาเหตุของเสียเชิงลึกและ Pareto 🌟
    const labels = data.ngLabels || [];
    const vals = data.ngValuesPcs || data.ngValues || [];
    // รวม Setup เข้ากับอาการหลัก
    const rawNgMap = {};
    labels.forEach((l, i) => { rawNgMap[l] = (rawNgMap[l] || 0) + (vals[i] || 0); });
    const reportSep = window.separateSetupData(rawNgMap);
    const ngItems = reportSep.labels.map((l, i) => ({ label: l, pcs: reportSep.total[i] || 0 })).filter(i => i.pcs > 0).sort((a,b)=>b.pcs-a.pcs);
    
    let topNgSymptomName = '-', topNgSymptomRatio = 0, topNgHtml = '';
    if(ngItems.length > 0) {
        topNgHtml = `<ul class="list-disc pl-5 mt-2 space-y-1 text-sm text-gray-700">`;
        ngItems.slice(0, 3).forEach((item, idx) => {
            let pct = totalNG > 0 ? ((item.pcs / totalNG) * 100).toFixed(1) : 0;
            if(idx === 0) { topNgSymptomName = item.label; topNgSymptomRatio = pct; }
            topNgHtml += `<li>อันดับ ${idx+1}: <b>${item.label}</b> จำนวน ${item.pcs.toLocaleString()} ชิ้น (${pct}%)</li>`;
        });
        topNgHtml += `</ul>`;
    } else {
        topNgHtml = `<p class="mt-2 text-green-600 font-bold text-sm">🎉 สมบูรณ์แบบ ไม่พบของเสียหลุดรอดในกระบวนการผลิต</p>`;
    }

    let paretoDesc = multiLang(
        `อ้างอิงจากหลักการพาเรโต (80/20) ปัญหาคอขวดด้านคุณภาพที่หล่อเลี้ยงความสูญเสียมากที่สุดคือ <b>${topNgSymptomName}</b> ซึ่งกินสัดส่วนสูงถึง <b>${topNgSymptomRatio}%</b> การพุ่งเป้าแก้ไขปัญหานี้เป็นอันดับแรกจะช่วยกอบกู้ Yield กลับมาได้เร็วที่สุด`,
        `Based on the Pareto principle (80/20), the primary quality bottleneck causing the most loss is <b>${topNgSymptomName}</b>, accounting for <b>${topNgSymptomRatio}%</b>. Targeting this issue first will maximize Yield recovery.`,
        `根据帕累托法则 (80/20)，造成最大损失的主要质量瓶颈是 <b>${topNgSymptomName}</b>，占 <b>${topNgSymptomRatio}%</b>。优先解决此问题将最快地恢复良率。`
    );

    // สร้างรูปกราฟ Pareto
    let autoReportParetoConfig = null;
    if (ngItems.length > 0 && typeof Chart !== 'undefined') {
        const pLabels = ngItems.map(item => item.label);
        const pDataPcs = ngItems.map(item => item.pcs);
        let cumulativeAcc = 0;
        // ใช้ผลรวมของ ngItems เป็นตัวหารถ้า totalNG ไม่ถูกต้อง (0/น้อยกว่าผลรวม) — กัน Infinity%/เกิน 100%
        const sumPcs = pDataPcs.reduce((a, b) => a + b, 0);
        const cumDenom = (totalNG && totalNG >= sumPcs) ? totalNG : (sumPcs || 1);
        const pDataCum = pDataPcs.map(val => { cumulativeAcc += val; return (cumulativeAcc / cumDenom * 100).toFixed(2); });
        
        // กำหนดสีให้แท่ง Pareto ตามอาการ (ใช้ฟังก์ชัน getSymptomColor ที่สร้างไว้)
        const pBarColors = pLabels.map(label => getSymptomColor(label));
        
        autoReportParetoConfig = {
            labels: pLabels,
            datasets: [
                { type: 'bar', label: 'NG (ชิ้น)', data: pDataPcs, backgroundColor: pBarColors, yAxisID: 'y' },
                { type: 'line', label: 'Cumulative (%)', data: pDataCum, borderColor: 'rgba(59, 130, 246, 1)', backgroundColor: 'rgba(59, 130, 246, 1)', borderWidth: 2, tension: 0.3, yAxisID: 'y1' }
            ]
        };
    }

    // ส่วนที่ 3.2 - ถ้ารายวัน ซ่อนกราฟนี้ ถ้าหลายวัน แสดง Trend + บรรยายลึกซึ้ง
    let sec3_2_html = '';
    let autoReportNgTrendConfig = null;
    if (!isSingleDay && data.dailyTrend && data.dailyTrend.length > 0) {
        let breachedDays = 0;
        let peakNgDay = { date: '-', rate: 0 };
        let trendDescTH = "ทรงตัว", trendDescEN = "Stable", trendDescCH = "保持稳定";
        
        data.dailyTrend.forEach(d => {
            let total = d.fg + d.ng;
            let rate = total > 0 ? (d.ng / total) * 100 : 0;
            if(rate > 0.5) breachedDays++;
            if(rate > peakNgDay.rate) peakNgDay = { date: d.date, rate: rate };
        });
        
        let firstHalf = data.dailyTrend.slice(0, Math.ceil(data.dailyTrend.length/2)).reduce((a,b)=>a+(b.fg+b.ng>0?(b.ng/(b.fg+b.ng)*100):0),0);
        let secondHalf = data.dailyTrend.slice(Math.ceil(data.dailyTrend.length/2)).reduce((a,b)=>a+(b.fg+b.ng>0?(b.ng/(b.fg+b.ng)*100):0),0);
        if(secondHalf > firstHalf * 1.2) { trendDescTH = "มีแนวโน้มเพิ่มสูงขึ้น"; trendDescEN = "Upward trend"; trendDescCH = "呈上升趋势"; }
        else if (firstHalf > secondHalf * 1.2) { trendDescTH = "มีแนวโน้มลดลง (ดีขึ้น)"; trendDescEN = "Downward trend (Improving)"; trendDescCH = "呈下降趋势 (改善)"; }

        let s32_desc = multiLang(
            `จากการวิเคราะห์ภาพรวมพบว่าอัตราของเสีย <b>${trendDescTH}</b> โดยมีวันที่สัดส่วนทะลุเพดานควบคุม (Target > 0.5%) จำนวน <b>${breachedDays} วัน</b> จุดวิกฤตสูงสุดเกิดขึ้นในวันที่ <b>${peakNgDay.date}</b> ที่อัตรา <b>${peakNgDay.rate.toFixed(2)}%</b>`,
            `Analysis indicates an overall <b>${trendDescEN}</b> in defect rates. There were <b>${breachedDays} days</b> breaching the 0.5% limit. The peak crisis occurred on <b>${peakNgDay.date}</b> at <b>${peakNgDay.rate.toFixed(2)}%</b>.`,
            `分析结果表明，整体不良率 <b>${trendDescCH}</b>。共有 <b>${breachedDays} 天</b> 突破了 0.5% 的控制上限。最高峰危机发生在 <b>${peakNgDay.date}</b>，不良率达到 <b>${peakNgDay.rate.toFixed(2)}%</b>。`
        );

        sec3_2_html = `
        <div class="mb-8 page-break-inside-avoid">
            <h3 class="text-lg font-bold text-gray-800 border-l-4 border-red-500 pl-3 mb-4 bg-white shadow-sm py-2.5 rounded-r-lg">📉 แนวโน้มการเกิดซ้ำของปัญหา (Defect Chronology)</h3>
            <div class="border border-gray-200 p-5 rounded-xl bg-white shadow-sm flex flex-col">
                ${s32_desc}
                <div class="mt-auto w-full bg-gray-50 rounded-lg p-4 border border-gray-100 h-[300px] relative">
                    <canvas id="auto-report-ng-trend-chart" style="width:100%; height:100%;"></canvas>
                </div>
            </div>
        </div>
        `;

        // รวม Setup เข้ากับอาการหลัก
        const symptomTotals = {};
        data.dailyTrend.forEach(d => {
            if(d.ngBreakdown) Object.keys(d.ngBreakdown).forEach(k => {
                const parsed = window.parseSetupType(k);
                const baseKey = parsed.base;
                symptomTotals[baseKey] = (symptomTotals[baseKey] || 0) + d.ngBreakdown[k];
            });
        });
        const topSymptoms = Object.entries(symptomTotals).sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0]);
        
        // --- 🌟 ดึงข้อมูล Overall Daily Trend เข้ามาโชว์ในกราฟด้วย ---
        const ngTrendDatasets = [];
        
        // 1. ใส่เส้น Overall NG Rate ไว้เป็นเส้นแรก (สีดำเด่นๆ)
        ngTrendDatasets.push({
            label: 'Overall NG Rate (%) - ภาพรวม',
            data: data.dailyTrend.map(d => {
                const totalProd = d.fg + d.ng;
                return totalProd > 0 ? Math.min(parseFloat(((d.ng / totalProd) * 100).toFixed(2)), 100) : 0;
            }),
            borderColor: '#0f172a', // สีดำ/กรมท่าเข้ม
            backgroundColor: '#0f172a',
            borderWidth: 3, 
            tension: 0.3,
            fill: false
        });

        // 2. ใส่เส้นรายอาการ
        topSymptoms.forEach((sym) => {
            let color = getSymptomColor(sym); // 🌟 ใช้สีคงที่ตามพจนานุกรม
            ngTrendDatasets.push({
                label: sym + ' (%)',
                data: data.dailyTrend.map(d => {
                    const totalProd = d.fg + d.ng;
                    // รวม base + Setup ของอาการนี้
                    let symPcs = 0;
                    if (d.ngBreakdown) {
                        Object.keys(d.ngBreakdown).forEach(k => {
                            const parsed = window.parseSetupType(k);
                            if (parsed.base === sym) symPcs += d.ngBreakdown[k];
                        });
                    }
                    return totalProd > 0 ? Math.min(parseFloat(((symPcs / totalProd) * 100).toFixed(2)), 100) : 0;
                }),
                borderColor: color,
                backgroundColor: color,
                borderWidth: 2,
                tension: 0.3,
                fill: false
            });
        });
        
        // 3. ใส่เส้น Target Limit
        ngTrendDatasets.push({ 
            label: "Target Limit (0.5%)", 
            data: data.dailyTrend.map(() => 0.5), 
            borderColor: 'rgba(239, 68, 68, 1)', 
            backgroundColor: 'rgba(239, 68, 68, 0.1)', 
            borderWidth: 2, 
            borderDash: [5, 5], 
            pointRadius: 0, 
            fill: false, 
            tension: 0 
        });

        autoReportNgTrendConfig = { labels: data.dailyTrend.map(d => d.date), datasets: ngTrendDatasets };
    }

    // ส่วนที่ 3.3 - Top 3 Defect Source (Machine) พร้อมกราฟแสดงเครื่องที่เสียเยอะ
    let macNgList = [];
    if(data.machineData) {
        for(let m in data.machineData) {
            let mNg = data.machineData[m].ngTotalPcs !== undefined ? data.machineData[m].ngTotalPcs : (data.machineData[m].ngTotal || 0);
            let kg = data.machineData[m].ngTotalKg || 0;
            if(mNg > 0) macNgList.push({name: m, ng: mNg, kg: kg});
        }
    }
    macNgList.sort((a,b)=>b.ng-a.ng);
    
    let top3Macs = macNgList.slice(0,3);
    let top3StrTH = top3Macs.map((m, i) => `อันดับ ${i+1} <b>${m.name}</b> (${m.ng.toLocaleString()} ชิ้น)`).join(', ');
    let top3StrEN = top3Macs.map((m, i) => `Rank ${i+1}: <b>${m.name}</b> (${m.ng.toLocaleString()} pcs)`).join(', ');
    let top3StrCH = top3Macs.map((m, i) => `第 ${i+1} 名: <b>${m.name}</b> (${m.ng.toLocaleString()} 件)`).join('，');
    if(top3Macs.length === 0) { top3StrTH = "ไม่มีข้อมูลของเสีย"; top3StrEN = "No defects found"; top3StrCH = "未发现缺陷"; }
    
    let sec3_3_desc = multiLang(
        `ผลลัพธ์จากการ Mapping พบว่าเครื่องจักรที่เป็นแหล่งกำเนิดของเสียสูงสุด 3 อันดับแรก ได้แก่ ${top3StrTH} ควรยกระดับแผนการซ่อมบำรุงเชิงป้องกัน (PM) อย่างเร่งด่วน`,
        `Defect mapping reveals the top 3 machines generating the most defects are: ${top3StrEN}. Elevating Preventive Maintenance (PM) plans for these machines is highly recommended.`,
        `缺陷分布图显示，产生缺陷最多的前3台机器是：${top3StrCH}。强烈建议立即加强这些机器的预防性维护 (PM) 计划。`
    );

    // สร้าง Config กราฟสำหรับหัวข้อ 3.3 Defect Source Mapping
    let autoReportMachineNgConfig = null;
    if (macNgList.length > 0) {
        autoReportMachineNgConfig = {
            labels: macNgList.map(m => m.name),
            datasets: [{
                label: 'NG (ชิ้น)',
                data: macNgList.map(m => m.ng),
                backgroundColor: 'rgba(249, 115, 22, 0.8)', 
                borderColor: 'rgba(249, 115, 22, 1)',
                borderWidth: 1
            }]
        };
    }

    // 🌟 ส่วนที่ 4: การวิเคราะห์แนวโน้มรายวันแยกตามเครื่องจักร (1-16) 🌟
    let machineChartConfigs = [];
    let machineNgChartConfigs = []; // 🌟 เก็บ config สำหรับกราฟ NG Trend Breakdown
    let machineAnalysisHtml = `<div class="page-break-before print-page mb-8">`;
    
    for(let i=1; i<=16; i++) {
        let m = `CWM-${String(i).padStart(2,'0')}`;
        let mData = data.machineData && data.machineData[m] ? data.machineData[m] : null;
        let assignedProduct = machineMapping[m] || 'ไม่ระบุรุ่น (Unassigned)';
        
        let mDaily = mData ? mData.daily : {};
        let dates = Object.keys(mDaily).sort();
        
        let totalMFg = 0; let totalMNg = 0; let maxNgRate = 0; let maxNgDate = '-'; let trend = [];

        dates.forEach(d => {
            const fg = mDaily[d].fg || 0; const ng = mDaily[d].ngPcs || 0; const total = fg + ng;
            const rate = total > 0 ? (ng / total) * 100 : 0;
            totalMFg += fg; totalMNg += ng; trend.push(rate);
            if (rate > maxNgRate) { maxNgRate = rate; maxNgDate = d; }
        });

        // 🌟 ดึงข้อมูลแจ้งซ่อมของเครื่องนี้ 🌟
        let logs = [];
        if(data.maintenanceLogs) {
            logs = data.maintenanceLogs.filter(log => log.machine === m);
            // เรียงลำดับตามวันที่และเวลา (เก่าไปใหม่)
            logs.sort((a, b) => {
                let dA = new Date(a.date).getTime();
                let dB = new Date(b.date).getTime();
                if (dA === dB) {
                    return (a.startTime || "").localeCompare(b.startTime || "");
                }
                return dA - dB;
            });
        }
        
        let maintTableHtml = '';
        
        if (logs.length > 0) {
            maintTableHtml = `
            <div class="mt-4">
                <h5 class="text-xs font-bold text-orange-700 mb-1">🛠️ ประวัติปัญหาเครื่องจักรและการแจ้งซ่อม (Maintenance Logs)</h5>
                <div class="border border-gray-200 rounded overflow-hidden">
                    <table class="w-full text-[10px] text-left bg-white">
                        <thead class="bg-orange-50 text-orange-800 border-b border-orange-100">
                            <tr>
                                <th class="px-2 py-1.5 w-20">วันที่</th>
                                <th class="px-2 py-1.5 w-32">เวลาเริ่ม-เสร็จ</th>
                                <th class="px-2 py-1.5 w-28">ประเภทปัญหา</th>
                                <th class="px-2 py-1.5">รายละเอียด/การแก้ไขเบื้องต้น</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            ${logs.map(log => {
                                let s = formatTimeStr(log.startTime);
                                // แสดงวันที่คู่กับเวลาปิดจ๊อบ หากมีการแก้ไขข้ามวัน
                                let endDateStr = log.endDate ? formatDateShort(log.endDate) + ' ' : '';
                                let e = log.endTime ? endDateStr + formatTimeStr(log.endTime) : '<span class="text-red-500 font-bold">รอดำเนินการ</span>';
                                let remarkTrans = getTranslatedRemark(log.remark);
                                return `<tr>
                                    <td class="px-2 py-2 text-gray-700 align-top whitespace-nowrap">${log.date}</td>
                                    <td class="px-2 py-2 font-medium align-top whitespace-nowrap">${s} - ${e}</td>
                                    <td class="px-2 py-2 text-blue-700 align-top whitespace-nowrap">${log.issueType}</td>
                                    <td class="px-2 py-2 align-top">
                                        <div class="space-y-0.5">
                                            <p class="text-[10px] text-gray-800"><span class="font-bold text-blue-600 mr-1">[TH]</span>${remarkTrans.th}</p>
                                            <p class="text-[9px] text-gray-600"><span class="font-bold text-red-600 mr-1">[EN]</span>${remarkTrans.en}</p>
                                            <p class="text-[9px] text-gray-500"><span class="font-bold text-gray-700 mr-1">[CH]</span>${remarkTrans.ch}</p>
                                        </div>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
        }

        let cardHtml = '';

        if (totalMFg > 0 || totalMNg > 0) {
            // กรณีมีผลผลิต -> โชว์กราฟ และกล่องสรุป FG/NG
            const avgMYield = totalMFg + totalMNg > 0 ? ((totalMFg / (totalMFg + totalMNg)) * 100).toFixed(2) : 0;
            const avgMNgRate = (100 - avgMYield).toFixed(2);
            const variance = trend.length > 1 ? (Math.max(...trend) - Math.min(...trend)).toFixed(2) : 0;
            
            let stabilityTH = variance < 5 ? "ความเสถียรสูง" : (variance < 15 ? "ผันผวนปานกลาง" : "ผันผวนสูงมาก");
            let stabilityEN = variance < 5 ? "Highly Stable" : (variance < 15 ? "Moderate Variance" : "Highly Unstable");
            let stabilityCH = variance < 5 ? "高度稳定" : (variance < 15 ? "中等波动" : "极不稳定");
            
            let targetEvalTH = parseFloat(avgMNgRate) <= 0.5 ? "ผ่านเกณฑ์" : "ตกเกณฑ์มาตรฐาน (NG > 0.5%)";
            let targetEvalEN = parseFloat(avgMNgRate) <= 0.5 ? "Target Passed" : "Target Failed (NG > 0.5%)";
            let targetEvalCH = parseFloat(avgMNgRate) <= 0.5 ? "达标" : "未达标 (NG > 0.5%)";
            let targetColor = parseFloat(avgMNgRate) <= 0.5 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700";

            let chartId = `mchart_${m.replace(/\W/g, '')}`;
            
            let chartLabels, fgData, ngData, rateData, targetData;
            if (isSingleDay) {
                chartLabels = data.hourlyLabels || [];
                fgData = mData.hourlyFg || [];
                ngData = mData.hourlyNgPcs || mData.hourlyNg || [];
                rateData = chartLabels.map((_, idx) => {
                    let f = fgData[idx] || 0; let n = ngData[idx] || 0;
                    return (f+n)>0 ? (n/(f+n)*100).toFixed(2) : 0;
                });
                targetData = chartLabels.map(() => 0.5);
            } else {
                chartLabels = dates;
                fgData = dates.map(d => mDaily[d].fg || 0);
                ngData = dates.map(d => mDaily[d].ngPcs || 0);
                rateData = dates.map(d => {
                    let f = mDaily[d].fg || 0; let n = mDaily[d].ngPcs || 0;
                    return (f+n) > 0 ? (n/(f+n)*100).toFixed(2) : 0;
                });
                targetData = dates.map(() => 0.5);
            }

            machineChartConfigs.push({
                id: chartId, labels: chartLabels, fgData: fgData, ngData: ngData, rateData: rateData, targetData: targetData 
            });

            // 🌟 เตรียมข้อมูลกราฟแนวโน้ม (NG Trend Breakdown) สำหรับเครื่องนี้ 🌟
            let ngChartId = null;
            if (totalMNg > 0 && mData.ngBreakdownPcs && Object.keys(mData.ngBreakdownPcs).length > 0) {
                ngChartId = `mchart_ng_${m.replace(/\W/g, '')}`;

                // รวม Setup เข้ากับอาการหลักสำหรับ breakdown
                const macSepReport = window.separateSetupData(mData.ngBreakdownPcs);
                const mergedBreakdown = {};
                macSepReport.labels.forEach((l, i) => { mergedBreakdown[l] = macSepReport.total[i]; });
                let sortedBreakdown = Object.entries(mergedBreakdown).sort((a,b) => b[1] - a[1]);
                let topSyms = sortedBreakdown.slice(0, 5).map(item => item[0]);

                let sDatasets = topSyms.map((sym) => {
                    let color = getSymptomColor(sym); // 🌟 ใช้สีคงที่
                    let sData = [];

                    if (isSingleDay) {
                        sData = chartLabels.map((_, hIdx) => {
                            let bd = (mData.hourlyNgBreakdown && mData.hourlyNgBreakdown[hIdx]) ? mData.hourlyNgBreakdown[hIdx] : {};
                            // รวม Setup ของอาการนี้
                            let total = 0;
                            Object.keys(bd).forEach(k => {
                                const parsed = window.parseSetupType(k);
                                if (parsed.base.toLowerCase() === sym.toLowerCase()) total += bd[k];
                            });
                            return total;
                        });
                    } else {
                        sData = chartLabels.map(d => {
                            let dData = mDaily[d] || {};
                            let bd = dData.ngBreakdownPcs || dData.ngBreakdown || {};
                            // รวม Setup ของอาการนี้
                            let total = 0;
                            Object.keys(bd).forEach(k => {
                                const parsed = window.parseSetupType(k);
                                if (parsed.base.toLowerCase() === sym.toLowerCase()) total += bd[k];
                            });
                            return total;
                        });
                    }
                    
                    return {
                        label: sym,
                        data: sData,
                        borderColor: color,
                        backgroundColor: color,
                        borderWidth: 2,
                        tension: 0.3,
                        fill: false,
                        type: 'line'
                    };
                });

                // ตรวจสอบว่าระบบมีข้อมูลสัดส่วนแยกตามวัน/เวลา จริงๆ หรือไม่
                let hasTimeSeriesData = sDatasets.some(ds => ds.data.some(v => v > 0));

                if (hasTimeSeriesData) {
                    machineNgChartConfigs.push({
                        id: ngChartId,
                        isTrend: true,
                        labels: chartLabels,
                        datasets: sDatasets
                    });
                } else {
                    // Fallback: หากระบบหลังบ้านไม่ได้ส่งข้อมูล Time-series มาให้ จะแสดงผลรวมเป็นกราฟแท่งแนวตั้งแทน (Pareto Style)
                    
                    // สร้าง Array สีให้ตรงกับ Label แต่ละแท่ง
                    const barColors = sortedBreakdown.map(x => getSymptomColor(x[0]));
                    
                    machineNgChartConfigs.push({
                        id: ngChartId,
                        isTrend: false,
                        labels: sortedBreakdown.map(x => x[0]),
                        datasets: [{
                            label: 'NG (ชิ้น)',
                            data: sortedBreakdown.map(x => x[1]),
                            backgroundColor: barColors,
                            borderColor: barColors,
                            borderWidth: 1,
                            type: 'bar'
                        }]
                    });
                }
            }

            // ปรับคำอธิบาย หากเป็น Single Day ให้ตัดเรื่องความแปรปรวน (Variance) ทิ้ง
            let descHtml = "";
            if (isSingleDay) {
                descHtml = multiLang(
                    `เดินผลผลิตรวม <b>${(totalMFg+totalMNg).toLocaleString()} ชิ้น</b> พบของเสีย <b>${totalMNg.toLocaleString()} ชิ้น</b> (${targetEvalTH}) จุดวิกฤตของเสียสูงสุดที่ <b>${maxNgRate.toFixed(2)}%</b>`,
                    `Total output <b>${(totalMFg+totalMNg).toLocaleString()} pcs</b>, defects <b>${totalMNg.toLocaleString()} pcs</b> (${targetEvalEN}). Peak NG crisis hit <b>${maxNgRate.toFixed(2)}%</b>.`,
                    `总产量 <b>${(totalMFg+totalMNg).toLocaleString()} 件</b>，不良品 <b>${totalMNg.toLocaleString()} 件</b> (${targetEvalCH})。最高不良率达到 <b>${maxNgRate.toFixed(2)}%</b>。`
                );
            } else {
                descHtml = multiLang(
                    `เดินผลผลิตรวม <b>${(totalMFg+totalMNg).toLocaleString()} ชิ้น</b> พบของเสีย <b>${totalMNg.toLocaleString()} ชิ้น</b> (${targetEvalTH}) มีความแปรปรวน ${variance}% (${stabilityTH}) จุดวิกฤตของเสียสูงสุดที่ <b>${maxNgRate.toFixed(2)}%</b>`,
                    `Total output <b>${(totalMFg+totalMNg).toLocaleString()} pcs</b>, defects <b>${totalMNg.toLocaleString()} pcs</b> (${targetEvalEN}). Variance is ${variance}% (${stabilityEN}). Peak NG crisis hit <b>${maxNgRate.toFixed(2)}%</b>.`,
                    `总产量 <b>${(totalMFg+totalMNg).toLocaleString()} 件</b>，不良品 <b>${totalMNg.toLocaleString()} 件</b> (${targetEvalCH})。波动率为 ${variance}% (${stabilityCH})。最高不良率达到 <b>${maxNgRate.toFixed(2)}%</b>。`
                );
            }

            // 🌟 สร้าง HTML กล่องสรุป FG/NG แบบเจาะลึก 🌟
            let fgModelHtml = `<li><span class="font-medium text-gray-600">รุ่น (Model):</span> <b>${assignedProduct}</b> = ${totalMFg.toLocaleString()} ชิ้น</li>`;
            
            let ngModelSymptomHtml = `<li><span class="font-medium text-gray-600">รุ่น (Model):</span> <b>${assignedProduct}</b></li>`;
            if (mData.ngBreakdownPcs && Object.keys(mData.ngBreakdownPcs).length > 0) {
                // รวม Setup เข้ากับอาการหลัก
                const rptMacSep = window.separateSetupData(mData.ngBreakdownPcs);
                const mergedNgItems = rptMacSep.labels.map((l, idx) => [l, rptMacSep.total[idx], rptMacSep.setup[idx]]).sort((a,b) => b[1] - a[1]);
                mergedNgItems.forEach(item => {
                    let c = getSymptomColor(item[0]);
                    let setupNote = item[2] > 0 ? ` <span class="text-orange-500">(Setup: ${item[2].toLocaleString()})</span>` : '';
                    ngModelSymptomHtml += `<li class="ml-4 text-[10px] flex items-center gap-1"><span class="w-2 h-2 inline-block rounded-full" style="background-color:${c}"></span><span class="text-gray-700">${item[0]}: <b class="text-red-600">${item[1].toLocaleString()}</b> ชิ้น${setupNote}</span></li>`;
                });
            } else if (totalMNg > 0) {
                ngModelSymptomHtml += `<li class="ml-4 text-[10px] text-red-600">- ไม่ระบุรายละเอียดอาการ: ${totalMNg.toLocaleString()} ชิ้น</li>`;
            } else {
                ngModelSymptomHtml = `<li class="text-green-600 font-bold mt-1">🎉 ไม่มีของเสีย (Zero Defect)</li>`;
            }

            let breakdownCardsHtml = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div class="bg-blue-50 p-3 rounded-lg border border-blue-100 shadow-sm">
                    <p class="text-xs font-bold text-blue-800 border-b border-blue-200 pb-1 mb-2">📦 ยอดงานดี (Total FG): <span class="text-sm">${totalMFg.toLocaleString()} ชิ้น</span></p>
                    <ul class="text-[11px] text-blue-900 space-y-1 list-none">
                        ${fgModelHtml}
                    </ul>
                </div>
                <div class="bg-red-50 p-3 rounded-lg border border-red-100 shadow-sm">
                    <p class="text-xs font-bold text-red-800 border-b border-red-200 pb-1 mb-2">🗑️ ยอดของเสีย (Total NG): <span class="text-sm">${totalMNg.toLocaleString()} ชิ้น</span></p>
                    <ul class="text-[11px] text-red-900 space-y-1 list-none">
                        ${ngModelSymptomHtml}
                    </ul>
                </div>
            </div>`;

            cardHtml = `
                <div class="border border-gray-200 p-5 rounded-xl bg-white shadow-sm">
                    <div class="flex justify-between items-center mb-3 border-b border-gray-100 pb-2">
                        <h4 class="font-black text-blue-800 text-base flex items-center gap-2">🏭 เครื่องจักร: ${m}</h4>
                        <span class="text-xs font-bold ${targetColor} px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
                            ${targetEvalTH} | เฉลี่ย ${avgMNgRate}%
                        </span>
                    </div>
                    ${descHtml}
                    ${breakdownCardsHtml}
                    <div class="bg-gray-50 p-4 rounded-lg border border-gray-100 w-full h-[250px] relative">
                        <canvas id="${chartId}" style="width:100%; height:100%;"></canvas>
                    </div>
                    
                    ${ngChartId ? `
                    <div class="mt-4 pt-4 border-t border-gray-200">
                        <p class="text-xs font-bold text-gray-700 mb-2">📉 แนวโน้มอาการของเสีย (NG Trend Breakdown)</p>
                        <div class="w-full h-[180px] relative">
                            <canvas id="${ngChartId}" style="width:100%; height:100%;"></canvas>
                        </div>
                    </div>
                    ` : ''}

                    ${maintTableHtml}
                </div>
            `;
        } else {
            // 🌟 กรณีไม่มียอดผลิต (เช็คประวัติแจ้งซ่อม) 🌟
            
            let pastPendingHtml = '';
            // ถ้าวันนี้ไม่มี log ซ่อม แต่ดันมี log ค้างเก่าที่ระบบไปขุดมาจากอดีต 60 วัน (อาจมีหลายจ๊อบ)
            if (logs.length === 0 && pendingJobsMap[m] && pendingJobsMap[m].length > 0) {
                // เรียงลำดับตามวันที่และเวลา (เก่าไปใหม่)
                pendingJobsMap[m].sort((a, b) => {
                    let dA = new Date(a.date).getTime();
                    let dB = new Date(b.date).getTime();
                    if (dA === dB) {
                        return (a.startTime || "").localeCompare(b.startTime || "");
                    }
                    return dA - dB;
                });
                
                pastPendingHtml = `
                <div class="mt-4">
                    <h5 class="text-xs font-bold text-red-700 mb-1 flex items-center gap-1">⚠️ <span class="bg-red-100 px-2 py-0.5 rounded">พบงานแจ้งซ่อมค้าง ${pendingJobsMap[m].length} รายการ</span></h5>
                    <div class="border border-red-200 rounded overflow-hidden">
                        <table class="w-full text-[10px] text-left bg-white">
                            <thead class="bg-red-50 text-red-800 border-b border-red-100">
                                <tr>
                                    <th class="px-2 py-1.5 w-20">วันที่แจ้ง</th>
                                    <th class="px-2 py-1.5 w-32">เวลาเริ่ม-เสร็จ</th>
                                    <th class="px-2 py-1.5 w-28">ประเภทปัญหา</th>
                                    <th class="px-2 py-1.5">รายละเอียด/การแก้ไขเบื้องต้น</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100">
                                ${pendingJobsMap[m].map(pLog => {
                                    let s = formatTimeStr(pLog.startTime);
                                    let endDateStr = pLog.endDate ? formatDateShort(pLog.endDate) + ' ' : '';
                                    let e = pLog.endTime ? endDateStr + formatTimeStr(pLog.endTime) : '<span class="text-red-500 font-bold">ยังไม่ปิดจ๊อบ</span>';
                                    let remarkTrans = getTranslatedRemark(pLog.remark);
                                    return `<tr>
                                        <td class="px-2 py-2 text-gray-700 align-top whitespace-nowrap">${pLog.date}</td>
                                        <td class="px-2 py-2 font-medium align-top whitespace-nowrap">${s} - <span class="text-red-500 font-bold">ยังไม่ปิดจ๊อบ</span></td>
                                        <td class="px-2 py-2 text-blue-700 align-top whitespace-nowrap">${pLog.issueType}</td>
                                        <td class="px-2 py-2 align-top">
                                            <div class="space-y-0.5">
                                                <p class="text-[10px] text-gray-800"><span class="font-bold text-blue-600 mr-1">[TH]</span>${remarkTrans.th}</p>
                                                <p class="text-[9px] text-gray-600"><span class="font-bold text-red-600 mr-1">[EN]</span>${remarkTrans.en}</p>
                                                <p class="text-[9px] text-gray-500"><span class="font-bold text-gray-700 mr-1">[CH]</span>${remarkTrans.ch}</p>
                                            </div>
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`;
            }

            if (logs.length > 0) {
                // กรณีมีแจ้งซ่อมในวันนี้
                cardHtml = `
                <div class="border border-gray-200 p-5 rounded-xl bg-white shadow-sm">
                    <div class="flex justify-between items-center mb-3 border-b border-gray-100 pb-2">
                        <h4 class="font-bold text-gray-500 text-base flex items-center gap-2">🏭 เครื่องจักร: ${m}</h4>
                        <span class="text-xs font-bold bg-orange-100 text-orange-700 px-3 py-1.5 rounded-full border border-orange-200 shadow-sm">
                            ไม่มีผลผลิต (ติดปัญหาแจ้งซ่อมวันนี้)
                        </span>
                    </div>
                    ${maintTableHtml}
                </div>`;
            } else if (pastPendingHtml !== '') {
                // กรณีไม่มีแจ้งซ่อมวันนี้ แต่ไปเจอของเก่าค้างอยู่
                cardHtml = `
                <div class="border border-red-200 p-5 rounded-xl bg-red-50/30 shadow-sm">
                    <div class="flex justify-between items-center mb-3 border-b border-red-100 pb-2">
                        <h4 class="font-bold text-red-700 text-base flex items-center gap-2">🏭 เครื่องจักร: ${m}</h4>
                        <span class="text-xs font-bold bg-red-100 text-red-700 px-3 py-1.5 rounded-full border border-red-200 shadow-sm animate-pulse">
                            ไม่มีผลผลิต (เครื่องเสียค้างจากวันก่อนหน้า)
                        </span>
                    </div>
                    ${pastPendingHtml}
                </div>`;
            } else {
                // กรณีไม่มีอะไรเลยจริงๆ (Idle)
                cardHtml = `
                <div class="border border-gray-200 p-4 rounded-xl bg-gray-50 shadow-sm opacity-70 flex items-center justify-between">
                    <h4 class="font-bold text-gray-500 text-base flex items-center gap-2">🏭 เครื่องจักร: ${m}</h4>
                    <span class="text-xs font-bold bg-gray-200 text-gray-600 px-3 py-1.5 rounded-full border border-gray-300">
                        💤 เครื่องจักรหยุดรอ (Idle) / ไม่มีการเดินเครื่องและไม่มีประวัติแจ้งปัญหาค้าง
                    </span>
                </div>`;
            }
        }

        let headerHtml = (i === 1) ? `<h3 class="text-lg font-bold text-gray-800 border-l-4 border-purple-600 pl-3 mb-4 bg-white shadow-sm py-2.5 rounded-r-lg">4. การวิเคราะห์สถานะและแนวโน้มเชิงสถิติ แยกตามเครื่องจักร (CWM-01 ถึง 16)</h3>` : '';

        machineAnalysisHtml += `
            <div class="page-break-inside-avoid mb-6">
                ${headerHtml}
                ${cardHtml}
            </div>
        `;
    }
    machineAnalysisHtml += `</div>`;

    // 🌟 ประกอบร่าง HTML สำหรับรายงาน พร้อมเพิ่มโลโก้บริษัทด้านบนสุด 🌟
    let html = `
        <div class="md:hidden bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-bold text-center py-2 px-4 rounded-lg mb-4 shadow-sm print-hide flex items-center justify-center gap-2">
            <span>↔️</span> เลื่อนซ้าย-ขวา เพื่อดูรายงานขนาด A4 แบบเต็ม
        </div>

        <div class="print-page mb-8">
            <div class="border-b-2 border-gray-300 pb-4 mb-6">
                <div class="flex justify-between items-start gap-4">
                    <div class="flex-1">
                        <h1 class="text-3xl font-black text-gray-900 uppercase tracking-tight">Production Analytics Report</h1>
                        <p class="text-gray-600 mt-1 font-medium">รายงานวิเคราะห์ผลการผลิตและดัชนีชี้วัดคุณภาพเชิงลึก (Target Limit: NG ≤ 0.5%)</p>
                    </div>
                    <div class="flex flex-col items-end shrink-0">
                        <img src="Logo JR.jpg" alt="Company Logo" class="h-16 md:h-20 w-auto object-contain print:h-16 mb-2" onerror="this.style.display='none'">
                        <p class="text-xs text-gray-500"><b>Printed:</b> ${printTime}</p>
                    </div>
                </div>
                <div class="mt-4 flex gap-6 text-sm bg-white shadow-sm p-3 rounded-lg border border-gray-200">
                    <span class="font-bold text-gray-700">ขอบเขตข้อมูล: <span class="font-normal text-blue-700">${dateStr}</span></span>
                    <span class="font-bold text-gray-700">กะการทำงาน: <span class="font-normal text-blue-700">${shiftName} (${shiftType})</span></span>
                </div>
                ${isStaleFilter ? `<div class="mt-2 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                    ⚠️ ตัวกรองบนหน้าจอ (${sDate} ถึง ${eDate}) ไม่ตรงกับข้อมูลที่โหลดไว้ด้านบน — รายงานนี้ใช้ข้อมูลชุดที่โหลดล่าสุด กรุณากด 🔍 ค้นหา ใหม่ก่อนออกรายงาน
                </div>` : ''}
            </div>

            <div class="mb-8">
                <h3 class="text-lg font-bold text-gray-800 border-l-4 border-blue-600 pl-3 mb-4 bg-white shadow-sm py-2.5 rounded-r-lg">1. ดัชนีชี้วัดผลการดำเนินงานหลัก (Key Performance Indicators)</h3>
                <div class="grid grid-cols-3 gap-6 text-center">
                    <div class="border border-gray-300 rounded p-4 bg-white shadow-sm">
                        <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Total Good (FG)</p>
                        <p class="text-2xl font-black text-blue-600 mt-1">${totalFG.toLocaleString()} <span class="text-sm font-normal">ชิ้น</span></p>
                        <p class="text-xs text-gray-400 mt-0.5">(${window.formatKg ? window.formatKg(totalFGKg) : totalFGKg.toFixed(2)} Kg)</p>
                    </div>
                    <div class="border ${isPassTarget ? 'border-gray-300 bg-white' : 'border-red-300 bg-red-50'} rounded p-4 shadow-sm relative overflow-hidden">
                        ${!isPassTarget ? `<div class="absolute top-0 right-0 bg-red-600 text-white text-[9px] px-2 py-0.5 rounded-bl-lg font-bold">OVER 0.5%</div>` : ''}
                        <p class="text-[10px] ${isPassTarget ? 'text-gray-500' : 'text-red-600'} font-bold uppercase tracking-wider">Total Defect (NG)</p>
                        <p class="text-2xl font-black ${isPassTarget ? 'text-gray-800' : 'text-red-600'} mt-1">${totalNG.toLocaleString()} <span class="text-sm font-normal">ชิ้น</span></p>
                    </div>
                    <div class="border ${isPassTarget ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-white'} rounded p-4 shadow-sm relative overflow-hidden">
                        ${isPassTarget ? `<div class="absolute top-0 right-0 bg-green-600 text-white text-[9px] px-2 py-0.5 rounded-bl-lg font-bold">TARGET PASSED</div>` : ''}
                        <p class="text-[10px] ${isPassTarget ? 'text-green-700' : 'text-gray-500'} font-bold uppercase tracking-wider">Overall Yield</p>
                        <p class="text-2xl font-black ${isPassTarget ? 'text-green-700' : 'text-gray-800'} mt-1">${yieldPct}%</p>
                    </div>
                </div>
                ${productBreakdownHtml}
                ${sortingBreakdownHtml}
                ${jobOrderHtml}
            </div>

            <!-- เพิ่มคลาส page-break-inside-avoid ครอบไว้เพื่อไม่ให้หัวข้อขาดจากกราฟ -->
            <div class="mb-8 page-break-inside-avoid">
                <h3 class="text-lg font-bold text-gray-800 border-l-4 border-indigo-500 pl-3 mb-4 bg-white shadow-sm py-2.5 rounded-r-lg">2. การประเมินเสถียรภาพและแนวโน้มการผลิต (Production Stability Assessment)</h3>
                <div class="grid grid-cols-1 gap-6">
                    <div class="border border-gray-200 p-5 rounded-xl bg-white shadow-sm flex flex-col">
                        <p class="text-base font-bold text-gray-800 mb-2">${sec2_1_title}</p>
                        ${sec2_1_desc}
                        <div class="mt-auto w-full bg-gray-50 rounded-lg p-2 border border-gray-100">
                            ${sec2_1_img ? `<img src="${sec2_1_img}" class="w-full h-[280px] object-contain mx-auto" />` : `<p class="text-center text-sm text-gray-400">ไม่มีข้อมูลกราฟแสดงผล</p>`}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="print-page mb-8 page-break-before">
            <div class="mb-8 page-break-inside-avoid">
                <h3 class="text-lg font-bold text-gray-800 border-l-4 border-red-500 pl-3 mb-4 bg-white shadow-sm py-2.5 rounded-r-lg">3. การวิเคราะห์สาเหตุความสูญเสียเชิงลึก (Defect Root Cause Diagnostics)</h3>
                
                <div class="bg-red-50 border border-red-200 p-5 rounded-lg mb-6 shadow-sm">
                    <p class="text-sm font-bold text-red-800 mb-3 flex items-center gap-2"><span>💡</span> สรุปสถานการณ์ความผิดปกติหลัก (Top Quality Violations):</p>
                    ${topNgHtml}
                </div>

                <div class="grid grid-cols-1 gap-6 mb-6">
                    <div class="border border-gray-200 p-5 rounded-xl bg-white shadow-sm flex flex-col page-break-inside-avoid">
                        <p class="text-base font-bold text-gray-800 mb-2">📉 การจัดลำดับความสำคัญของปัญหา (Pareto Logic)</p>
                        ${paretoDesc}
                        <div class="mt-auto w-full bg-gray-50 rounded-lg p-4 border border-gray-100 h-[300px] relative">
                            <canvas id="auto-report-pareto-chart" style="width:100%; height:100%;"></canvas>
                        </div>
                    </div>
                    
                    ${sec3_2_html}
                    
                    <div class="border border-gray-200 p-5 rounded-xl bg-white shadow-sm page-break-inside-avoid">
                        <p class="text-base font-bold text-gray-800 mb-2">🏭 การชี้เป้าแหล่งกำเนิดปัญหาขัดข้อง (Defect Source Mapping)</p>
                        ${sec3_3_desc}
                        <div class="mt-auto w-full bg-gray-50 rounded-lg p-4 border border-gray-100 h-[250px] relative">
                            <canvas id="auto-report-machine-ng-chart" style="width:100%; height:100%;"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        ${machineAnalysisHtml}

        <div class="print-page bg-white shadow-sm border border-gray-200 rounded-xl p-8 mt-6 page-break-inside-avoid">
            <div class="pt-4 grid grid-cols-3 gap-8 text-center">
                <div>
                    <div class="h-16 border-b border-gray-400 mb-3 w-4/5 mx-auto"></div>
                    <p class="text-sm font-bold text-gray-800">Reported By</p>
                    <p class="text-xs text-gray-500 mt-1">(Production Leader)</p>
                </div>
                <div>
                    <div class="h-16 border-b border-gray-400 mb-3 w-4/5 mx-auto"></div>
                    <p class="text-sm font-bold text-gray-800">Checked By</p>
                    <p class="text-xs text-gray-500 mt-1">(QA/QC Manager)</p>
                </div>
                <div>
                    <div class="h-16 border-b border-gray-400 mb-3 w-4/5 mx-auto"></div>
                    <p class="text-sm font-bold text-gray-800">Approved By</p>
                    <p class="text-xs text-gray-500 mt-1">(Plant Manager)</p>
                </div>
            </div>
            
            <div class="text-center text-[10px] text-gray-400 mt-12 pt-4 border-t border-gray-200 uppercase tracking-widest">
                Auto Generated & Analyzed by AI System Engine - ${printTime}
            </div>
        </div>
    `;

    // อัปเดตคุณสมบัติของหน้าจอ Modal เพื่อให้รองรับการ Scroll แบบแนวนอน (overflow-auto จะรับทั้งแกน X และ Y)
    document.getElementById('modal-auto-report').className = 'fixed inset-0 bg-gray-200 z-50 flex flex-col overflow-auto pb-10 transition-opacity duration-300';
    
    // ตั้งค่า Content ให้เป็นก้อน 800px คงที่ (ขนาด A4) ป้องกันการถูกบีบโดยหน้าจอมือถือ
    content.className = 'w-[800px] max-w-[800px] lg:w-[210mm] lg:max-w-[210mm] mx-auto mt-6 flex-none print:w-full print:max-w-none'; 
    content.innerHTML = html;
    
    setTimeout(() => {
        if (window.autoReportCharts) window.autoReportCharts.forEach(c => c.destroy());
        window.autoReportCharts = [];

        if (autoReportParetoConfig) {
            const ctxPareto = document.getElementById('auto-report-pareto-chart');
            if (ctxPareto) {
                window.autoReportCharts.push(new Chart(ctxPareto, {
                    data: autoReportParetoConfig,
                    options: {
                        animation: false, responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: true, position: 'top' }, datalabels: { display: false } },
                        scales: {
                            y: { type: 'linear', position: 'left', beginAtZero: true, title: { display: true, text: 'NG (ชิ้น)' } },
                            y1: { type: 'linear', position: 'right', beginAtZero: true, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: 'Cumulative (%)' } }
                        }
                    }
                }));
            }
        }

        if (autoReportNgTrendConfig && !isSingleDay) {
            const ctxNgTrend = document.getElementById('auto-report-ng-trend-chart');
            if (ctxNgTrend) {
                window.autoReportCharts.push(new Chart(ctxNgTrend, {
                    type: 'line', data: autoReportNgTrendConfig,
                    options: {
                        animation: false, responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: true, position: 'top' }, datalabels: { display: false } },
                        scales: { y: { type: 'logarithmic', min: 0.1, max: 100, title: { display: true, text: '% (Yield %)' }, ticks: { callback: v => v + '%', autoSkip: true, maxTicksLimit: 10 } } }
                    }
                }));
            }
        }

        if (autoReportMachineNgConfig) {
            const ctxMachineNg = document.getElementById('auto-report-machine-ng-chart');
            if (ctxMachineNg) {
                const maxNgValue = Math.max(...macNgList.map(m => m.ng));
                window.autoReportCharts.push(new Chart(ctxMachineNg, {
                    type: 'bar', data: autoReportMachineNgConfig,
                    options: {
                        animation: false, responsive: true, maintainAspectRatio: false,
                        layout: { padding: { top: 30 } },
                        plugins: { 
                            legend: { display: false }, 
                            datalabels: { 
                                display: false,
                                anchor: 'end', 
                                align: 'top', 
                                offset: 4,
                                font: { weight: 'bold', size: 11 },
                                formatter: function(value) { return value.toLocaleString() + ' ชิ้น'; } 
                            } 
                        },
                        scales: { 
                            y: { beginAtZero: true, suggestedMax: maxNgValue * 1.2, title: { display: true, text: 'NG (ชิ้น)' } },
                            x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 } }
                        }
                    }
                }));
            }
        }

        machineChartConfigs.forEach(cfg => {
            const ctx = document.getElementById(cfg.id);
            if (ctx) {
                window.autoReportCharts.push(new Chart(ctx, {
                    data: {
                        labels: cfg.labels,
                        datasets: [
                            { type: 'bar', label: 'FG', data: cfg.fgData, backgroundColor: 'rgba(59, 130, 246, 0.7)', yAxisID: 'y' },
                            { type: 'bar', label: 'NG', data: cfg.ngData, backgroundColor: 'rgba(239, 68, 68, 0.8)', yAxisID: 'y' },
                            { type: 'line', label: 'NG Rate (%)', data: cfg.rateData, borderColor: 'rgba(168, 85, 247, 1)', backgroundColor: 'rgba(168, 85, 247, 1)', borderWidth: 2, tension: 0.3, yAxisID: 'y1' },
                            { type: 'line', label: 'Target Limit (0.5%)', data: cfg.targetData, borderColor: 'rgba(239, 68, 68, 1)', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false, tension: 0, yAxisID: 'y1' }
                        ]
                    },
                    options: {
                        animation: false, responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: true, position: 'top' }, datalabels: { display: false } },
                        scales: {
                            y: { type: 'linear', position: 'left', beginAtZero: true },
                            y1: { type: 'linear', position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } }
                        }
                    }
                }));
            }
        });

        // 🌟 เรนเดอร์กราฟ NG Trend / Breakdown สำหรับแต่ละเครื่องจักร 🌟
        machineNgChartConfigs.forEach(cfg => {
            const ctx = document.getElementById(cfg.id);
            if (ctx) {
                window.autoReportCharts.push(new Chart(ctx, {
                    type: cfg.isTrend ? 'line' : 'bar', 
                    data: {
                        labels: cfg.labels,
                        datasets: cfg.datasets
                    },
                    options: {
                        animation: false,
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: cfg.isTrend, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } },
                            datalabels: {
                                display: !cfg.isTrend, // ปิดตัวเลขแบบจุดสำหรับกราฟเส้น, เปิดสำหรับกราฟแท่ง (Fallback)
                                anchor: 'end',
                                align: 'top',
                                font: { size: 9 },
                                formatter: (val) => val > 0 ? val.toLocaleString() + ' ชิ้น' : ''
                            }
                        },
                        scales: {
                            x: { ticks: { font: { size: 9 } } },
                            y: { beginAtZero: true, grace: '10%', ticks: { stepSize: 1, font: { size: 9 } } }
                        }
                    }
                }));
            }
        });

    }, 100); 
};

window.closeAutoReport = function() {
    const modal = document.getElementById('modal-auto-report');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }, 300);
};
