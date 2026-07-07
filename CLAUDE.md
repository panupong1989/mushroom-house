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
