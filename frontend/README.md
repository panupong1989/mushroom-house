# frontend — Dashboard ควบคุมโรงเพาะเห็ดฟาง (v1)

Next.js (App Router) + TypeScript + Tailwind CSS สำหรับหน้า Monitor + ควบคุม AUTO/MANUAL
เรียกข้อมูลจาก `backend/` ผ่าน REST (ดู `docs/05-api.md`) — ไม่มี server-side logic ของตัวเอง

## รัน dev

```bash
cd frontend
cp .env.example .env.local   # แก้ NEXT_PUBLIC_API_URL ให้ชี้ backend จริง
npm install
npm run dev
```

เปิด http://localhost:3000 (ถ้า backend รันที่ port เดียวกัน ให้เปลี่ยน `next dev -p 3001` หรือแก้ backend PORT)

## ตัวแปรแวดล้อม

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` | URL ของ backend (ไม่มี `/` ต่อท้าย) |
| `NEXT_PUBLIC_HOUSE_ID` | `house-01` | house id ที่จะแสดง ต้องตรงกับ `HOUSE_ID` ฝั่ง backend / `db/seed.sql` |

## Deploy บน Vercel

1. Import repo เข้า Vercel แล้วตั้ง **Root Directory = `frontend`**
2. ตั้ง Environment Variable `NEXT_PUBLIC_API_URL` ให้ชี้ backend ที่ deploy ไว้จริง (ต้องเข้าถึงได้จากอินเทอร์เน็ต/เปิด CORS)
3. Build Command / Output ใช้ค่า default ของ Next.js (`next build`)
4. `NEXT_PUBLIC_HOUSE_ID` ตั้งถ้าต้องการ override จาก `house-01`

backend ปัจจุบันยังไม่ได้เปิด CORS header — ถ้า deploy frontend คนละโดเมนกับ backend ต้องเพิ่ม CORS middleware
ฝั่ง backend ก่อน (นอกขอบเขตงานนี้ — ไม่ได้แตะ backend เดิมส่วนนี้)

## โครงสร้าง

```
app/            หน้า Monitor (App Router, client component เดียว — poll ทุก 4s)
components/     UI components (gauge, card, ปุ่มควบคุม, toggle, toast)
lib/api.ts      fetch wrapper เรียก backend
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
- ยังไม่มี CORS ฝั่ง backend สำหรับ cross-origin request (จำเป็นถ้า frontend/backend อยู่คนละโดเมนบน Vercel)
- ยังไม่มีหน้า config/setpoint editor หรือ alerts — ทำเฉพาะหน้า Monitor + AUTO/MANUAL ตามสเปก v1
