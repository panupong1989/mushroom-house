-- ============================================================================
-- supabase/migrations/015_alert_notify_line.sql
-- เลือกได้เองว่าแจ้งเตือนชนิดไหน "ส่งเข้า LINE" ด้วย — ทั้งฝั่งสูงและฝั่งต่ำ (Beer 9 ส.ค.)
--
-- ปัญหาเดิม: ปลายทาง LINE ถูกกำหนดโดย env secret LINE_MIN_SEVERITY ของ Edge Function
-- ซึ่ง (ก) frontend อ่านไม่ได้ → หน้าเว็บได้แต่เดาจาก severity แล้วโกหกเมื่อ secret เปลี่ยน
--     (ข) เลือกรายตัวไม่ได้ → ตั้ง critical = ฝั่ง "ต่ำ" (COLD/BED_LOW) ไม่มีวันเข้า LINE
--
-- ย้ายการตัดสินใจลง DB เป็นคอลัมน์ต่อ code → หน้าเว็บแสดงความจริงและ toggle ได้รายตัว
--
-- ⚠️ ไม่แตะ control/safety — คุมแค่ "ส่งข้อความไปไหน" · interlock ทั้งหมดอยู่ที่ ESP32 เหมือนเดิม
-- ⚠️ ค่า default = true (ส่งทุกชนิด) — fail-safe คือ "ได้รับแจ้งเตือน" ไม่ใช่ "เงียบ"
--    ผู้ใช้ค่อยปิดตัวที่ไม่อยากได้เอง
--
-- เพิ่มคอลัมน์อย่างเดียว ไม่ลบ/ไม่แก้ข้อมูลเดิม · idempotent
-- ต้องมี 008 (ตาราง alert_config) ก่อน
-- ============================================================================

alter table alert_config add column if not exists notify_line boolean not null default true;

comment on column alert_config.notify_line is
  'ส่งแจ้งเตือนชนิดนี้เข้า LINE ไหม — notify-line Edge Function อ่านคอลัมน์นี้เป็นหลัก '
  '(ถ้าอ่าน DB ไม่ได้ค่อย fallback ไปใช้ env LINE_MIN_SEVERITY) · ไม่กระทบ control/safety';

-- notify-line เรียกด้วย service_role (bypass RLS) จึงไม่ต้องเพิ่ม policy อ่าน
-- ส่วน dashboard ใช้ policy เดิมของ alert_config จาก 008 (anon อ่าน / authenticated เขียน)
