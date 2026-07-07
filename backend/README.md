# Backend (Node/TS + PostgreSQL + MQTT)

หน้าที่: รับ telemetry จาก ESP32 -> เก็บ DB, ให้ REST API (latest/config/command/alerts), ส่ง command กลับผ่าน MQTT
**ไม่ใช่ control authority** — การตัดสินใจ real-time อยู่ที่ ESP32

## รัน
```bash
cp ../.env.example ../.env   # แก้ค่าก่อน
npm install
npm run migrate             # สร้างตาราง + seed
npm run dev
```

## โครง src/
- `index.ts`         bootstrap express + mqtt
- `config.ts`        อ่าน env
- `db/pool.ts`       pg pool
- `db/migrate.ts`    รัน migrations + seed
- `mqtt/client.ts`   connect + subscribe telemetry -> insert
- `mqtt/topics.ts`   helper สร้าง topic
- `routes/*`         health, houses, sensors, actuators, alerts
- `services/*`       ingest, control-config, commands
