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
3. หา **userId ปลายทาง** (= `LINE_TO_IDS`):
   - วิธีง่าย: เปิด webhook ชั่วคราว/ใช้ bot log ดู `source.userId` เมื่อทักหา OA, หรือ
   - ส่งเข้า **กลุ่ม**: เชิญ OA เข้ากลุ่ม แล้วใช้ `groupId` (push รองรับทั้ง user/group id)

> ⚠️ token/userId = **secret** ห้าม commit — ตั้งผ่าน `supabase secrets set` เท่านั้น (ค่าอยู่บน edge ไม่โผล่ใน repo)

## 2) ตั้ง secrets + deploy
```bash
supabase link --project-ref <your-ref>
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN="xxxx"
supabase secrets set LINE_TO_IDS="Uxxxx,Cxxxx"      # คั่นด้วย , (หลาย id ได้)
supabase secrets set LINE_MIN_SEVERITY="critical"    # optional: info|warn|critical
supabase secrets set WEBHOOK_SECRET="สุ่มยาวๆ"        # optional แต่แนะนำ (กันเรียกมั่ว)
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

## หมายเหตุ
- default ส่งเฉพาะ `critical` (ปรับ `LINE_MIN_SEVERITY`) — กัน spam จาก info/warn
- ตอนนี้ trigger ที่ INSERT เท่านั้น (แจ้งตอน "เกิด") — ไม่แจ้งตอน resolved (เพิ่มทีหลังได้)
- interlock/safety ทั้งหมดยังอยู่ที่ ESP32 — LINE เป็นแค่ปลายทางแจ้งเตือน ไม่ใช่ authority
