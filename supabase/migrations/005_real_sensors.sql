-- ============================================================================
-- supabase/migrations/005_real_sensors.sql
-- เฟสแรกของโรงจริง (2 แถว × 3 ชั้น ยาว 7 เมตร) — เพิ่ม field รองรับ ROM id (1-wire) +
-- ตำแหน่งแถว/ชั้น ของ DS18B20, เพิ่ม kind ใหม่ 'outside_temp', seed เซนเซอร์จริง 9 ตัว,
-- และเพิ่ม RPC กราฟย้อนหลังที่รองรับหลายช่วงเวลา + คืน min/max/avg ต่อ bucket
--
-- ไฟล์นี้ "เพิ่มเท่านั้น" — ไม่ลบ/ไม่ทับข้อมูลเดิม:
--   - sensors เดิม (3 air_th head/mid/tail จาก 001, 3 bed_temp head/mid/tail single-row จาก 001)
--     ยังอยู่ครบ ไม่ถูกแก้/ลบ — air_th 'head'/'tail' เดิมถูกนำมาใช้เป็น 2 ตัวจริงตามสเปกนี้พอดี
--     (ตัด addr='2'/location='mid' ทิ้งไม่ได้เพราะเป็นการลบข้อมูล — ปล่อยไว้เฉยๆ ไม่ผูกกับอะไร
--     ถ้า Beer อยากเคลียร์ทีหลังค่อยทำเป็น migration แยกที่ผ่านการรีวิว)
--   - bed_temp เดิม 3 ตัว (single-row สมมติฐานตอน scaffold) เป็น legacy placeholder ที่ไม่ตรงกับ
--     โรงจริง (2 แถว) — เพิ่มแถวใหม่ 6 ตัวสำหรับของจริงแทนที่จะแก้ของเดิม
-- idempotent — รันซ้ำได้ปลอดภัย; รันใน Supabase SQL editor ต่อจาก 001-004
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) sensors: เพิ่มคอลัมน์รองรับ ROM id (hardware) + ตำแหน่งแถว/ชั้น (logical)
--    - rom_id: 1-wire ROM address (hex 16 ตัวอักษร) ของ DS18B20 จริง — "ไม่รู้ตอน seed"
--      (ต้องเสียบสายแล้วอ่านค่าจากบอร์ดจริงหน้างานก่อน) จึงเป็น nullable กรอกทีหลังตอน
--      commissioning (ดู docs/07-install.md) ด้วย:
--        update sensors set rom_id = '28XXXXXXXXXXXXXX' where house_id='house-01' and address='row1_head_top';
--      address (เดิม, unique ต่อ house_id+kind) ทำหน้าที่เป็น "ตำแหน่งจริง" (logical) แทน —
--      ใช้ค่าที่คงที่ไม่ต้องรอฮาร์ดแวร์ เช่น 'row1_head_top' — ผูกกับ rom_id ทีหลังได้อิสระ
--      โดยไม่กระทบ id/address เดิม (สลับโพรบ/เปลี่ยนตัวเสีย แก้แค่ rom_id พอ)
--    - row_no: แถวที่ 1 หรือ 2 (เฉพาะ bed_temp ของโรงจริงที่มี 2 แถว) null = ไม่เกี่ยว (air_th/outside_temp)
--    - tier: ชั้นบน/กลาง/ล่าง (เฉพาะ bed_temp) null = ไม่เกี่ยว
-- ----------------------------------------------------------------------------

alter table sensors add column if not exists rom_id text;
alter table sensors add column if not exists row_no smallint;
alter table sensors add column if not exists tier text;

comment on column sensors.rom_id is '1-wire ROM address (hex) ของ DS18B20 จริง — กรอกทีหลังตอน commissioning หน้างาน, null = ยังไม่ผูก';
comment on column sensors.row_no is 'แถวที่ 1/2 ของกอง (เฉพาะ bed_temp โรง 2 แถว) — null สำหรับ kind อื่น';
comment on column sensors.tier is 'ชั้น top/mid/bottom ของกอง (เฉพาะ bed_temp) — null สำหรับ kind อื่น';

-- constraint แบบ drop-if-exists แล้ว add ใหม่ (ไม่กระทบข้อมูล แค่เปลี่ยนกฎ) — หา constraint เดิม
-- แบบ dynamic กันกรณีชื่อ auto-generated ไม่ตรงที่คาดไว้
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
    where rel.relname = 'sensors' and con.contype = 'c' and att.attname = 'row_no'
  loop
    execute format('alter table sensors drop constraint %I', c.conname);
  end loop;
end $$;
alter table sensors add constraint sensors_row_no_check check (row_no is null or row_no in (1, 2));

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
    where rel.relname = 'sensors' and con.contype = 'c' and att.attname = 'tier'
  loop
    execute format('alter table sensors drop constraint %I', c.conname);
  end loop;
end $$;
alter table sensors add constraint sensors_tier_check check (tier is null or tier in ('top', 'mid', 'bottom'));

-- rom_id ไม่ซ้ำต่อโรง (7 ตัวต่อบัสเดียว ROM ต้องไม่ชนกัน) — partial unique เพราะ null ได้หลายแถว
create unique index if not exists uq_sensors_house_rom on sensors (house_id, rom_id) where rom_id is not null;

-- ----------------------------------------------------------------------------
-- 2) sensors.kind: เพิ่ม 'outside_temp' (DS18B20 นอกโรง วัดอุณหภูมิอย่างเดียว)
-- ----------------------------------------------------------------------------

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
    where rel.relname = 'sensors' and con.contype = 'c' and att.attname = 'kind'
  loop
    execute format('alter table sensors drop constraint %I', c.conname);
  end loop;
end $$;
alter table sensors add constraint sensors_kind_check
  check (kind in ('air_th', 'bed_temp', 'water_level', 'outside_temp'));

-- ----------------------------------------------------------------------------
-- 3) SEED — เซนเซอร์จริงของโรงจริง house-01 (2 แถว × 3 ชั้น ยาว 7 เมตร)
--    - bed_temp x6: DS18B20 ในกอง แถวละ 3 จุด (หัว-บน / กลาง-กลาง / ท้าย-ล่าง) x 2 แถว
--    - outside_temp x1: DS18B20 นอกโรง
--    - air_th head/tail: "ไม่ต้อง insert ใหม่" — มีอยู่แล้วจาก 001_init.sql (addr='1' location='head',
--      addr='3' location='tail') ตรงกับสเปก 2 ตัวนี้พอดี (ดูหมายเหตุด้านบนเรื่อง addr='2'/mid เดิม)
-- ----------------------------------------------------------------------------

insert into sensors (house_id, kind, address, location, unit, row_no, tier) values
  ('house-01', 'bed_temp', 'row1_head_top',    'head', 'C', 1, 'top'),
  ('house-01', 'bed_temp', 'row1_mid_mid',     'mid',  'C', 1, 'mid'),
  ('house-01', 'bed_temp', 'row1_tail_bottom', 'tail', 'C', 1, 'bottom'),
  ('house-01', 'bed_temp', 'row2_head_top',    'head', 'C', 2, 'top'),
  ('house-01', 'bed_temp', 'row2_mid_mid',     'mid',  'C', 2, 'mid'),
  ('house-01', 'bed_temp', 'row2_tail_bottom', 'tail', 'C', 2, 'bottom'),
  ('house-01', 'outside_temp', 'outside', 'outside', 'C', null, null)
on conflict (house_id, kind, address) do nothing;

-- ----------------------------------------------------------------------------
-- 4) RPC กราฟย้อนหลัง — เจนเนอริกทุก kind (air_th/bed_temp/outside_temp/water_level)
--    คืน min/max/avg ต่อ bucket ต่อ sensor_id+metric (ไม่ยุบรวมข้าม sensor เหมือน air_history เดิม
--    เพราะ bed_temp มี 6 จุด ต้องแยกเป็นเส้นกราฟต่อจุด ไม่ใช่ max รวม)
--    - sensor_history: primitive — ผู้เรียกกำหนด since/bucket/rollup เอง
--    - sensor_history_range: ผู้เรียกส่งแค่ชื่อช่วง ('1h'|'4h'|'12h'|'24h'|'week'|'month'|'year')
--      แล้วฟังก์ชันเลือก bucket size + ว่าจะอ่าน raw หรือ rollup ให้เอง (<=24h อ่าน raw,
--      week ขึ้นไปอ่าน rollup รายชั่วโมงจาก sensor_readings_hourly ของ 004)
--    ไม่แก้/ไม่ลบ air_history, air_history_rollup เดิม (002/004) — frontend เดิมยังใช้ได้ตามปกติ
-- ----------------------------------------------------------------------------

create or replace function sensor_history(
  p_house_id       text,
  p_kind           text,
  p_since          timestamptz,
  p_bucket_seconds int,
  p_use_rollup     boolean default false
)
returns table(
  bucket_ts timestamptz,
  sensor_id bigint,
  metric    text,
  v_min     double precision,
  v_max     double precision,
  v_avg     double precision
)
language sql
stable
security invoker
as $$
  select
    bucket_ts,
    x.sensor_id,
    x.metric,
    min(x.v) as v_min,
    max(x.v) as v_max,
    avg(x.v) as v_avg
  from (
    select
      to_timestamp(floor(extract(epoch from r.ts) / greatest(p_bucket_seconds, 1)) * greatest(p_bucket_seconds, 1)) as bucket_ts,
      r.sensor_id,
      r.metric,
      r.value as v
    from sensor_readings r
    join sensors s on s.id = r.sensor_id
    where not p_use_rollup
      and r.house_id = p_house_id
      and s.kind = p_kind
      and r.ts >= p_since

    union all

    select
      to_timestamp(floor(extract(epoch from h.bucket) / greatest(p_bucket_seconds, 1)) * greatest(p_bucket_seconds, 1)) as bucket_ts,
      h.sensor_id,
      h.metric,
      h.v_avg as v
    from sensor_readings_hourly h
    join sensors s on s.id = h.sensor_id
    where p_use_rollup
      and h.house_id = p_house_id
      and s.kind = p_kind
      and h.bucket >= p_since
  ) x
  group by bucket_ts, x.sensor_id, x.metric
  order by bucket_ts;
$$;

grant execute on function sensor_history(text, text, timestamptz, int, boolean) to anon, authenticated;

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
    when 'week'  then v_since := now() - interval '7 days';   v_bucket := 10800;  v_rollup := true;   -- 3 ชม./จุด
    when 'month' then v_since := now() - interval '30 days';  v_bucket := 43200;  v_rollup := true;   -- 12 ชม./จุด
    when 'year'  then v_since := now() - interval '365 days'; v_bucket := 604800; v_rollup := true;   -- 1 สัปดาห์/จุด
    else raise exception 'sensor_history_range: invalid p_range % (ต้องเป็น 1h|4h|12h|24h|week|month|year)', p_range;
  end case;

  return query
    select * from sensor_history(p_house_id, p_kind, v_since, v_bucket, v_rollup);
end;
$$;

grant execute on function sensor_history_range(text, text, text) to anon, authenticated;
