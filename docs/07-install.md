# 07 — ติดตั้งหน้างาน + Commissioning

คู่มือติดตั้งจริงหน้างาน ตั้งแต่เดินสาย → flash firmware → ตั้ง cloud → **ทดสอบ safety** → ใช้งาน
อ่านคู่กับ `02-hardware.md` (รายการอุปกรณ์/wiring) และ `03-control-logic.md` (ลอจิก/interlock)

> ⚠️ **กฎเหล็ก:** safety interlock ต้องมีทั้งฮาร์ดแวร์และซอฟต์แวร์ — thermal cutoff/float/RCD/fail-safe relay
> ห้ามพึ่ง firmware อย่างเดียว (ดู `02-hardware.md` §ความปลอดภัย)

## 0) เตรียมก่อนไปหน้างาน
- [ ] ตู้คอนโทรล: ESP32 + relay board (fail-safe) + PSU 24V/5V + RS485 transceiver 3.3V
- [ ] เซนเซอร์: RS485 T/RH ×3 (addr 1/2/3), DS18B20 ×3 (+ pull-up 4.7kΩ), float switch
- [ ] termination 120Ω ×2 (ปลายบัส RS485)
- [ ] โน้ตบุ๊ก + PlatformIO + สาย USB; ค่า WiFi หน้างาน; Supabase URL + **service_role key**; LINE token (ถ้าทำ)

## 1) Pin map ESP32 (จาก `firmware/esp32-controller/src/config.h`)
| ฟังก์ชัน | GPIO | หมายเหตุ |
|---|---|---|
| RS485 RX | 16 | เข้า transceiver RO |
| RS485 TX | 17 | เข้า transceiver DI |
| RS485 DE/RE | 4 | -1 ถ้าใช้บอร์ด auto-direction |
| RS485 baud | 9600 | Modbus RTU, addr 1=หัว, 2=กลาง, 3=ท้าย |
| DS18B20 (1-wire) | 15 | pull-up 4.7kΩ ไป 3.3V |
| Float switch | 34 | input only; **LOW = น้ำต่ำ** (ปรับตาม wiring จริงใน `read_float_water()`) |
| Relay MIST (ปั๊มพ่นหมอก) | 25 | active-high |
| Relay HEATER (ฮีทเตอร์) | 26 | active-high |
| Relay EXHAUST (พัดลมดูด) | 27 | active-high |
| Relay LIGHT (หลอดไฟ) | 32 | active-high |
| Relay CIRCULATION (พัดลมหมุนเวียน) | 33 | active-high |

## 2) เดินสาย (ดู `02-hardware.md` ประกอบ)
1. **RS485:** บัสเดียว A/B/GND ต่อพ่วง 3 ตัว (addr ไม่ซ้ำ) + termination 120Ω คร่อม A-B ที่ปลายทั้ง 2
2. **DS18B20:** ต่อพ่วงสายเดียว + pull-up 4.7kΩ; จิ้มเบดปาล์ม หัว/กลาง/ท้าย ลึก 5–10 ซม.
3. **Float:** ในถังน้ำ → GPIO34 (input) — ต่อให้ **น้ำต่ำ = LOW**
4. **Relay:** เลือกโมดูล **fail-safe (ไฟดับ → OFF)**; 220V อยู่ในตู้นอกโรงทั้งหมด เข้าโรงเฉพาะ 24V + สัญญาณ
5. แยกท่อสายสัญญาณจากสาย 220V/ฮีทเตอร์ (กัน noise); กล่อง IP65
6. **ฮาร์ดแวร์ interlock (บังคับ):** thermal cutoff อนุกรมฮีทเตอร์, float ตัดปั๊มระดับฮาร์ดแวร์, RCD ทุกวงจร

## 3) Flash firmware
1. `cd firmware/esp32-controller`
2. สร้าง secrets (ห้าม commit — ดู `firmware/esp32-controller/README.md`):
   ```
   cp src/secrets.h.example src/secrets.h
   ```
   เติม `SECRET_WIFI_SSID/PASS`, `SECRET_SUPABASE_URL`, `SECRET_SUPABASE_SERVICE_KEY` (service_role)
3. เลือกโหมด (default Internet, fallback Local อัตโนมัติเมื่อเน็ตหลุด — ดู firmware README):
   NVS ตั้งทีหลังได้ / ค่า default อยู่ใน `config.h` (`DEFAULT_APP_MODE`)
4. Build + upload + monitor:
   ```
   pio run
   pio run -t upload
   pio device monitor         # ดู log 115200
   ```
5. ตอน boot ถ้า log ขึ้น `[WARN] secrets.h ยังเป็นค่า CHANGEME` = ยังไม่เติม secrets จริง

## 4) ตั้งฝั่ง cloud (โหมด Internet)
1. **Supabase:** รัน migration ใน SQL editor ตามลำดับ `001 → 002 → 003 → 004`
   (ดู `supabase/README.md`) — 003 = Auth/RLS, 004 = retention (เปิด pg_cron ก่อน)
2. สร้าง user (Authentication → Users) + **ปิด Allow new users to sign up** (อย่าปิด Email provider!)
3. seed ใน 001 มี house-01 + sensors/actuators (ใช้ resolve id ตอน ESP32 boot)
4. **LINE แจ้งเตือน (ถ้าทำ):** ดู `supabase/functions/notify-line/README.md`
5. **frontend:** ตั้ง `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/HOUSE_ID` (Vercel หรือ local) — ดู `frontend/.env.example`

## 5) Commissioning checklist (เปิดระบบครั้งแรก)
ทำตามลำดับ อย่าข้าม §6 (safety):
- [ ] ESP32 boot → `pio device monitor` เห็น heartbeat `[hb] mode=... net=1 ids=1`
- [ ] `net=1` (ต่อ WiFi ได้) + `ids=1` (resolve sensor/actuator id จาก Supabase สำเร็จ)
- [ ] เซนเซอร์อ่านได้: air ×3, bed ×3, water — เช็คบน dashboard (การ์ดอากาศ/กอง/น้ำ) มีค่าจริง ไม่ NaN
- [ ] ค่าขึ้น Supabase: dashboard เห็นค่าอัปเดต realtime (โหมด Internet) / เปิด `http://<esp-ip>/` (โหมด Local)
- [ ] สลับ AUTO/MANUAL บน dashboard + login แล้วสั่งอุปกรณ์ได้ (ไม่ login สั่งไม่ได้)
- [ ] แก้ setpoint หน้า Settings (login) → บันทึกได้

## 6) ทดสอบ SAFETY หน้างาน (สำคัญสุด — ทำทุกครั้ง)
ทดสอบว่า **คำสั่งคนไม่ชนะ safety** และ interlock ทำงานจริง (ดู `03-control-logic.md` + test `firmware/.../test/test_interlock`):
- [ ] **น้ำต่ำ:** ทำ float = น้ำต่ำ → กด MIST ON (manual) → **ปั๊มต้องไม่ติด** + alert `LOW_WATER` + ปั๊มถูกล็อก OFF
- [ ] **กองร้อน:** จำลอง bed ≥ 40°C → กด HEATER ON → **ฮีทเตอร์ต้องไม่ติด** + EXHAUST ON + alert `BED_OVERHEAT`
- [ ] **อากาศเย็น:** T_air < 27.5°C → กด MIST ON → **ห้ามพ่นเด็ดขาด**
- [ ] **heater+mist:** เปิด HEATER แล้วกด MIST → อีกตัวต้องดับ (ห้าม ON แรงพร้อมกัน)
- [ ] **ไฟดับ:** ตัดไฟตู้ → relay ทุกตัว OFF (fail-safe) → จ่ายไฟกลับ → ESP32 boot คุมต่อเอง
- [ ] **เน็ตหลุด:** ถอด WiFi → control loop ยังทำงาน (edge-autonomous) + fallback เป็นโหมด Local (เปิด `http://<esp-ip>/`)
- [ ] **watchdog:** (ถ้าทดสอบได้) ค้าง → รีบูตเองใน ~15s
- [ ] **LINE:** insert alert critical → เด้งเข้า LINE (ถ้าตั้ง)

## 7) Troubleshooting
| อาการ | เช็ก |
|---|---|
| `ids=0` ตลอด | seed sensors/actuators ยังไม่รัน (001) หรือ HOUSE_ID ไม่ตรง / service_role key ผิด |
| เซนเซอร์ air NaN | RS485 A/B สลับ, addr ไม่ตรง (1/2/3), termination, baud, DE/RE pin |
| bed NaN | pull-up 4.7kΩ, สาย 1-wire, ROM |
| ค่าไม่ขึ้น dashboard | net หลุด / service_role key / RLS (anon อ่านได้ไหม) — ดู `supabase/README.md` |
| สั่งอุปกรณ์ไม่ได้ | ยังไม่ login (RLS: authenticated เท่านั้น) — ดู `003_auth_rls.sql` |
| LINE ไม่เด้ง | ดู `supabase/functions/notify-line/README.md` §ทดสอบ (secrets/webhook/แอด OA) |
| ข้อมูลโตเร็ว | ตั้ง retention (004) + dry-run ก่อนเปิด cron ลบ — ดู `004_retention_rollup.sql` |

> หลังติดตั้งเสร็จ: จดค่า setpoint ที่ใช้จริง + วันที่ commissioning ไว้ในบันทึกรอบเพาะ (ใช้วิเคราะห์รอบถัดไป)
