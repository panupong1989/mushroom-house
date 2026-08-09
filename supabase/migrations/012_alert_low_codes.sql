-- ============================================================================
-- supabase/migrations/012_alert_low_codes.sql
-- เพิ่มเกณฑ์แจ้งเตือน "ต่ำเกิน" 2 ตัว (ตามที่ Beer ขอ 9 ส.ค.):
--   COLD    = อากาศต่ำเกิน  (T_air ต่ำกว่าเกณฑ์)
--   BED_LOW = กองต่ำเกิน    (T_bed ต่ำกว่าเกณฑ์)
--
-- ⚠️ ไม่แตะ interlock — "T_air < 27.5°C ห้ามพ่นหมอก" ยังบังคับใน firmware เสมอ ไม่ว่าจะเปิด/ปิด
--    การแจ้งเตือน COLD หรือไม่ (safety.cpp/control_fsm.cpp) · ตารางนี้คุมแค่ "เด้งเตือนไหม"
--
-- ⚠️ ต้อง flash firmware ที่รู้จัก 2 code นี้ก่อนถึงจะมี alert เข้าจริง (main.cpp notify_check)
--    รัน migration นี้ก่อนได้เลย — ตั้งค่า/เกณฑ์เก็บรอไว้ ไม่พังอะไร
--
-- เพิ่มแถวใหม่เท่านั้น ไม่ลบ/ไม่แก้ของเดิม · idempotent (on conflict do nothing)
-- ต้องมี 008 (ตาราง alert_config) + 009 (คอลัมน์ threshold) ก่อน
-- ============================================================================

insert into alert_config (house_id, code, enabled, threshold) values
  ('house-01', 'COLD',    true, 27.5),   -- ต่ำกว่านี้ = เย็นเกินสำหรับออกดอก (ตรงกับ temp_heater_on)
  ('house-01', 'BED_LOW', true, 30.0)    -- กองเย็นเกิน = เชื้อเดินช้า
on conflict (house_id, code) do nothing;
