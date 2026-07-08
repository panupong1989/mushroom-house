# frontend — Dashboard ควบคุมโรงเพาะเห็ดฟาง (v1)

Next.js (App Router) + TypeScript + Tailwind CSS สำหรับหน้า Monitor + ควบคุม AUTO/MANUAL
เรียกข้อมูลจาก `backend/` ผ่าน REST (ดู `docs/05-api.md`) — ไม่มี server-side logic ของตัวเอง

## รัน dev

```bash
cd frontend
cp .env.example .env.local   # ปล่อย NEXT_PUBLIC_API_URL ว่างไว้ = โหมด mock, หรือแก้ให้ชี้ backend จริง
npm install
npm run dev
```

เปิด http://localhost:3000 (ถ้า backend รันที่ port เดียวกัน ให้เปลี่ยน `next dev -p 3001` หรือแก้ backend PORT)

## โหมด mock-data (ไม่ต้องมี backend)

ถ้าไม่ได้ตั้ง `NEXT_PUBLIC_API_URL` frontend จะเข้า **โหมด mock อัตโนมัติ** — `lib/api.ts` จะอ่านข้อมูลจาก
`lib/mock.ts` แทนการ fetch backend จริง ได้แก่:

- `/latest` จำลอง: อุณหภูมิ/ความชื้นอากาศ 3 จุด (head/mid/tail), กองเห็ด 3 จุด, ระดับน้ำ, mode, สถานะ actuator
  โดยแกว่งค่าตามเวลาจริงแบบเดียวกับ `backend/scripts/mock-telemetry.ts` (sine 26-34°C, กลางคืนเย็นลง)
- กดปุ่มสั่งอุปกรณ์: จำลอง response ให้ครบทุกแบบ (สำเร็จ / **ถูกปฏิเสธ 409** ตามกฎ interlock เดียวกับ
  `backend/src/services/commandGuard.ts` — เช่น เปิดพ่นหมอกตอนอุณหภูมิ < 27.5°C หรือน้ำต่ำ)

ใช้ `NEXT_PUBLIC_USE_MOCK=true|false` บังคับโหมดตรงๆ ได้ถ้าต้องการ override ค่าเริ่มต้น (ดู `.env.example`)

## ตัวแปรแวดล้อม

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | (ว่าง → mock) | URL ของ backend (ไม่มี `/` ต่อท้าย) ถ้าตั้งค่านี้จะปิดโหมด mock อัตโนมัติ |
| `NEXT_PUBLIC_HOUSE_ID` | `house-01` | house id ที่จะแสดง ต้องตรงกับ `HOUSE_ID` ฝั่ง backend / `db/seed.sql` |
| `NEXT_PUBLIC_USE_MOCK` | (ว่าง → true ถ้าไม่มี `NEXT_PUBLIC_API_URL`, false ถ้ามี) | บังคับโหมด mock ตรงๆ: `true` หรือ `false` |

## Deploy บน Vercel

### แบบ mock (ยังไม่มี backend — ดูจากมือถือได้ทันที)

1. Import repo เข้า Vercel แล้วตั้ง **Root Directory = `frontend`**
2. ไม่ต้องตั้ง `NEXT_PUBLIC_API_URL` เลย — ปล่อยว่างไว้
3. Deploy ตามปกติ (`next build` ค่า default) — เปิดลิงก์ preview จากมือถือจะเห็นข้อมูลจำลองวิ่งและกดปุ่มได้ทันที

### แบบต่อ backend จริง

1. Import repo เข้า Vercel แล้วตั้ง **Root Directory = `frontend`**
2. ตั้ง Environment Variable `NEXT_PUBLIC_API_URL` ให้ชี้ backend ที่ deploy ไว้จริง (ต้องเข้าถึงได้จากอินเทอร์เน็ต)
3. ฝั่ง backend ต้องตั้ง env `CORS_ORIGIN` ให้รวมโดเมน Vercel ของ frontend (ดู `backend/README.md` +
   root `.env.example`) ไม่งั้น browser จะ block request ข้ามโดเมน
4. Build Command / Output ใช้ค่า default ของ Next.js (`next build`)
5. `NEXT_PUBLIC_HOUSE_ID` ตั้งถ้าต้องการ override จาก `house-01`
6. `NEXT_PUBLIC_USE_MOCK=false` ตั้งชัดๆ ได้ถ้าต้องการกันเหนียว (ปกติปล่อยว่างพอ เพราะมี `NEXT_PUBLIC_API_URL` แล้ว)

## โครงสร้าง

```
app/            หน้า Monitor (App Router, client component เดียว — poll ทุก 4s)
components/     UI components (gauge, card, ปุ่มควบคุม, toggle, toast)
lib/api.ts      fetch wrapper เรียก backend (หรือสลับไปโหมด mock — ดู USE_MOCK)
lib/mock.ts     จำลอง telemetry + response คำสั่งอุปกรณ์สำหรับโหมด mock (ไม่ต้องมี backend)
lib/derive.ts   แปลง GET /houses/:id/latest ดิบ -> ค่าที่ใช้แสดงผล (max/avg ตาม docs/03-control-logic.md)
lib/interlock.ts คำเตือนล่วงหน้าฝั่ง UI (best-effort) — ของจริงอิงคำตอบจาก backend เสมอ
lib/constants.ts ค่าตั้งต้น/label/threshold fallback
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
  (ตาม TODO ใน `backend/src/mqtt/client.ts`)
- realtime ใช้ polling ทุก 4s (`lib/hooks.ts` `useLatest`) — โครงสร้างแยก fetch ไว้ใน `lib/api.ts` แล้ว
  พร้อมเปลี่ยนเป็น SSE/WebSocket ทีหลังโดยไม่ต้องแก้ component
- ยังไม่มีหน้า config/setpoint editor หรือ alerts — ทำเฉพาะหน้า Monitor + AUTO/MANUAL ตามสเปก v1
- โหมด mock (`lib/mock.ts`) เป็นข้อมูลจำลองฝั่ง client ล้วนๆ ไม่ได้เชื่อม backend/DB จริง ใช้สำหรับ demo/preview เท่านั้น
