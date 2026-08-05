-- ============================================================================
-- supabase/migrations/009_alert_threshold.sql
-- แยก "ค่าเกณฑ์ alert" ออกจาก setpoint (ค่าคุมโหมด AUTO) — เพิ่มคอลัมน์ threshold ใน alert_config
-- + seed code ความชื้น (RH_HIGH/RH_LOW) ที่ 008 ยังไม่มี
--
-- ⚠️ threshold คุมแค่ "เมื่อไหร่เด้งเตือน" ไม่ใช่ "เมื่อไหร่กันพัง" — safety interlock (ตัดปั๊ม/heater
--    ที่ setpoint) ทำงานเสมอ ไม่ขึ้นกับค่านี้ · RH alert = แจ้งอย่างเดียว ไม่ trip SAFE_HOLD
--
-- idempotent · ต้องมี 008 ก่อน (ตาราง alert_config)
-- ============================================================================

alter table alert_config add column if not exists threshold double precision;

comment on column alert_config.threshold is
  'ค่าเกณฑ์ที่ firmware ใช้ตัดสินว่าจะเด้งแจ้งเตือน code นี้ (แยกจาก setpoint คุม AUTO) — null สำหรับ code ที่ไม่มีเกณฑ์ (LOW_WATER)';

-- seed ค่าเริ่มต้น (= ค่าเดิมที่เคยใช้ ให้พฤติกรรมไม่เปลี่ยนจนกว่าจะแก้เอง) + เพิ่ม RH_HIGH/RH_LOW
-- ON CONFLICT: อัปเดต threshold เฉพาะแถวที่ยังเป็น null (ไม่ทับค่าที่ผู้ใช้ตั้งเองแล้ว)
insert into alert_config (house_id, code, enabled, threshold) values
  ('house-01', 'HOT', true, 38),
  ('house-01', 'BED_OVERHEAT', true, 40),
  ('house-01', 'RH_HIGH', true, 90),
  ('house-01', 'RH_LOW', true, 85),
  ('house-01', 'LOW_WATER', true, null)
on conflict (house_id, code) do update
  set threshold = coalesce(alert_config.threshold, excluded.threshold);
