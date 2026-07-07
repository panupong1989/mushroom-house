# scripts/mock-telemetry.ts

จำลอง ESP32 ยิง telemetry/actuator-state/heartbeat/alert เข้า MQTT เพื่อทดสอบ backend
end-to-end โดยไม่ต้องมีบอร์ดจริง ค่าอ่านแกว่งแบบ sine wave ตามเวลา (อุณหภูมิอากาศ ~26-34°C,
RH ~80-92%, เย็นลงตอนกลางคืน) ยิงทุก ~5 วินาที และสุ่ม alert เป็นครั้งคราว

อ่านการตั้งค่า MQTT (`MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_BASE_TOPIC`, `HOUSE_ID`)
จาก `.env` เดียวกับ backend (`src/config.ts`) — ตั้งค่าที่ไหน ทั้ง backend และสคริปต์นี้ใช้ค่าเดียวกัน

## วิธีทดสอบ end-to-end

```bash
docker compose up -d        # postgres + mosquitto
npm run migrate             # (ใน backend/) สร้างตาราง + seed

# terminal 1
npm run dev                 # รัน backend, subscribe MQTT

# terminal 2
npm run mock                # ยิง telemetry ปลอมเข้า MQTT ทุก ~5s

# terminal 3 (หรือ browser)
curl http://localhost:3000/houses/house-01/latest
```

เห็นค่าจาก `air_th` / `bed_temp` / `water_level` ไหลเข้าและอัปเดตทุกครั้งที่สคริปต์ยิงรอบใหม่
คือ ingest path ทำงานถูกต้อง กด Ctrl+C ที่ terminal 2 เพื่อหยุดสคริปต์

## หมายเหตุ

- addr ของ air (`1`,`2`,`3`) และ bed (`28-0000-01..03`) ต้องตรงกับที่ seed ไว้ใน `db/seed.sql`
  ไม่งั้น `ingestTelemetry` จะหา sensor ไม่เจอแล้วไม่ insert อะไรเลย (ดู `src/services/ingest.ts`)
- ค่า actuator/state ที่จำลอง (`simulateActuatorState`) มีไว้ทดสอบ ingest path เท่านั้น
  ไม่ใช่ control logic จริง — ของจริงอยู่ที่ firmware (`docs/03-control-logic.md`)
- ไม่มี integration test ที่ต่อ MQTT broker + Postgres จริง เพราะต้องมี service ทั้งสองตัวรันอยู่
  (ผ่าน `docker-compose.yml`) ซึ่งไม่เหมาะกับ unit test suite ปกติ — ใช้ขั้นตอนด้านบนทดสอบ
  end-to-end ด้วยมือแทน ส่วน `mock-telemetry.test.ts` คุม pure logic ของตัวจำลอง (ช่วงค่า, addr,
  interlock) ด้วย unit test แทน
