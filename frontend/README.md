# frontend — Dashboard ควบคุมโรงเพาะเห็ดฟาง (v1)

Next.js (App Router) + TypeScript + Tailwind CSS สำหรับหน้า Monitor + ควบคุม AUTO/MANUAL
ต่อข้อมูลได้ 2 สถาปัตยกรรม (ดู `CLAUDE.md`):

- **โหมด Internet** — คุย [Supabase](https://supabase.com) ตรงๆ ผ่าน realtime (`lib/supabaseClient.ts` +
  `lib/supabaseData.ts`) ไม่ผ่าน backend/MQTT เลย — ดู schema/RLS ที่ `supabase/README.md`
- **โหมด Local** — เรียก `backend/` ผ่าน REST (ดู `docs/05-api.md`), poll ทุก 4 วินาที

ไม่มี server-side logic ของตัวเองทั้งสองโหมด — เลือกโหมดอัตโนมัติจาก env (ดู "ลำดับความสำคัญของแหล่งข้อมูล"
ด้านล่าง)

## รัน dev

```bash
cd frontend
cp .env.example .env.local   # ปล่อยว่างทั้งหมด = โหมด mock, หรือตั้ง Supabase/NEXT_PUBLIC_API_URL ตามต้องการ
npm install
npm run dev
```

เปิด http://localhost:3000 (ถ้า backend รันที่ port เดียวกัน ให้เปลี่ยน `next dev -p 3001` หรือแก้ backend PORT)

## ลำดับความสำคัญของแหล่งข้อมูล

`lib/api.ts` / `lib/hooks.ts` เลือกแหล่งข้อมูลตามลำดับนี้ (เช็คตอน build/runtime จาก env):

1. **Supabase** — ถ้าตั้งทั้ง `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY` ครบ
   → subscribe realtime จาก Supabase (`lib/supabaseData.ts`)
2. **backend REST** — ถ้าไม่มี Supabase แต่ตั้ง `NEXT_PUBLIC_API_URL` → poll `backend/` ทุก 4 วินาที (เดิม)
3. **mock** — ถ้าไม่ตั้งอะไรเลย → ข้อมูลจำลองฝั่ง client (`lib/mock.ts`)

`NEXT_PUBLIC_USE_MOCK=true|false` บังคับโหมด mock ตรงๆ ได้เสมอ (ข้ามลำดับด้านบนทั้งหมด) ใช้ตอนดีบัก

## โหมด mock-data (ไม่ต้องมี backend/Supabase)

ถ้าไม่ได้ตั้งทั้ง Supabase และ `NEXT_PUBLIC_API_URL` frontend จะเข้า **โหมด mock อัตโนมัติ** —
`lib/api.ts` จะอ่านข้อมูลจาก `lib/mock.ts` แทนการ fetch backend/Supabase จริง ได้แก่:

- `/latest` จำลอง: อุณหภูมิ/ความชื้นอากาศ 3 จุด (head/mid/tail), กองเห็ด 3 จุด, ระดับน้ำ, mode, สถานะ actuator
  โดยแกว่งค่าตามเวลาจริงแบบเดียวกับ `backend/scripts/mock-telemetry.ts` (sine 26-34°C, กลางคืนเย็นลง)
- กดปุ่มสั่งอุปกรณ์: จำลอง response ให้ครบทุกแบบ (สำเร็จ / **ถูกปฏิเสธ 409** ตามกฎ interlock เดียวกับ
  `backend/src/services/commandGuard.ts` — เช่น เปิดพ่นหมอกตอนอุณหภูมิ < 27.5°C หรือน้ำต่ำ)

ใช้ `NEXT_PUBLIC_USE_MOCK=true|false` บังคับโหมดตรงๆ ได้ถ้าต้องการ override ค่าเริ่มต้น (ดู `.env.example`)

## โหมด Supabase (Internet)

ตั้ง `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ดูวิธีสร้าง schema/หา key ที่
`supabase/README.md`) แล้ว frontend จะ:

- subscribe realtime (`postgres_changes`) จากตาราง `sensor_readings` / `actuator_events` / `houses`
  (mode) แทนการ poll — เห็นค่าล่าสุดทันทีที่มีแถวใหม่ ไม่ต้องรอ 4 วินาที
- ปุ่มสั่งอุปกรณ์ (โหมด MANUAL) = insert แถวลงตาราง `commands` ตรงๆ ผ่าน `anon` key (มี RLS คุม —
  อ่านได้ทุกตาราง, insert ได้เฉพาะ `commands`) แสดงผล "ส่งคำสั่งแล้ว — รอ ESP32 รับคำสั่ง" ทันที
  (ยังไม่ใช่ ack ว่าอุปกรณ์ทำงานจริง — ของนั้นต้องรอ firmware อ่านตาราง `commands` ทีหลัง นอกขอบเขต PR นี้)
- ค่า setpoint (`GET config`) อ่านจากตาราง `control_config` ตาม `houses.active_profile` ครั้งเดียวตอน mount
  (ไม่ realtime เพราะเปลี่ยนไม่บ่อย — เหมือนโหมด backend REST เดิม)

**ห้ามใส่ `service_role` key ใน env ที่ขึ้นต้นด้วย `NEXT_PUBLIC_*` เด็ดขาด** — ทุกค่าที่ prefix นี้ถูกฝังใน
โค้ดที่ browser ดาวน์โหลดได้ ใช้ `anon` (public) key เท่านั้น

## ตัวแปรแวดล้อม

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | (ว่าง) | Project URL จาก Supabase — ตั้งคู่กับตัวถัดไปเพื่อเปิดโหมด Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (ว่าง) | `anon public` key จาก Supabase (ห้ามใช้ `service_role`) |
| `NEXT_PUBLIC_API_URL` | (ว่าง → mock) | URL ของ backend (ไม่มี `/` ต่อท้าย) — ใช้เมื่อไม่ได้ตั้ง Supabase |
| `NEXT_PUBLIC_HOUSE_ID` | `house-01` | house id ที่จะแสดง ต้องตรงกับ seed (Supabase หรือ backend `db/seed.sql`) |
| `NEXT_PUBLIC_USE_MOCK` | (ว่าง → true ถ้าไม่มี Supabase/`NEXT_PUBLIC_API_URL`, false ถ้ามี) | บังคับโหมด mock ตรงๆ: `true` หรือ `false` |

## Deploy บน Vercel

### แบบ mock (ยังไม่มี backend/Supabase — ดูจากมือถือได้ทันที)

1. Import repo เข้า Vercel แล้วตั้ง **Root Directory = `frontend`**
2. ไม่ต้องตั้ง env ใดๆ เลย — ปล่อยว่างไว้
3. Deploy ตามปกติ (`next build` ค่า default) — เปิดลิงก์ preview จากมือถือจะเห็นข้อมูลจำลองวิ่งและกดปุ่มได้ทันที

### แบบต่อ Supabase จริง (โหมด Internet — แนะนำ)

1. รัน `supabase/migrations/001_init.sql` ใน Supabase SQL editor ก่อน (ดูขั้นตอนละเอียดที่ `supabase/README.md`)
2. Import repo เข้า Vercel แล้วตั้ง **Root Directory = `frontend`**
3. ตั้ง Environment Variable ใน Vercel (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL จาก Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `anon public` key จาก Supabase
   - `NEXT_PUBLIC_HOUSE_ID` = `house-01` (หรือ house id อื่นที่ seed ไว้)
4. Build Command / Output ใช้ค่า default ของ Next.js (`next build`) — deploy ตามปกติ

### แบบต่อ backend จริง (โหมด Local — ผ่าน REST เดิม)

1. Import repo เข้า Vercel แล้วตั้ง **Root Directory = `frontend`**
2. ตั้ง Environment Variable `NEXT_PUBLIC_API_URL` ให้ชี้ backend ที่ deploy ไว้จริง (ต้องเข้าถึงได้จากอินเทอร์เน็ต)
3. ฝั่ง backend ต้องตั้ง env `CORS_ORIGIN` ให้รวมโดเมน Vercel ของ frontend (ดู `backend/README.md` +
   root `.env.example`) ไม่งั้น browser จะ block request ข้ามโดเมน
4. Build Command / Output ใช้ค่า default ของ Next.js (`next build`)
5. `NEXT_PUBLIC_HOUSE_ID` ตั้งถ้าต้องการ override จาก `house-01`
6. `NEXT_PUBLIC_USE_MOCK=false` ตั้งชัดๆ ได้ถ้าต้องการกันเหนียว (ปกติปล่อยว่างพอ เพราะมี `NEXT_PUBLIC_API_URL` แล้ว)

## โครงสร้าง

```
app/                  หน้า Monitor (App Router, client component เดียว)
components/           UI components (gauge, card, ปุ่มควบคุม, toggle, toast)
lib/api.ts            เลือกแหล่งข้อมูล: Supabase > backend REST > mock (ดู USE_MOCK/SUPABASE_ENABLED)
lib/supabaseClient.ts สร้าง Supabase client จาก NEXT_PUBLIC_SUPABASE_URL/ANON_KEY (โหมด Internet)
lib/supabaseData.ts   realtime subscribe + insert commands + อ่าน config จาก Supabase
lib/mock.ts            จำลอง telemetry + response คำสั่งอุปกรณ์สำหรับโหมด mock (ไม่ต้องมี backend)
lib/derive.ts          แปลงข้อมูลดิบ (backend REST หรือ Supabase) -> ค่าที่ใช้แสดงผล
                        (max/avg ตาม docs/03-control-logic.md)
lib/interlock.ts       คำเตือนล่วงหน้าฝั่ง UI (best-effort) — ของจริงอิงคำตอบจาก backend/firmware เสมอ
lib/constants.ts       ค่าตั้งต้น/label/threshold fallback
```

## พฤติกรรม AUTO/MANUAL ที่สำคัญ

- ปุ่มสลับ AUTO/MANUAL เป็น **ระดับระบบ** ไม่ใช่ต่ออุปกรณ์ (ตามสเปก)
- สลับ **MANUAL -> AUTO**: frontend จะยิง `POST /actuators/:kind/command {action:'auto'}` ให้ครบทุกอุปกรณ์ทันที
  เพื่อเคลียร์ manual override ที่ค้างและให้ control loop (ESP32) กลับมาคุมเอง — ดู `app/page.tsx` (`setSystemMode`)
- โหมด MANUAL: ปุ่ม [เปิด] ส่ง `ttl_sec` สูงสุดที่ backend ยอมรับ (3600s) เพื่อให้พฤติกรรมใกล้เคียง "เปิดค้าง" มากที่สุด
  โดยไม่แก้ backend/firmware เดิม — **TODO(CC): ถ้าต้องการ manual hold แบบไม่มีวันหมดอายุจริง ต้องเพิ่มการรองรับ
  `ttl_sec` แบบไม่หมดอายุ (เช่น 0/null) ที่ backend + firmware** (นอกขอบเขตงานนี้)
- ระบบแสดงสถานะจริงจาก firmware (`mode` ใน `/latest`: BOOT/SELFTEST/SPAWN_RUN/FRUITING/MANUAL/SAFE_HOLD) แยกจาก
  ตัวสลับโหมดฝั่ง UI เสมอ ถ้า mode เป็น `SAFE_HOLD` ปุ่มควบคุมอุปกรณ์จะถูกล็อกทั้งหมดไม่ว่าจะอยู่โหมดใด

## Feedback ตอนสั่งอุปกรณ์

ปุ่มแต่ละอุปกรณ์แสดงสถานะ: กำลังส่ง -> สำเร็จ / ล้มเหลว(ออฟไลน์) / **ถูกปฏิเสธ (พร้อมเหตุผล)**
คำตอบ "ถูกปฏิเสธ" อ่านจาก HTTP 409 `{ok:false, code, reason}` ของ `POST /actuators/:kind/command`
(เพิ่ม gate นี้ใน backend แล้วในคอมมิตแยก — `backend/src/services/commandGuard.ts` — บังคับใช้กฎเหล็ก
"น้ำต่ำ/กองร้อน>40/หนาว<27.5 ห้ามพ่น" และ heater/mist ห้าม ON พร้อมกัน โดยไม่แก้ `control.ts`/firmware เดิม)

## TODO / ที่ยังเป็น mock หรือยังไม่ทำ

- `docs/05-api.md` ไม่มี field บอก "online" ตรงๆ — คำนวณจาก `now - last_ts` ในฝั่ง frontend (`lib/derive.ts`,
  threshold 30s ใน `lib/constants.ts`) TODO(CC): เปลี่ยนไปใช้ heartbeat จริงเมื่อ backend เก็บ online status
  (ตาม TODO ใน `backend/src/mqtt/client.ts`) — ใช้ threshold เดียวกันในโหมด Supabase ด้วย
- โหมด backend REST/mock ใช้ polling ทุก 4s (`lib/hooks.ts` `useLatest`) ยังเหมือนเดิม — โหมด Supabase
  เปลี่ยนเป็น realtime subscription แล้ว (`lib/supabaseData.ts` `subscribeSupabaseLatest`)
- ยังไม่มีหน้า config/setpoint editor หรือ alerts UI — ทำเฉพาะหน้า Monitor + AUTO/MANUAL ตามสเปก v1
  (ตาราง `alerts` เปิด Realtime ไว้แล้วฝั่ง schema พร้อมต่อ UI ทีหลัง)
- โหมด mock (`lib/mock.ts`) เป็นข้อมูลจำลองฝั่ง client ล้วนๆ ไม่ได้เชื่อม backend/DB จริง ใช้สำหรับ demo/preview เท่านั้น
- โหมด Supabase: การสั่งอุปกรณ์เป็นแค่ insert ลงตาราง `commands` (accept แล้ว = "ส่งคำสั่งแล้ว") ยังไม่มี
  ack/interlock reject กลับมาแบบ synchronous เหมือน backend REST (409) เพราะ firmware ที่อ่านตารางนี้ยังไม่ทำ
  (TODO(CC), นอกขอบเขต PR นี้) — คำเตือนล่วงหน้าจาก `lib/interlock.ts` (client-side, best-effort) ยังทำงานเหมือนเดิม
