# Mushroom House Controller (โรงเพาะเห็ดฟาง)

ระบบควบคุมสภาพอากาศในโรงเพาะ **เห็ดฟาง** อัตโนมัติ — คุม **อุณหภูมิ / ความชื้น / อากาศ** ให้เห็ดออกได้จริง
เป็นโปรเจกต์แยก (standalone) ไม่ผูกกับ Venjoin

- **Edge:** ESP32 อ่านเซนเซอร์ RS485 (Modbus RTU) + DS18B20, คุมรีเลย์ตาม FSM, ทำงานเองได้แม้เน็ตหลุด
- **Backend:** Node.js + TypeScript + Express + PostgreSQL + MQTT — เก็บ telemetry, ตั้งค่า setpoint, สั่ง manual, แจ้งเตือน
- **DB:** PostgreSQL (time-series readings + config + events + alerts)

> โรงเป้าหมาย: โรงไม้ 4 แถว × 4 ชั้น ~6 เมตร · วัสดุเพาะ ทะลายปาล์มหมัก

## โครงสร้าง
```
docs/       เอกสารออกแบบ (ภาพรวม/ฮาร์ดแวร์/ลอจิก/ฐานข้อมูล/API/โรดแมป)
db/         SQL migrations + seed
firmware/   ESP32 (PlatformIO) — RS485/relay/FSM/safety/MQTT skeleton
backend/    Node/TS API + MQTT ingest skeleton
docker-compose.yml   Postgres + Mosquitto สำหรับ dev
CLAUDE.md   คำสั่งให้ Claude Code ทำต่อ (อ่านไฟล์นี้ก่อนเริ่ม)
```

## เริ่มเร็ว (dev)
```bash
cp .env.example .env
docker compose up -d          # postgres + mosquitto
cd backend && npm install && npm run migrate && npm run dev
# firmware: เปิด firmware/esp32-controller ด้วย PlatformIO แล้ว build/upload
```

## หลักคิดหลัก
1. **อุณหภูมิคือนาย ความชื้นเป็นรอง** — ตัดสินใจจากอุณหภูมิก่อนเสมอ
2. **Edge-autonomous** — ESP32 คุมเองได้ backend เป็นแค่ตา/มือช่วย ไม่ใช่คนตัดสินใจ
3. **Safety interlock ระดับฮาร์ดแวร์** — thermal cutoff, float dry-run, fail-safe, watchdog

ดูรายละเอียดใน `docs/` และ `CLAUDE.md`
