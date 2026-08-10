# notify-line — Edge Function ส่งแจ้งเตือนเข้า LINE

push แจ้งเตือน (default เฉพาะ `critical`) จากตาราง `alerts` เข้า LINE ของคุณ/พี่ชาย
ผ่าน **Database Webhook → Edge Function → LINE Messaging API**

```
ESP32 (service_role) insert alerts  →  Database Webhook (INSERT)  →  notify-line  →  LINE push
```

## 1) สร้าง LINE Messaging API channel
1. [LINE Developers Console](https://developers.line.biz/console/) → สร้าง Provider → สร้าง channel แบบ **Messaging API**
2. แท็บ **Messaging API**:
   - **Channel access token (long-lived)** → กด Issue → เก็บไว้ (= `LINE_CHANNEL_ACCESS_TOKEN`)
   - เพิ่มเพื่อน LINE OA นี้ (สแกน QR) ทั้งคุณและพี่ชาย
3. **ปลายทาง** — เลือกทางใดทางหนึ่ง:
   - **แนะนำ (ง่ายสุด): ไม่ต้องตั้ง `LINE_TO_IDS` เลย** → function จะใช้ `broadcast` ส่งหาเพื่อนทุกคน
     ของ OA อัตโนมัติ · เหมาะกับ OA ส่วนตัวที่มีแค่คนในบ้านเป็นเพื่อน ไม่ต้องไปหา userId
   - หรือระบุเจาะจง: ตั้ง `LINE_TO_IDS` เป็น userId/groupId (คั่นด้วย `,`) → ใช้ `push` แทน

> ⚠️ token = **secret** ห้าม commit — ตั้งผ่าน `supabase secrets set` เท่านั้น (ค่าอยู่บน edge ไม่โผล่ใน repo)

## 2) ตั้ง secrets + deploy
```bash
supabase link --project-ref <your-ref>
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN="xxxx"
supabase secrets set LINE_MIN_SEVERITY="critical"    # optional: info|warn|critical (ทางสำรอง)
supabase secrets set LINE_DEDUP_MINUTES="15"         # optional: กันข้อความซ้ำ (default 15, 0=ปิด)
supabase secrets set WEBHOOK_SECRET="สุ่มยาวๆ"        # optional แต่แนะนำ (กันเรียกมั่ว)
# LINE_TO_IDS: ข้ามได้ (ไม่ตั้ง = broadcast หาเพื่อนทุกคนของ OA)
supabase functions deploy notify-line --no-verify-jwt
```
`--no-verify-jwt` เพราะ Database Webhook เรียกตรง (ไม่ได้ส่ง JWT ของ user) — ใช้ `WEBHOOK_SECRET` กันแทน

## 3) ตั้ง Database Webhook (INSERT alerts → เรียก function)
Dashboard → **Database → Webhooks → Create**:
- Table: `alerts` · Events: **Insert**
- Type: **Supabase Edge Function** → `notify-line` (หรือ HTTP POST ไป `https://<ref>.functions.supabase.co/notify-line`)
- HTTP Headers: เพิ่ม `x-webhook-secret: <ค่าเดียวกับ WEBHOOK_SECRET>` (ถ้าตั้งไว้)

## 4) ทดสอบ
insert alert ทดสอบใน SQL editor (หรือรอ ESP32 ยิงจริง):
```sql
insert into alerts (house_id, severity, code, message)
values ('house-01', 'critical', 'LOW_WATER', 'ทดสอบแจ้งเตือน LINE');
```
ควรได้ข้อความเข้า LINE ภายในไม่กี่วินาที — ถ้าไม่เข้า ดู Logs: Dashboard → Edge Functions → notify-line → Logs

## กันข้อความซ้ำ (dedup)

ถ้าค่าเซนเซอร์แกว่งคาบเกณฑ์ ESP32 จะยิง alert รัวๆ (เจอจริง 10 ส.ค. 69: `HOT` เกิด 3 แถวใน 36 วิ
ตอนอุณหภูมิเด้ง 32.9 ↔ 33.0 ที่เกณฑ์ 33.0 · ก่อนหน้านั้น `RH_HIGH` ยิง 18 ครั้งใน 12 นาที)

function จะ **ข้ามไม่ push** ถ้ามี alert `(house_id, code)` เดิมเกิดขึ้นแล้วภายใน `LINE_DEDUP_MINUTES`
นาที (default 15) — แถวยังถูกบันทึกใน `alerts` ครบเหมือนเดิม แค่ไม่ยิง LINE ซ้ำ

- ปุ่ม 🧪 **ทดสอบ** ในหน้าตั้งค่า **ไม่โดน dedup** (กดกี่ครั้งก็เด้ง) — ดูจาก `🧪` ใน message
- ตั้ง `LINE_DEDUP_MINUTES="0"` = ปิด dedup
- นี่คือการกันที่ **ปลายทาง** · ต้นเหตุจริงคือเฟิร์มแวร์ไม่มี hysteresis → แก้แล้วใน `notify_edge.cpp`
  (ต้องเอาบอร์ดไปแฟลชหน้างาน โปรเจกต์ไม่มี OTA) · ถึงแฟลชแล้วก็เก็บชั้นนี้ไว้เป็นตาข่ายชั้นสอง

## หมายเหตุ
- default ส่งเฉพาะ `critical` (ปรับ `LINE_MIN_SEVERITY`) — กัน spam จาก info/warn
- ตอนนี้ trigger ที่ INSERT เท่านั้น (แจ้งตอน "เกิด") — ไม่แจ้งตอน resolved (เพิ่มทีหลังได้)
- interlock/safety ทั้งหมดยังอยู่ที่ ESP32 — LINE เป็นแค่ปลายทางแจ้งเตือน ไม่ใช่ authority
