# 04 — ฐานข้อมูล (PostgreSQL)

รองรับหลายโรงตั้งแต่แรก (`houses`) แม้ตอนนี้ใช้โรงเดียว

## ตาราง
- **houses** — โรงเพาะ (id, name, timezone, active_profile)
- **sensors** — เซนเซอร์ (id, house_id, kind[`air_th`|`bed_temp`|`water_level`], address, location, unit)
- **sensor_readings** — time-series (sensor_id, ts, metric[`temp`|`rh`], value) — ปริมาณเยอะ
- **actuators** — โหลด (id, house_id, kind[`mist`|`heater`|`exhaust`|`light`|`circulation`], relay_channel, name)
- **actuator_events** — ประวัติ on/off (actuator_id, ts, state, reason, source[`auto`|`manual`|`safety`])
- **control_config** — คีย์-ค่า setpoint/timer ต่อ house (ดู 03-control-logic)
- **control_profiles** — ชุดค่าเฟส (`spawn_run` / `fruiting`)
- **alerts** — แจ้งเตือน (id, house_id, ts, severity, code, message, resolved_at)
- **commands** — คำสั่ง manual จาก backend -> ESP32 (id, house_id, actuator, action, ttl_sec, ts, acked_at)

## หมายเหตุ performance
- `sensor_readings` โตเร็ว — แนะนำ **TimescaleDB hypertable** หรือ partition ราย เดือน + retention policy
- index: `(sensor_id, ts desc)`, `(house_id, ts desc)` สำหรับ events/alerts
- ดู migrations ใน `db/migrations/`
