# 06 — Roadmap

## v1 (MVP — ทำก่อน)
- ESP32: อ่าน RS485 x3 + DS18B20 x3 + float, control FSM (temp master + RH + timer vent/light), safety interlock, MQTT
- Backend: ingest telemetry -> DB, REST latest/config/command, alerts
- DB: migrations 001–00x, seed โรงเดียว
- แดชบอร์ดง่ายๆ (later)
- **CO₂ ใช้ timer แทนเซนเซอร์** (ยังไม่ซื้อ)

## v2 (ต่อยอด)
- เพิ่มเซนเซอร์ CO₂ จริง (MH-Z19 / SCD41) -> เปลี่ยน vent เป็น closed-loop
- พัดลมปรับรอบ (VFD 0-10V) แทน on/off
- แดชบอร์ด + กราฟย้อนหลัง + LINE notify
- Multi-house / multi-tenant (โครง DB รองรับแล้ว)
- OTA firmware update
