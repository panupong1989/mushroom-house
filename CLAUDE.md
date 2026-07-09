# CLAUDE.md — คำสั่งสำหรับ Claude Code

อ่านไฟล์นี้ + `docs/` ทั้งหมดก่อนเริ่มเขียนโค้ด นี่คือ scaffold ตั้งต้น (skeleton) ของ
**ระบบควบคุมโรงเพาะเห็ดฟาง** งานคือทำให้รันได้จริงตามสเปกใน `docs/`

## บริบทสำคัญ (อย่าหลุด)
1. **อุณหภูมิคือ master, ความชื้นเป็นรอง** — ทุก control logic ตัดสินจากอุณหภูมิก่อน (ดู `docs/03-control-logic.md`)
2. **Edge-autonomous** — control loop อยู่ที่ ESP32 ต้องทำงานต่อได้แม้เน็ตหลุด backend ไม่ใช่ authority
3. **Safety ต้องมีทั้งฮาร์ดแวร์และซอฟต์แวร์** — INTERLOCK เหล็ก: ถ้า T_air < 27.5°C ห้ามพ่นหมอกเด็ดขาด;
   heater+mist ห้าม ON แรงพร้อมกัน; น้ำต่ำ = ตัดปั๊ม; relay fail-safe (ไฟดับ=OFF); watchdog
4. โปรเจกต์แยกจาก Venjoin — ไม่ต้องผูก payment/tenant ของ Venjoin

## สแตก
- firmware: ESP32 + PlatformIO (Arduino) — `firmware/esp32-controller`
- backend: Node.js + TypeScript (ESM) + Express + `pg` + `mqtt` — `backend`
- db: PostgreSQL — `db/migrations` + `db/seed.sql`
- dev infra: `docker-compose.yml` (postgres + mosquitto)

## สถานะปัจจุบัน (มีโครงแล้ว / ต้องทำต่อ = TODO(CC))
- [x] โครง repo + docs + DB schema + seed
- [x] firmware skeleton: RS485 read, relays (min-on/off, fail-safe), safety, FSM (ladder+RH+vent), MQTT pub
- [x] backend skeleton: mqtt ingest, REST (health/houses/latest/config/command/alerts), migrate runner
- [ ] firmware: อ่าน DS18B20 x3 จริง -> `s.bed[]`, `s.bed_temp_max` (main.cpp มี TODO)
- [ ] firmware: parse `cmd/actuator`,`cmd/config`(setpoint->NVS),`cmd/profile` ใน `mqtt_client.cpp onMsg`
- [ ] firmware: manual override (มี TTL), light ตามเวลา (RTC/NTP), circulation ตาม |T_top-T_bottom|
- [ ] firmware: verify register map ของเซนเซอร์ RS485 รุ่นจริง (XY-MD02 ฯลฯ)
- [ ] backend: ingest bed_temp + water_level + เก็บ mode ล่าสุด, validate ช่วง setpoint
- [ ] backend: command TTL expiry -> ส่ง `auto` กลับ, heartbeat -> online status
- [ ] tests: control ladder + interlock (unit), ingest (integration)
- [ ] dashboard (v2)

## Definition of Done (v1)
- `docker compose up -d` + `npm run migrate` + `npm run dev` ขึ้นได้ ไม่ error
- ยิง telemetry ปลอมเข้า MQTT แล้วเห็นข้อมูลใน `/houses/house-01/latest`
- แก้ setpoint ผ่าน `PUT /houses/:id/config` แล้ว publish `cmd/config` ออก
- firmware build ผ่าน (`pio run`) และ logic ladder/interlock มี unit test ครอบ

## คอนเวนชัน
- TypeScript ESM, ห้าม `any` ที่เลี่ยงได้, ใช้ `zod` validate ที่ขอบ (route/mqtt payload)
- SQL ผ่าน `q()` เท่านั้น, พารามิเตอร์ทุกครั้ง (กัน injection)
- คอมมิตเล็ก, ข้อความชัด; งานที่แตะ migration/firmware/safety = แยก branch + PR (ตาม policy เดิมของ Beer)
- PowerShell: ไม่รองรับ `&&` ใช้ `;` หรือคนละบรรทัด
- อย่าลบ TODO(CC) จนกว่าจะทำเสร็จจริง

## ลำดับแนะนำ
1. ยืนยัน docker/db/migrate/backend รันได้ (แก้ path migrate ถ้าจำเป็น)
2. เติม DS18B20 + cmd parsing ใน firmware
3. เขียน unit test control ladder + interlock (สำคัญสุดด้านความปลอดภัย)
4. เติม ingest bed/water + validate config
5. ค่อยทำ dashboard/v2

---

## Working style (สไตล์การทำงาน)

ทำงานให้จบเป็นชุด **ไม่หยุดถามระหว่างทาง**

- เจอทางเลือก → เลือกทางที่ตรงกับ `docs/` และปลอดภัยที่สุด แล้วทำต่อเลย บันทึกเหตุผลไว้ในสรุปท้ายงาน
- เจอบั๊กระหว่างทาง → แก้เลย พร้อมเขียน test ครอบ ไม่ต้องขออนุญาต
- ตัดสินใจเชิงเทคนิคเล็กๆ (ตั้งชื่อ, จัดโครงไฟล์, เลือก library) → ตัดสินใจเองได้
- รายงานทีเดียวตอนจบ: ไฟล์ที่แก้ + build/test ผ่านไหม + ตัดสินใจอะไรไปบ้าง + เหลืออะไร

### หยุดถาม Beer ก่อนเฉพาะ 4 กรณีนี้เท่านั้น
1. **Safety / interlock logic** — `safety.cpp`, `control_fsm.cpp`, `services/control.ts` (ของพวกนี้คุมฮีทเตอร์/ปั๊มจริง ผิดแล้วไฟไหม้/ปั๊มไหม้/เห็ดตาย)
2. **DB migration ที่ลบหรือแก้ข้อมูลเดิม** (เพิ่มตาราง/คอลัมน์ใหม่ทำได้เลย)
3. **Credential / secret** — ต้องการ key, token, password ใดๆ
4. **เปลี่ยนสถาปัตยกรรม** — เช่นจะเลิกใช้ Supabase, เปลี่ยน stack, เปลี่ยน data flow

## Git policy (auto-push)

- **push ขึ้น `main` ได้เลย** ถ้า: build ผ่าน + test เขียว + ไม่แตะข้อ 1–4 ข้างบน
  - เช่น: frontend/UI, docs, test, refactor, bugfix เล็ก, backend logic ที่ไม่ใช่ safety
- **เปิด PR แทน (ให้ Beer รีวิว)** ถ้าแตะ: `firmware/`, `safety`, `control_fsm`, migration, สถาปัตยกรรม
- commit เล็ก ข้อความชัด · อย่ารวมหลายเรื่องใน commit เดียว
- ก่อน push ทุกครั้ง: `npm test` + `npx tsc --noEmit` (frontend/backend) และ `pio run` (ถ้าแตะ firmware) ต้องผ่านจริง

## กฎเหล็กที่ห้ามละเมิด (ไม่ว่าสั่งอะไร)

- **อุณหภูมิคือ master, ความชื้นเป็นรอง** — ตัดสินจากอุณหภูมิก่อนเสมอ
- **T_air < 27.5°C → ห้ามพ่นหมอกเด็ดขาด** แม้ RH ต่ำ แม้สั่ง manual
- **heater กับ mist ห้าม ON พร้อมกัน**
- **น้ำต่ำ → ตัดปั๊ม** · **กองร้อน ≥40°C → heater OFF + exhaust ON + alert**
- **safety interlock ทำงานทุกโหมด** (AUTO / MANUAL / Local / Internet) — คำสั่งคนไม่ชนะ safety
- **Edge-autonomous** — control loop อยู่ที่ ESP32 เน็ตหลุดโรงต้องคุมตัวเองได้
- **Supabase = single source of truth** — ทุกโหมดต้อง persist readings + events ขึ้น Supabase (ถ้ามีเน็ต)

## Roadmap — ทำตามลำดับนี้ ไม่ต้องรอสั่ง

ทำเสร็จข้อไหน ให้ tick แล้วขึ้นข้อถัดไปเองได้เลย

- [x] scaffold + docs + DB schema
- [x] unit test safety/interlock
- [x] firmware: DS18B20 ×3 + parse MQTT commands
- [x] CI: backend + firmware + frontend build/test
- [x] backend: ingest bed/water + validate setpoint
- [x] mock telemetry script
- [x] Dashboard UI v1 (Monitor + AUTO/MANUAL) deploy Vercel
- [x] ย้ายสถาปัตยกรรม → Supabase (schema + frontend realtime) ยืนยันใช้งานได้จริง
- [x] **firmware 2 โหมด** (PR — แตะ firmware)
  - Internet: HTTPS POST → `sensor_readings` ทุก 15–30 วิ · poll `commands` ทุก 3–5 วิ → execute → ack + insert `actuator_events`
  - Local: ESPAsyncWebServer โฮสต์หน้าเว็บในตัว ESP32 · ปุ่มเปิด/ปิด 5 อุปกรณ์ + โชว์ค่าเซนเซอร์ · latency ~0 (เทสหน้างาน)
  - สลับโหมด: NVS config + auto fallback → Local ถ้าต่อเน็ตไม่ได้
  - service_role key เก็บใน NVS/secrets ที่ gitignore (ห้าม commit)
  - ปิด MQTT code เดิม (`#ifdef` ได้)
- [x] ล้าง backend Node เดิม (Postgres+MQTT) ที่ไม่ใช้แล้ว หรือแปลงเป็น dev/mock tool
  - เลือก "แปลงเป็น dev/mock tool" (ไม่ลบ — เก็บ 49 safety/interlock tests + local dev + legacy MQTT); ลบถาวร = แตะ architecture ต้องถาม Beer
- [x] UI v2: กราฟย้อนหลัง (อุณหภูมิ/ความชื้น 24 ชม. / 7 วัน) จาก `sensor_readings` (read-only)
  - aggregate ฝั่ง DB (RPC `air_history` — supabase/migrations/002) เพราะ readings โตเร็ว; SVG inline ไม่เพิ่ม dep; ต้องรัน migration 002 ก่อนใช้
- [x] UI v3: หน้าแจ้งเตือน (อ่าน `alerts`) (read-only; "เคลียร์ alert" เขียน resolved_at ต้องมี Auth ก่อน — เลื่อนไปหลัง Auth)
  - AlertsSection: fetch + realtime (INSERT/UPDATE) จาก Supabase; เรียง unresolved>รุนแรง>ใหม่; mock สำหรับ dev; 8 unit test
- [ ] Auth: ปิดไม่ให้คนนอกกดสั่งอุปกรณ์ (Supabase Auth + RLS)
- [ ] UI v2: หน้า Settings (แก้ setpoint จาก Supabase `control_config`) + validate ช่วงค่า — **หลัง Auth** (ห้าม anon เขียน setpoint เด็ดขาด: คุมฮีทเตอร์/ปั๊มโดยตรง)
- [ ] แจ้งเตือนเข้า LINE (Supabase Edge Function → LINE Messaging API)
- [ ] PWA: เพิ่มลงหน้าจอมือถือ
- [ ] retention/rollup `sensor_readings` (ข้อมูลจะโตเร็ว)
- [ ] ทดสอบกับบอร์ด ESP32 จริง + เอกสารติดตั้งหน้างาน

## เมื่อทำเสร็จแต่ละข้อ

1. รัน build + test ให้ผ่านจริง (อย่าเดา)
2. commit + push (หรือเปิด PR ถ้าเข้าเงื่อนไข)
3. tick checklist ใน CLAUDE.md
4. สรุปสั้นๆ ว่าทำอะไร ตัดสินใจอะไร แล้ว **ขึ้นงานถัดไปใน roadmap ต่อได้เลย** ไม่ต้องรอสั่ง