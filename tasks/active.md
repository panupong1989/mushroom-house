# Active Workstream — โรงเห็ดฟาง house-01

> ⚠️ **หมายเหตุเรื่องกรอบเอกสาร:** เอกสารนี้ถูกขอในรูปแบบ "debugging checkpoint" แต่สถานะจริง
> ของงาน ณ ตอนนี้ **ไม่มีบั๊กที่แก้ไม่ได้ค้างอยู่** · บั๊กทุกตัวที่เจอใน session นี้วินิจฉัยจบและ
> push แล้ว · working tree สะอาด ไม่มีโค้ดทดลองค้าง
> สิ่งที่ค้างจริงคือ **(ก) การตัดสินใจดีไซน์ 1 เรื่องที่กำลังจะลงมือ** และ **(ข) งานที่ต้องรอ Beer
> ไปหน้างาน** — หัวข้อด้านล่างจึงเขียนตามความจริง ไม่ได้ประดิษฐ์ "ปัญหาที่ยังแก้ไม่ตก" ขึ้นมา

---

## Problem

**ไม่มีบั๊กค้าง** · งานที่กำลังทำค้างอยู่คือฟีเจอร์:

> "สูงกว่าก็เตือน ต่ำกว่าก็เตือน" — Beer อยากให้แจ้งเตือน**ทั้งฝั่งสูงและฝั่งต่ำ**ถึงมือ (LINE)
> ไม่ใช่แค่ฝั่งสูง

ตอนนี้ `notify-line` กรองด้วย env secret `LINE_MIN_SEVERITY=critical` → มีแค่ 3/7 ชนิดที่เข้า LINE
(HOT, BED_OVERHEAT, LOW_WATER) ส่วนฝั่ง "ต่ำ" (COLD, BED_LOW) และความชื้น (RH_HIGH, RH_LOW)
เป็น `warn` จึงไม่เข้า

**หนี้ที่เพิ่งสร้างเอง (commit `8e3c297`):** ป้ายในหน้าตั้งค่าโชว์ "🔴 วิกฤต · เข้า LINE" /
"🟠 เตือน · ไม่เข้า LINE" ซึ่ง**เดาเอาจาก severity** — frontend อ่าน Edge Function secret ไม่ได้
ถ้า Beer เปลี่ยน `LINE_MIN_SEVERITY` เป็น `warn` เมื่อไหร่ **ป้ายจะโกหกทันที**

## Expected Behavior

- ชนิดแจ้งเตือนที่เปิดไว้ ควรเลือกได้เองว่า "ส่งเข้า LINE ไหม" ทั้งฝั่งสูงและฝั่งต่ำ
- หน้าเว็บต้องแสดง**ความจริง**ว่าตัวไหนเข้า LINE ไม่ใช่เดาจาก severity

## Actual Behavior

- ปลายทาง LINE ถูกกำหนดโดย secret ที่ frontend มองไม่เห็น
- ป้ายในหน้าเว็บ hardcode ความสัมพันธ์ severity ↔ LINE ไว้

## Reproduction

1. เปิด dashboard → แท็บ **ตั้งค่า** → การ์ด "ตั้งค่าการแจ้งเตือน"
2. กด 🧪 ทดสอบ ที่ **กองต่ำเกิน** (warn) → ขึ้นในแท็บแจ้งเตือน แต่ LINE ไม่เด้ง
3. กด 🧪 ทดสอบ ที่ **ระดับน้ำต่ำ** (critical) → เด้ง LINE ปกติ
4. (พิสูจน์หนี้) ถ้ารัน `supabase secrets set LINE_MIN_SEVERITY="warn"` → ข้อ 2 จะเด้ง LINE
   แต่ป้ายในหน้าเว็บยังเขียน "ไม่เข้า LINE" อยู่

---

## Confirmed Facts

หลักฐานตรวจแล้วจริงใน session นี้ (ไม่ใช่การอนุมาน):

| ข้อเท็จจริง | หลักฐาน |
|---|---|
| ปุ่มทดสอบยิงสำเร็จ **ครบทั้ง 7 ชนิด** | query `alerts` เจอ id 70–84 ครบทุก code |
| เส้นทาง LINE ใช้งานได้จริง end-to-end | Beer ได้รับข้อความใน LINE OA `mushroom house` |
| ตัวบล็อก LINE ก่อนหน้านี้คือ `WEBHOOK_SECRET` | probe function ตรงได้ `401 unauthorized` (plain text = โค้ดเราเอง ไม่ใช่ gateway) — แก้แล้ว |
| แจ้งเตือนเป็น **edge-triggered** ไม่สแปม | `alert_active[]` ใน `main.cpp` ยิงตอนข้ามเกณฑ์ครั้งเดียว รีเซ็ตเมื่อกลับสู่ปกติ |
| **บอร์ดยังรันเฟิร์มแวร์เก่า** | `houses.last_rssi` = null แต่ `last_mode_ts` สด (บอร์ด PATCH อยู่ทุก 20 วิ) |
| โปรเจกต์**ไม่มี OTA** | ไม่พบ `ArduinoOTA` / `espota` ใน `platformio.ini` และ `src/` |
| partition รองรับ OTA อยู่แล้ว | build ใช้ 1018 KB จาก 1310720 B = app0 ของผัง dual-OTA (app0/app1 อย่างละ 1280 KB) |
| `temp_fruit_min/max` เป็นค่า**แสดงผลล้วน** | grep `temp_fruit` ใน `firmware/` = ไม่พบเลย |
| Migration **006–014 รันครบแล้ว** | ยืนยันด้วย query: `alert_config` มี COLD/BED_LOW (012), `houses.last_rssi` มีคอลัมน์ (013), `send_test_alert` เรียกได้ (014) |
| PR #53, #54 **merge เข้า main แล้ว** | `gh pr list --state open` = `[]` · โค้ด RSSI อยู่ใน `supabase.cpp` บน main |

## Current Hypotheses

ไม่มีสมมติฐานเรื่องบั๊กค้าง · มีแต่**ทางเลือกดีไซน์** 2 ทาง:

- **ทาง A (เร็ว, 1 คำสั่ง):** `supabase secrets set LINE_MIN_SEVERITY="warn"` → ทั้ง 7 เข้า LINE
  ❌ ป้ายในหน้าเว็บจะผิดทันที และยังเลือกรายตัวไม่ได้
- **ทาง B (ถูกต้องกว่า):** ย้ายการตัดสินใจ "เข้า LINE ไหม" ลง DB เป็นคอลัมน์ต่อ code
  ✅ หน้าเว็บแสดงความจริง + เลือกรายตัวได้ + ตรงกับที่ Beer ย้ำเรื่องความยืดหยุ่น

➡️ **Beer เลือกทาง B (9 ส.ค.)** — ทำเสร็จแล้ว `94da60a` + `dcb88f0` · ย้ำเงื่อนไข: "สูงเกินก็แจ้ง
ต่ำเกินก็แจ้ง" → `notify_line` default = **true ทุกชนิด** (ทั้ง COLD/BED_LOW/RH_LOW เข้า LINE ทันที
ที่รัน migration) ใครไม่อยากได้ตัวไหนค่อยปิดเองจากหน้าเว็บ

## Disproven Hypotheses

| สมมติฐาน | ทำไมตกไป |
|---|---|
| "ปุ่มทดสอบบางตัวเสีย/ยิงไม่ได้" | ผิด — ทั้ง 7 ตัว insert เข้า DB สำเร็จหมด (id 70–84) |
| "โพรบ DS18B20 3 ตัวหลุดจากสาย 1-Wire" | ผิด — Beer ยืนยันว่า **ถอดออกเอง ใช้จริงแค่ 4 ตัว** ไม่ใช่ของเสีย |
| "เปิด warn เข้า LINE แล้วจะสแปม" | ผิด (ผมเตือนเกินไป) — edge-triggered ยิงครั้งเดียวต่อการข้ามเกณฑ์ |
| "merge PR แล้วบอร์ดจะได้โค้ดใหม่" | ผิด — ไม่มี OTA ต้อง flash ผ่าน USB เท่านั้น |
| "dashboard โชว์ mock ทั้งที่ต่อ Supabase อยู่" | ผิด — เกิดจากรัน `next dev` 2 ตัวในโฟลเดอร์เดียวกัน แชร์ `.next` ทับกัน |

---

## Changes Already Attempted

ทุกอย่างด้านล่าง **commit + push ขึ้น main แล้ว** และผ่าน build/test — ไม่ใช่การทดลองค้าง

### Attempt 1 — dashboard ขึ้น "ออฟไลน์" ทั้งที่บอร์ดออนไลน์ (`6baf0ae`)
**What changed:** แยก `init()` เป็น `loadMeta()` + `loadLatest()` + `refresh()` · poll สำรองทุก 30 วิ ·
ดึงใหม่ตอน `visibilitychange` และตอน realtime `SUBSCRIBED` รอบถัดๆ ไป · `bed_scan` poll ทุก 5 วิ
**Why:** `subscribeSupabaseLatest` พึ่ง `postgres_changes` อย่างเดียว WebSocket หลุดเงียบแล้วค่าค้าง
**Result:** ✅ แก้ได้ ยืนยันกับ DB จริง
**Keep**

### Attempt 2 — จับคู่เซนเซอร์ RS485 โดยไม่ต้อง flash (`1eafe50`, migration 011)
**What changed:** แยก `sensors.location` (คีย์ routing ของเฟิร์มแวร์ ห้ามแก้) ออกจาก
`sensors.ui_position` (ตำแหน่งที่โชว์ แก้ได้) + RPC `set_air_display` + การ์ดใหม่
**Why:** เฟิร์มแวร์จับ modbus addr → sensor_id ด้วย `location` ถ้าแก้ตรงๆ ค่าจะเข้าผิดตัวเงียบๆ
**Result:** ✅ ปรับได้จากหน้าเว็บโดยไม่แตะบอร์ด
**Keep**

### Attempt 3 — กราฟไม่รีเฟรช + เส้นผี (`9746f91`)
**What changed:** poll `useSensorHistory` ทุก 30 วิ · กรอง sensor ที่ไม่ได้ใช้ออกที่ `useSensorMeta` ·
ติ๊กเลือกเส้นได้ · จับคู่ temp/rh ใน legend
**Result:** ✅ ยืนยัน poll ยิงจริงที่ t=8s แล้ว t=38s
**Keep**

### Attempt 4 — alert ที่ปิดไว้ยังเด้ง (PR #53 → `235d78a`)
**What changed:** `notify_check()` ออกก่อนถ้ายังโหลด `alert_config` ไม่สำเร็จ
(`supabase_alert_config_loaded()`) + เพิ่ม code `COLD`/`BED_LOW`
**Why:** `supabase_alert_enabled()` คืน true เมื่อแคชว่าง (fail-safe) → ตอนบูตยิง code ที่ปิดไว้
**Result:** ⚠️ `pio run` ผ่าน · **ยังไม่ได้ยืนยันบนบอร์ดจริง (ยังไม่ flash)**
**Keep**

### Attempt 5 — RSSI (PR #54 → `e4fbe1d`, migration 013)
**What changed:** แนบ `last_rssi` ไปกับ PATCH `houses` ที่มีอยู่แล้ว (ไม่เพิ่มคำขอ HTTPS)
**Result:** ⚠️ `pio run` ผ่าน · **ยังไม่ได้ flash → หน้าเว็บโชว์ `—` ซึ่งถูกต้อง**
**Keep**

### Attempt 6 — LINE ไม่เด้ง
**What changed:** `notify-line` รองรับ broadcast (ไม่ต้องหา userId) + แปลง code เป็นไทย + เวลาไทย
**Why:** probe เจอ `401 unauthorized` จาก `WEBHOOK_SECRET` ที่ตั้งไว้แต่ webhook ไม่ได้ส่ง header
**Result:** ✅ Beer ยืนยันว่า LINE เด้งแล้ว
**Keep**

### Attempt 7 — ปุ่มบันทึก + ปุ่มทดสอบ (`6aa676c`, migration 014)
**Result:** ✅ ใช้งานได้ · **Keep**

### Attempt 8 — ป้ายระดับความรุนแรง (`8e3c297`)
**What changed:** เพิ่ม `severity` ลง `ALERT_CONFIG_CODES` + ป้าย "วิกฤต · เข้า LINE" /
"เตือน · ไม่เข้า LINE" + test อ่าน SQL migration 014 มาเทียบกันหลุด
**Result:** ⚠️ แก้ความสับสนเฉพาะหน้าได้ **แต่สร้างหนี้**: ป้ายเดาจาก severity จะผิดถ้าเปลี่ยน
`LINE_MIN_SEVERITY`
**Undecided** — ส่วน `severity` + test **เก็บไว้** · ส่วน**ป้ายที่อ้าง "เข้า/ไม่เข้า LINE"
ต้องเปลี่ยนเป็น toggle จริงในงานถัดไป**

---

## Relevant Files

**จะต้องแก้ในงานถัดไป (ทาง B):**
- `supabase/migrations/015_alert_notify_line.sql` — *(ยังไม่มี ต้องสร้าง)*
- `supabase/functions/notify-line/index.ts` — ตอนนี้กรองด้วย `LINE_MIN_SEVERITY` อย่างเดียว
- `frontend/lib/types.ts` — `AlertConfigRow`
- `frontend/lib/supabaseData.ts:499-520` — `fetchSupabaseAlertConfig` / `setSupabaseAlertConfig` / `setSupabaseAlertThreshold`
- `frontend/lib/api.ts` — wrapper + mock
- `frontend/lib/alerts.ts` — `ALERT_CONFIG_CODES`
- `frontend/components/AlertConfigPanel.tsx` — ป้าย → toggle
- `frontend/lib/mock.ts` — `buildMockAlertConfig`

**อ่านประกอบ (ไม่ต้องแก้):**
- `firmware/esp32-controller/src/main.cpp` — `notify_check()` severity ต้นทาง
- `supabase/migrations/014_test_alert_rpc.sql` — severity mapping ที่ test อ่านไปเทียบ

## Relevant Tests

```bash
cd frontend && npx tsc --noEmit && npm test && npx next lint
```
- `frontend/lib/alerts.test.ts` — มี test กัน severity หลุดระหว่าง UI กับ SQL (อ่านไฟล์ 014 จริง)
- ปัจจุบัน **90/90 ผ่าน** · `next build` ผ่าน · `pio run -e esp32dev` ผ่าน

⚠️ **กับดักตอนเทสหน้าเว็บ:** อย่ารัน `next dev` สองตัวในโฟลเดอร์เดียวกัน — แชร์ `.next` แล้วทับกัน
(เคยหลอกว่า dashboard โชว์ mock ทั้งที่ต่อ Supabase) ปิดตัวเดิมก่อนเสมอ

## Important Logs / Errors

```
# probe notify-line โดยไม่ส่ง header (severity=info จึงไม่มีข้อความส่งจริง)
HTTP/1.1 401 Unauthorized
unauthorized                     ← plain text ตัวเล็ก = โค้ดเราเอง ไม่ใช่ Supabase gateway
                                   แปลว่า WEBHOOK_SECRET ถูกตั้งไว้
```
```
# console หน้าเว็บ ตอน migration ยังไม่รัน (พฤติกรรมที่ออกแบบไว้ ไม่ใช่ error จริง)
[supabase] sensors ยังไม่มี enabled/ui_position — ยังไม่ได้รัน migration 011 (ใช้ค่า default ไปก่อน)
```
```
# serial ยืนยันบอร์ดนิ่งหลังแก้ watchdog (#52)
rst:0x1 (POWERON_RESET)          ← ไม่ใช่ TG1WDT_SYS_RESET
[hb] mode=SAFE_HOLD app=internet net=1 ids=1 rssi=-67
```

## Current Git State

```
branch: main · sync กับ origin/main แล้ว (ไม่มี commit ค้าง push)
working tree: สะอาด — ไม่มีไฟล์ modified, ไม่มี diff
untracked: .claude/  backend/package-lock.json  memory/     ← ตั้งใจไม่ commit
open PRs: ไม่มี (#53, #54 merge แล้ว)
```

Migration ที่รันบน Supabase แล้ว: **006–014 ครบ**

## Remaining Unknowns

1. Beer จะเอาทาง A หรือ B (ตั้งใจเสนอ B) — **ต้องรอคำตอบก่อนลงมือ**
2. Edge Function มี `SUPABASE_SERVICE_ROLE_KEY` ให้อัตโนมัติจริงไหม (เชื่อว่ามี แต่ยังไม่ยืนยันในโปรเจกต์นี้)
3. มีคอมทิ้งไว้หน้างานให้ remote เข้าไป flash ได้ไหม (ถามแล้ว ยังไม่ตอบ)
4. เกณฑ์ความชื้นที่ Beer อยากได้จริง (ตอนนี้ RH_HIGH=90 แต่ในโรงอยู่ 95-98% ตลอด)
5. ยังไม่มีใครยืนยันพฤติกรรมของ PR #53/#54 บนบอร์ดจริง (ยังไม่ flash)

## Next Investigation Plan

ดูหัวข้อ **"แผนงานถัดไป"** ในคำตอบของ session นี้ (จัดลำดับตาม information value)

## Definition of Done

- [x] เลือกทาง A หรือ B — **Beer เลือก B**
- [x] migration 015 + notify-line อ่าน `notify_line` + UI เป็น toggle จริง
- [x] toggle ในหน้าเว็บสะท้อนความจริง ไม่ใช่เดาจาก severity (ป้าย severity เหลือแค่บอกความเร่งด่วน)
- [x] `tsc` + `npm test` (92) + `next lint` + `next build` ผ่าน
- [ ] **ค้างที่ Beer: รัน migration 015 บน Supabase** — ก่อนรัน ปุ่ม LINE จะกดบันทึกไม่ผ่าน
      (หน้าเว็บ warn ใน console ว่ายังไม่ได้รัน 015) และ notify-line ยังใช้ `LINE_MIN_SEVERITY` แบบเดิม
- [ ] **ค้างที่ Beer: deploy notify-line ใหม่** (`supabase functions deploy notify-line`)
- [ ] หลังรัน 015 + deploy → กด 🧪 ทดสอบ ฝั่ง "ต่ำ" (กองต่ำเกิน / อากาศต่ำเกิน) แล้วต้องเด้ง LINE
- [ ] (แยกงาน) flash บอร์ด → `สัญญาณบอร์ด` มีค่า + alert ที่ปิดไว้เลิกเด้ง + COLD/BED_LOW ยิงได้จริง
      (ตอนนี้ตั้งค่าเก็บได้แล้วแต่เฟิร์มแวร์บนบอร์ดยังไม่ยิง 2 code นี้ — ป้าย "รอ flash" ในหน้าเว็บบอกไว้)

## Last Updated

2026-08-09 · หลัง commit `dcb88f0` (ทาง B เสร็จฝั่งโค้ด เหลือรัน migration + deploy function)
