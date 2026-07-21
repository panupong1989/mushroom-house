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
3. รันไฟล์ตามลำดับ `001_init.sql → 002_air_history.sql → 003_auth_rls.sql →
   004_retention_rollup.sql → 005_real_sensors.sql` — copy เนื้อหาทั้งไฟล์มาวางแล้วกด **Run**
   ทีละไฟล์ (ทุกไฟล์ idempotent — รันซ้ำได้ปลอดภัย ใช้ `create table if not exists`,
   `on conflict do nothing`, `create or replace function`, เช็คก่อน add publication ฯลฯ)
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

## เซนเซอร์จริงของ house-01 (`005_real_sensors.sql`)

โรงจริง: 2 แถว (row1/row2) × 3 ชั้น (top/mid/bottom) ยาว 7 เมตร — เซนเซอร์รวม 9 ตัว:

| kind | จำนวน | location | row_no | tier | หมายเหตุ |
|---|---|---|---|---|---|
| `bed_temp` (DS18B20 ในกอง) | 6 | head/mid/tail | 1, 2 | top/mid/bottom | ตัวอย่าง address: `row1_head_top` |
| `outside_temp` (DS18B20 นอกโรง) | 1 | `outside` | null | null | address = `outside` |
| `air_th` (RS485 T/RH ในโรง) | 2 | head/tail | null | null | มีอยู่แล้วจาก `001_init.sql` (addr `1`=head, addr `3`=tail) — 005 ไม่ insert ซ้ำ |

**DS18B20 ทั้ง 7 ตัว (bed_temp x6 + outside_temp x1) ต่อ 1-Wire บัสเดียวกัน** แต่ละตัวมี ROM id
ไม่ซ้ำที่รู้ได้เฉพาะตอนเสียบสายจริงหน้างาน — `sensors.address` เก็บ**ตำแหน่งเชิงตรรกะ** (คงที่ตั้งแต่
seed เช่น `row1_head_top`) ส่วน `sensors.rom_id` เก็บ**ที่อยู่ฮาร์ดแวร์ (1-wire ROM hex)** เป็น `null`
จนกว่าจะ commissioning หน้างานแล้ว map เข้าด้วยกัน:

```sql
update sensors set rom_id = '28XXXXXXXXXXXXXX'
where house_id = 'house-01' and address = 'row1_head_top';
```

ข้อดี: สลับโพรบเสีย/ต่อผิดจุดทีหลัง แก้แค่ `rom_id` โดย `id`/`address` (ที่ frontend/firmware อ้างอิง)
ไม่ต้องเปลี่ยน เซนเซอร์เดิมจาก `001_init.sql` (air_th mid ตัวเดิม + bed_temp single-row 3 ตัวเดิม)
ยังอยู่ครบ ไม่ถูกลบ/แก้ (ดูคอมเมนต์หัวไฟล์ `005_real_sensors.sql`) — เป็น legacy placeholder ที่ไม่ผูก
กับข้อมูลจริงใดๆ จนกว่าจะมี migration แยกมาเคลียร์ (ต้องรีวิวก่อนตามกติกา ห้ามลบข้อมูลใน migration นี้)

## RPC กราฟย้อนหลัง — `sensor_history` / `sensor_history_range` (`005_real_sensors.sql`)

`air_history` / `air_history_rollup` (002/004) ยังใช้งานได้ตามเดิม (เฉพาะ `air_th`, คืน
`temp_max`/`rh_avg` รวมทุกจุด) — ของใหม่เป็นฟังก์ชันทั่วไปที่ใช้ได้กับทุก `kind` และไม่ยุบรวมข้าม
เซนเซอร์ (จำเป็นสำหรับ `bed_temp` ที่มี 6 จุด ต้องได้เส้นกราฟแยกต่อจุด):

- `sensor_history(p_house_id, p_kind, p_since, p_bucket_seconds, p_use_rollup)` — ฟังก์ชันหลัก
  คืน `(bucket_ts, sensor_id, metric, v_min, v_max, v_avg)` ต่อ sensor ต่อ bucket
- `sensor_history_range(p_house_id, p_kind, p_range)` — เรียกง่ายกว่า ส่งแค่ชื่อช่วง
  `1h | 4h | 12h | 24h | week | month | year` แล้วฟังก์ชันเลือก bucket size + แหล่งข้อมูลให้เอง
  (`<=24h` อ่าน raw จาก `sensor_readings`, `week` ขึ้นไปอ่าน rollup รายชั่วโมงจาก
  `sensor_readings_hourly` ของ `004_retention_rollup.sql`)

ตัวอย่างเรียกจาก frontend (Supabase client):

```ts
const { data } = await supabase.rpc('sensor_history_range', {
  p_house_id: 'house-01',
  p_kind: 'bed_temp',
  p_range: '24h',
});
```
