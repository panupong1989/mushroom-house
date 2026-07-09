# Backend (Node/TS + PostgreSQL + MQTT)

> ## ⚠️ สถานะ: LEGACY / DEV-MOCK TOOL (ไม่ใช่ production path)
> ตั้งแต่ย้ายไป Supabase (ดู `supabase/`) + firmware 2 โหมด **production data flow ไม่ผ่าน backend นี้แล้ว**:
> - **Internet mode**: ESP32 → Supabase (REST insert `sensor_readings` + poll `commands`) → frontend realtime
> - **Local mode**: ESP32 โฮสต์ web server ในตัว → ยัง persist ขึ้น Supabase (single source of truth)
>
> backend นี้ **เก็บไว้เป็นเครื่องมือ dev/mock + legacy** ไม่ลบ เพราะยังมีค่า:
> 1. **local dev stack** (Postgres+MQTT) — frontend fallback ผ่าน `NEXT_PUBLIC_API_URL` เมื่อยังไม่ตั้ง Supabase
> 2. **legacy MQTT ingest** — ใช้ได้เมื่อ build firmware ด้วย `-DUSE_MQTT=1`
> 3. **reference + test ของ control logic** — `services/control.ts` (ladder/interlock), `commandGuard`, `validateConfig`,
>    `ingest` + mock telemetry (รวม **49 unit test** ที่เป็น spec ความปลอดภัยฝั่ง TS — ห้ามทิ้ง)
>
> จะ decommission ถาวร (ลบทั้ง service) = เปลี่ยนสถาปัตยกรรม → ต้องให้ Beer ตัดสินใจก่อน (ดู CLAUDE.md Working style ข้อ 4)

หน้าที่ (เดิม): รับ telemetry จาก ESP32 -> เก็บ DB, ให้ REST API (latest/config/command/alerts), ส่ง command กลับผ่าน MQTT
**ไม่ใช่ control authority** — การตัดสินใจ real-time อยู่ที่ ESP32

## รัน
```bash
cp ../.env.example ../.env   # แก้ค่าก่อน
npm install
npm run migrate             # สร้างตาราง + seed
npm run dev
```

## CORS

อ่านค่า origin ที่อนุญาตจาก env `CORS_ORIGIN` (ดู `.env.example`) — default `*` (dev only)
ถ้า deploy frontend คนละโดเมนกับ backend (เช่นบน Vercel) ให้ตั้งเป็นโดเมนจริงของ frontend
คั่นด้วย `,` ได้หลายค่า เช่น `CORS_ORIGIN=https://myapp.vercel.app`

## โครง src/
- `index.ts`         bootstrap express + mqtt
- `config.ts`        อ่าน env
- `db/pool.ts`       pg pool
- `db/migrate.ts`    รัน migrations + seed
- `mqtt/client.ts`   connect + subscribe telemetry -> insert
- `mqtt/topics.ts`   helper สร้าง topic
- `routes/*`         health, houses, sensors, actuators, alerts
- `services/*`       ingest, control-config, commands
