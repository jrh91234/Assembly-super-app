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
