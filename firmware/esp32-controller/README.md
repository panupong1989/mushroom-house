# ESP32 Controller (firmware)

Edge controller — อ่านเซนเซอร์ RS485(Modbus)+DS18B20, รัน control FSM, คุมรีเลย์
**ทำงานเองได้แม้เน็ตหลุด** (control loop + safety อยู่บนบอร์ด)

## 2 โหมดการทำงาน (App mode)
คนละแกนกับ FSM mode (FRUITING/MANUAL/SAFE_HOLD) — App mode คือ "แหล่งรับคำสั่ง/แสดงผล":

| โหมด | รับคำสั่งจาก | แสดงผล | persist ขึ้น Supabase |
|---|---|---|---|
| **Internet** (`APP_INTERNET`) | poll ตาราง `commands` ทุก 3–5s | dashboard (Vercel/Supabase) | ✅ readings + events |
| **Local** (`APP_LOCAL`) | ปุ่มบน web server ในตัว (LAN, latency ~0) | หน้าเว็บ ESP32 (`http://<ip>/`) | ✅ readings + events (ถ้ามีเน็ต) |

- **กฎเหล็ก:** ทั้ง 2 โหมด persist `sensor_readings` + `actuator_events` ขึ้น Supabase เสมอถ้ามีเน็ต
  (Supabase = single source of truth) — web server ในตัวเปิดพร้อมเสมอไว้ดูสถานะหน้างาน
- **สลับโหมด:** อ่านจาก NVS (`nvs_load_mode`) — ตั้งใจ Internet แต่ถ้าต่อเน็ตไม่ได้ **auto fallback เป็น Local**
- **safety interlock** ทำงานทั้ง 2 โหมด แม้สั่ง manual (ห้ามพ่นหมอกตอนอากาศเย็น, heater/mist ห้าม ON พร้อมกัน ฯลฯ)

## โครง src/
- `config.h`        พิน/ค่าคงที่/ค่า setpoint default/Supabase URL/mode default
- `secrets.h`       WiFi + Supabase service_role key — **gitignored** (คัดลอกจาก `secrets.h.example`)
- `rs485_sensors.*` อ่าน T/RH x3 ผ่าน Modbus RTU
- `onewire_bed.*`   อ่าน DS18B20 x3 -> s.bed[] / bed_temp_max
- `nvs_store.*`     โหลด/เซฟ setpoint + app mode ลง NVS (Preferences)
- `relays.*`        คุมรีเลย์ + min-on/min-off + fail-safe
- `safety.*`        interlock (float dry-run, bed overheat, danger hot)
- `control_fsm.*`   FSM + temperature ladder + humidity + timer vent/light + manual override (TTL)
- `net.*`           WiFi (non-blocking reconnect) + NTP (เวลา ISO สำหรับ commands.acked_at)
- `supabase.*`      REST client: resolve ids, post readings/events/alerts, poll+ack commands, update house mode
- `local_server.*`  ESPAsyncWebServer: หน้าคุม 5 อุปกรณ์ + ค่าเซนเซอร์ (ปุ่ม -> ring buffer -> loop หลัก)
- `mqtt_client.*`   **legacy** — ปิดด้วย `#if USE_MQTT` (default off)
- `main.cpp`        setup/loop + เลือกโหมด + fallback + watchdog

## ตั้งค่าก่อน build/flash
1. `cp src/secrets.h.example src/secrets.h` แล้วเติม WiFi + `SECRET_SUPABASE_URL` + `SECRET_SUPABASE_SERVICE_KEY`
   (service_role key จาก Supabase → Project Settings → API — **ห้าม commit / ห้ามใช้ anon key**)
2. รัน `supabase/migrations/001_init.sql` แล้ว (มีตาราง + seed sensors/actuators ให้ resolve id)
3. `pio run` (build) / `pio run -t upload` (flash) / `pio device monitor`

## หมายเหตุ
- ใช้ RS485 transceiver 3.3V; ตั้ง DE/RE ที่ `RS485_DE_RE_PIN`
- relay fail-safe: เลือกโมดูลที่ OFF เมื่อไฟหาย
- ค่า setpoint override ผ่าน dashboard (ตาราง `control_config`) — v1 firmware ยังไม่ sync กลับ (TODO)
- TLS ใช้ `setInsecure()` ใน v1 — TODO(CC): pin root CA ของ Supabase
- resolve sensor_id/actuator_id ตอน boot จากตาราง `sensors`/`actuators` (map ตาม kind+location head/mid/tail)
- เปิด MQTT เดิมกลับ: build ด้วย `-DUSE_MQTT=1` + เพิ่ม `knolleary/PubSubClient` ใน platformio.ini
