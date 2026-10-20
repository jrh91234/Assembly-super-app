# Assembly Super App

รวมทุกระบบงานของโรงงานไว้ในหน้าเดียว — เปิดจากเมนูด้านซ้ายหรือการ์ดบนหน้าหลัก
แต่ละแอปทำงานใน iframe ของตัวเอง และคงสถานะไว้เมื่อสลับไปแอปอื่น

| แอป | Repo ต้นทาง | โฟลเดอร์ |
|-----|-------------|----------|
| 🌀 Coil Winding (CWM) | [Coil-winding](https://github.com/jrh91234/Coil-winding) | `apps/coil-winding` |
| 📈 Coil Cp/Cpk | [coil-CP-CPK](https://github.com/jrh91234/coil-CP-CPK) | `apps/coil-cp-cpk` |
| 📋 Job Order Tracking | [Job-order-tracking](https://github.com/jrh91234/Job-order-tracking) | `apps/job-order-tracking` |
| 🔩 Lug & Screw | [Lug-Screw-management-system](https://github.com/jrh91234/Lug-Screw-management-system) (`docs/`) | `apps/lug-screw` |
| 🏭 WHSYS | [WHSYS](https://github.com/jrh91234/WHSYS) | `apps/whsys` |
| 💰 P&L Business Plan | [department-pl-business-plan](https://github.com/jrh91234/department-pl-business-plan) (`site/`) | `apps/pl-business-plan` |
| 👥 Organize (HR) | [-Organize](https://github.com/jrh91234/-Organize) | `apps/organize` |

## โครงสร้าง

```
index.html            หน้า Portal (shell)
portal/               CSS / JS / ไอคอนของ Portal
apps.config.json      รายการแอป: ชื่อ ไอคอน repo branch และไฟล์ที่คัดลอก
apps/<id>/            สำเนาหน้าเว็บของแต่ละแอป (สร้างโดยสคริปต์ ห้ามแก้ตรงนี้)
scripts/sync-apps.py  ดึงหน้าเว็บล่าสุดจาก repo ต้นทาง
```

- **Backend ไม่ได้ย้ายมา** — แต่ละแอปยังเรียก Google Apps Script / Google Sheets ของตัวเองเหมือนเดิม
  (ไม่คัดลอก `scr/`, `src/*.gs`) จึงไม่ต้อง deploy Apps Script ใหม่
- **แก้โค้ดแอปที่ repo ต้นทางเสมอ** ไฟล์ใน `apps/` จะถูกเขียนทับทุกครั้งที่ sync
  ไฟล์ `apps/<id>/.source.json` บอก commit ที่คัดลอกมา

## Sync

```bash
python3 scripts/sync-apps.py                  # ดึงทุกแอปจาก GitHub
python3 scripts/sync-apps.py whsys organize   # เฉพาะบางแอป
python3 scripts/sync-apps.py --local ..       # ใช้ repo ที่ clone ไว้ข้าง ๆ
```

GitHub Actions (`.github/workflows/pages.yml`) sync อัตโนมัติทุก 6 ชั่วโมง (หรือกด *Run workflow*)
commit การเปลี่ยนแปลงใน `apps/` แล้ว deploy ขึ้น GitHub Pages
ถ้า repo ต้นทางเปลี่ยนเป็น private ให้เพิ่ม secret `SYNC_TOKEN` (PAT ที่อ่าน repo ได้)

## เพิ่มแอปใหม่

เพิ่ม object ใน `apps.config.json` (`id`, `name`, `nameTh`, `description`, `icon`, `color`,
`repo`, `branch`, `entry`, `include`, และ `source` ถ้าหน้าเว็บอยู่ในโฟลเดอร์ย่อย,
`links` สำหรับหน้าย่อยที่ให้เลือกจากแถบบน) แล้วรัน `python3 scripts/sync-apps.py <id>`

## เปิดใช้งาน GitHub Pages

Settings → Pages → Source: **GitHub Actions** แล้ว URL จะเป็น
`https://jrh91234.github.io/Assembly-super-app/`

ทุกแอปอยู่ origin เดียวกับ GitHub Pages เดิม (`jrh91234.github.io`) จึงใช้ localStorage
และ OAuth origin (P&L) ร่วมกับเวอร์ชันเดิมได้ทันที

## ระบบผู้ใช้กลาง (SSO) และ Admin panel

ผู้ใช้ login ครั้งเดียวที่ Portal แล้วแต่ละแอปจะเข้าสู่ระบบให้อัตโนมัติตามสิทธิ์ (role) ที่ Admin กำหนดรายแอป

```
scr/auth.gs           Apps Script กลาง: ชีต Users, login, verify token, จัดการผู้ใช้
portal/sso.js         เก็บ session ไว้ที่ localStorage["SUPERAPP_SSO"] (ใช้ร่วมกันทุกแอปบน jrh91234.github.io)
#/admin               หน้า Admin panel (เห็นเฉพาะผู้ที่มีสิทธิ์ Portal = admin)
```

### ติดตั้งครั้งแรก

1. สร้าง Google Sheet ใหม่ (เช่น `Super App Users`) → Extensions → Apps Script
   วางโค้ดจาก `scr/auth.gs` และ `scr/appsscript.json`
2. Deploy → New deployment → Web app — Execute as: **Me**, Who has access: **Anyone**
3. คัดลอก URL `/exec` มาใส่ใน `apps.config.json` ช่อง `"authUrl"` แล้ว commit
4. เปิด Portal แล้ว login ด้วย `admin` / `admin` (ใช้ได้เฉพาะตอนที่ยังไม่มีผู้ดูแลระบบ) ระบบจะบังคับให้เปลี่ยนรหัสผ่านทันที
5. ไปที่ **จัดการผู้ใช้** เพื่อเพิ่มผู้ใช้และเลือก role ของแต่ละแอป

ถ้า `authUrl` ว่าง Portal จะทำงานแบบเดิม (ไม่มี login กลาง)

### การเชื่อมแต่ละแอป

| แอป | วิธีรับ SSO | ต้อง deploy Apps Script ของแอปใหม่ไหม |
|-----|-------------|------------------|
| Coil Winding, WHSYS, Job Order Tracking | หน้าเว็บถาม `verify` จาก auth กลางโดยตรง | ไม่ต้อง |
| Lug & Screw, Organize (HR) | backend ของแอปตรวจ token กับ auth กลาง แล้วออก session ของตัวเอง (สร้าง/อัปเดตผู้ใช้ในชีต Users ของแอปให้อัตโนมัติ) | ต้อง deploy ใหม่ และตั้ง Script Property `SUPERAPP_AUTH_URL` = URL ของ auth กลาง |
| Coil Cp/Cpk, P&L | ไม่มี login ของตัวเอง / ใช้บัญชี Google — Portal ซ่อนแอปจากผู้ที่ไม่มีสิทธิ์ | ไม่ต้อง |

- Lug & Screw และ Organize: หลัง deploy โค้ดใหม่ เจ้าของสคริปต์ต้องรันฟังก์ชัน `authorizeSuperAppSso` ใน Apps Script editor หนึ่งครั้ง
  เพื่ออนุญาต `UrlFetchApp` ไม่เช่นนั้น web app ของแอปนั้นจะตอบ error เรื่องสิทธิ์
- Lug & Screw ใช้ Username ของ Super App (ตัวพิมพ์ใหญ่) เป็นรหัสพนักงาน — ตั้ง Username ให้ตรงกับรหัสพนักงานเดิมเพื่อผูกกับข้อมูลเดิม
- login แบบเดิมของแต่ละแอปยังใช้ได้ตามปกติ
- ออกจากระบบที่ Portal จะล้าง session ของทุกแอปด้วย
