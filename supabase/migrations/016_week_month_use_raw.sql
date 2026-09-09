-- ============================================================================
-- supabase/migrations/016_week_month_use_raw.sql
-- แก้บั๊ก: ปุ่มกราฟย้อนหลัง "สัปดาห์"/"เดือน" กดแล้วดูเหมือนไม่เปลี่ยน (issue #58)
--
-- สาเหตุ: sensor_history_range() เดิม (migration 005) ตั้ง v_rollup := true ให้ทั้ง
-- week/month/year เลย "สัปดาห์"(7 วัน) และ "เดือน"(30 วัน) ต้องพึ่ง sensor_readings_hourly
-- (ตาราง rollup) ทั้งที่ raw (sensor_readings) เก็บไว้ 30 วันอยู่แล้ว (migration 004) —
-- ถ้า pg_cron ยังไม่ได้เปิด (ต้องเปิดเองใน Database → Extensions ดู 004 ข้อ 5) หรือยังไม่ครบ
-- 7/30 วันตั้งแต่เปิด cron, ตาราง rollup จะว่าง/ไม่ครบ ทำให้ทั้ง 3 ปุ่มระยะยาวคืนแถวว่างเหมือนกัน
-- หน้าเว็บเลยโชว์ "ยังไม่มีข้อมูล" ซ้ำกันหมด ดูเหมือนกดแล้วไม่มีอะไรเกิดขึ้น
--
-- แก้: "สัปดาห์"/"เดือน" อยู่ในช่วง raw retention (30 วัน) อยู่แล้ว ให้อ่าน raw ตรงๆ
-- เหมือน 1h/4h/12h/24h ไม่ต้องพึ่ง rollup/cron เลย — เหลือแค่ "ปี" (365 วัน เกิน raw retention)
-- ที่ยังต้องพึ่ง sensor_readings_hourly จริงๆ (ยังต้องเปิด pg_cron ให้ rollup ทำงาน)
--
-- create or replace เท่านั้น ไม่แตะ/ไม่ลบข้อมูลเดิม — รันซ้ำได้ (idempotent)
-- ============================================================================

create or replace function sensor_history_range(
  p_house_id text,
  p_kind     text,
  p_range    text -- '1h' | '4h' | '12h' | '24h' | 'week' | 'month' | 'year'
)
returns table(
  bucket_ts timestamptz,
  sensor_id bigint,
  metric    text,
  v_min     double precision,
  v_max     double precision,
  v_avg     double precision
)
language plpgsql
stable
security invoker
as $$
declare
  v_since  timestamptz;
  v_bucket int;
  v_rollup boolean;
begin
  case p_range
    when '1h'   then v_since := now() - interval '1 hour';   v_bucket := 60;     v_rollup := false;  -- 1 นาที/จุด
    when '4h'   then v_since := now() - interval '4 hours';  v_bucket := 300;    v_rollup := false;  -- 5 นาที/จุด
    when '12h'  then v_since := now() - interval '12 hours'; v_bucket := 900;    v_rollup := false;  -- 15 นาที/จุด
    when '24h'  then v_since := now() - interval '24 hours'; v_bucket := 1800;   v_rollup := false;  -- 30 นาที/จุด
    when 'week'  then v_since := now() - interval '7 days';   v_bucket := 10800;  v_rollup := false;  -- 3 ชม./จุด — อยู่ใน raw retention (30 วัน) ไม่ต้องพึ่ง rollup
    when 'month' then v_since := now() - interval '30 days';  v_bucket := 43200;  v_rollup := false;  -- 12 ชม./จุด — เท่ากับขอบ raw retention พอดี ยังอ่าน raw ได้
    when 'year'  then v_since := now() - interval '365 days'; v_bucket := 604800; v_rollup := true;   -- 1 สัปดาห์/จุด — เกิน raw retention ต้องพึ่ง rollup จริง (ดู 004 ข้อ 5 เปิด pg_cron)
    else raise exception 'sensor_history_range: invalid p_range % (ต้องเป็น 1h|4h|12h|24h|week|month|year)', p_range;
  end case;

  return query
    select * from sensor_history(p_house_id, p_kind, v_since, v_bucket, v_rollup);
end;
$$;

grant execute on function sensor_history_range(text, text, text) to anon, authenticated;
