-- ============================================================================
-- supabase/migrations/002_air_history.sql
-- RPC สำหรับกราฟย้อนหลัง (read-only) — aggregate ฝั่ง DB เพราะ sensor_readings โตเร็ว
-- (firmware post ทุก ~20s) ดึงดิบมา bucket ฝั่ง client ไม่ไหว
-- idempotent (create or replace) — รันซ้ำได้; รันใน Supabase SQL editor ต่อจาก 001_init.sql
-- ============================================================================

-- คืนค่า air_th แบบ bucket ตามช่วงเวลา:
--   temp_max = ค่าสูงสุดต่อ bucket (สะท้อน airTempCtrl ที่ใช้คุม — docs/03-control-logic.md)
--   rh_avg   = ค่าเฉลี่ยความชื้นต่อ bucket
-- security invoker = เคารพ RLS เดิม (anon อ่าน sensor_readings/sensors ได้อยู่แล้ว) — ปลอดภัย
create or replace function air_history(
  p_house_id       text,
  p_since          timestamptz,
  p_bucket_seconds int
)
returns table(bucket_ts timestamptz, temp_max double precision, rh_avg double precision)
language sql
stable
security invoker
as $$
  select
    to_timestamp(floor(extract(epoch from r.ts) / greatest(p_bucket_seconds, 1)) * greatest(p_bucket_seconds, 1)) as bucket_ts,
    max(r.value) filter (where r.metric = 'temp') as temp_max,
    avg(r.value) filter (where r.metric = 'rh')  as rh_avg
  from sensor_readings r
  join sensors s on s.id = r.sensor_id
  where r.house_id = p_house_id
    and s.kind = 'air_th'
    and r.ts >= p_since
  group by 1
  order by 1;
$$;

grant execute on function air_history(text, timestamptz, int) to anon;
