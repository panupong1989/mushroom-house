# supabase/ — schema สำหรับโหมด Internet (Vercel + Supabase)

โฟลเดอร์นี้เป็น schema คนละชุดกับ `db/migrations` (Postgres ธรรมดา สำหรับ backend/MQTT เดิม —
โหมด **Local**) ใช้เมื่อ deploy แบบ **Internet mode**: frontend (Vercel) คุย Supabase ตรงๆ
ไม่ผ่าน backend/MQTT — ดู `CLAUDE.md` และ `docs/` สำหรับภาพรวมสถาปัตยกรรม 2 โหมด

## กฎเหล็ก
- Supabase = single source of truth ของโหมด Internet — เซนเซอร์/actuator event/คำสั่งต้อง persist + realtime เสมอ
- safety logic (interlock) ยังอยู่ที่ ESP32 (edge) เสมอ — Supabase ไม่ใช่ authority ที่ตัดสินใจ
- frontend ใช้ **anon key เท่านั้น** ห้ามใช้ `service_role` ฝั่ง client เด็ดขาด (จะข้าม RLS ได้ทั้งหมด)
- `service_role` key มีไว้ให้ ESP32/gateway ใช้ insert `sensor_readings` / `actuator_events` / `alerts`
  และ update `commands.acked_at` (งานส่วนนี้เป็น firmware — นอกขอบเขต PR นี้)

## วิธี run ใน Supabase

1. สร้างโปรเจกต์ใหม่ที่ [supabase.com](https://supabase.com) (หรือใช้โปรเจกต์เดิม)
2. เปิด **SQL Editor** ในหน้า dashboard ของโปรเจกต์
3. copy เนื้อหาทั้งไฟล์ `supabase/migrations/001_init.sql` มาวางแล้วกด **Run**
   - ไฟล์นี้ idempotent — รันซ้ำได้ปลอดภัย (ใช้ `create table if not exists`,
     `on conflict do nothing`, เช็คก่อน add publication)
4. ตรวจว่า Realtime เปิดแล้วจริง: **Database → Replication → supabase_realtime**
   ควรเห็น `sensor_readings`, `actuator_events`, `commands`, `alerts` อยู่ในลิสต์
   (migration เพิ่มให้อัตโนมัติผ่าน `alter publication supabase_realtime add table ...`
   ไม่ต้องกดปุ่ม toggle ในหน้า UI เอง แต่เข้าไปดูยืนยันได้)
5. เก็บค่า 2 ตัวจาก **Project Settings → API** ไปตั้งใน frontend (ดูหัวข้อถัดไป):
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **ห้ามเอา `service_role` key ไปใส่ env ที่ prefix `NEXT_PUBLIC_*` เด็ดขาด**
     (ค่า `NEXT_PUBLIC_*` ทุกตัวถูกฝังไปในโค้ด client ที่ browser ดาวน์โหลดได้)

## ตั้งค่า env ใน Vercel (frontend)

Vercel → โปรเจกต์ frontend → **Settings → Environment Variables**:

| ตัวแปร | ค่า | หมายเหตุ |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL จาก Supabase | ตั้งค่านี้ (+ ตัวถัดไป) แล้ว frontend จะสลับไปโหมด Supabase realtime อัตโนมัติ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon public` key จาก Supabase | anon key เท่านั้น |
| `NEXT_PUBLIC_HOUSE_ID` | `house-01` (ค่าเริ่มต้น) | ต้องตรงกับ `id` ใน `houses` ที่ seed ไว้ |

ถ้าไม่ตั้ง 2 ตัวแรก frontend จะ fallback ไปโหมดเดิม (backend REST ถ้ามี `NEXT_PUBLIC_API_URL`,
ไม่งั้น mock) — ดู `frontend/README.md` หัวข้อ "ลำดับความสำคัญของแหล่งข้อมูล"

## RLS สรุปสั้นๆ

| ตาราง | anon SELECT | anon INSERT | anon UPDATE/DELETE |
|---|---|---|---|
| houses, control_profiles, control_config, sensors, actuators | ✅ | ❌ | ❌ |
| sensor_readings, actuator_events, alerts | ✅ | ❌ (service_role เท่านั้น) | ❌ |
| commands | ✅ | ✅ (สั่ง manual, มี CHECK คุม `action`/`ttl_sec`) | ❌ |

`service_role` bypass RLS ทั้งหมดโดย default ของ Supabase — ไม่ต้องเขียน policy ให้ฝั่ง ESP32 เพิ่ม
แค่ห้ามเอา key นี้มาใช้ใน frontend
