-- ============================================================================
-- supabase/migrations/007_maintenance.sql
-- หน้า Maintenance (ดูแลระบบ) — 3 ส่วน:
--   1) จับคู่ ROM ID ของ DS18B20 เข้าตำแหน่งจริง (rom_id ↔ sensors.address) แบบ live
--   2) เคลียร์ข้อมูลกราฟเก่า (DESTRUCTIVE — RPC authenticated เท่านั้น)
--   3) ดูสถานะเซนเซอร์ (ใช้ตาราง bed_scan + readings เดิม)
--
-- ⚠️ มี RPC ลบข้อมูล (purge_*) — review แล้วก่อน apply (PR, ไม่ push main)
--    ทุก RPC เป็น SECURITY DEFINER + เช็ก auth.role()='authenticated' ก่อนเสมอ (anon ลบ/แก้ไม่ได้)
--
-- idempotent — รันซ้ำได้ (create table if not exists / create or replace function)
-- schema ที่ต้องมีก่อน: 001 (sensors/sensor_readings), 004 (sensor_readings_hourly),
--   005 (sensors.rom_id/row_no/tier + seed 7 ตัว: 6 bed_temp + 1 outside_temp)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) bed_scan — ตาราง "live" ที่ ESP32 (service_role) upsert ROM ที่เจอบนบัส 1-Wire
--    ทุก ~3 วิ พร้อม temp ล่าสุด ให้ dashboard subscribe เอาไปทำ live-mapping
--    (dashboard บนเน็ตอ่าน ESP32 ใน LAN ตรงๆ ไม่ได้ — ต้องผ่าน Supabase)
--    ไม่ใช่ข้อมูลประวัติ (1 แถวต่อ rom, upsert ทับ) — กราฟย้อนหลังยังใช้ sensor_readings เหมือนเดิม
-- ----------------------------------------------------------------------------
create table if not exists bed_scan (
  house_id   text not null references houses(id) on delete cascade,
  rom_id     text not null,
  temp_c     double precision,
  updated_at timestamptz not null default now(),
  primary key (house_id, rom_id)
);
create index if not exists idx_bed_scan_house on bed_scan (house_id);

-- realtime: ให้ dashboard subscribe INSERT/UPDATE/DELETE ได้ (mirror pattern จาก 001)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bed_scan'
  ) then
    execute 'alter publication supabase_realtime add table public.bed_scan';
  end if;
end $$;
-- upsert = UPDATE temp/updated_at ของแถวเดิม — REPLICA IDENTITY FULL ให้ payload realtime ครบคอลัมน์
alter table bed_scan replica identity full;

-- RLS: anon + authenticated อ่านได้ (dashboard) — เขียนเฉพาะ ESP32 (service_role bypass RLS)
alter table bed_scan enable row level security;
drop policy if exists "anon read bed_scan" on bed_scan;
create policy "anon read bed_scan" on bed_scan for select to anon using (true);
drop policy if exists "auth read bed_scan" on bed_scan;
create policy "auth read bed_scan" on bed_scan for select to authenticated using (true);

-- ----------------------------------------------------------------------------
-- 2) RPC จับคู่ ROM → ตำแหน่ง (authenticated เท่านั้น)
--    p_address = key ตำแหน่งคงที่ใน sensors (เช่น 'row1_head_top', 'outside') จาก 005
--    p_address = null/'' → ปลด rom นี้ออก (ตั้งเป็น "ว่าง")
--    หนึ่ง rom อยู่ได้ตำแหน่งเดียว: เคลียร์ rom นี้จากตำแหน่งเดิมก่อน แล้วค่อยผูกตำแหน่งใหม่
--    (กันชน partial-unique uq_sensors_house_rom จาก 005)
-- ----------------------------------------------------------------------------
create or replace function assign_sensor_rom(p_house text, p_rom text, p_address text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception 'unauthorized: ต้อง login ก่อนถึงจับคู่เซนเซอร์ได้';
  end if;
  if p_rom is null or p_rom = '' then
    raise exception 'rom_id ว่างไม่ได้';
  end if;

  -- ปลด rom นี้จากตำแหน่งเดิม (ถ้าเคยผูกไว้ที่อื่น)
  update sensors set rom_id = null
    where house_id = p_house and rom_id = p_rom;

  -- ผูกเข้าตำแหน่งใหม่ (ถ้าไม่ใช่ "ว่าง") — ตำแหน่งนั้นถ้ามี rom อื่นอยู่จะถูกทับ (ผู้ใช้ย้าย)
  if p_address is not null and p_address <> '' then
    update sensors set rom_id = p_rom
      where house_id = p_house and address = p_address;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3) RPC ลบข้อมูล (DESTRUCTIVE — authenticated เท่านั้น, คืนจำนวนแถวที่ลบ)
-- ----------------------------------------------------------------------------

-- ลบ readings ทั้งหมดของโรง (raw + rollup รายชั่วโมง)
create or replace function purge_readings_all(p_house text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'unauthorized: ต้อง login ก่อนถึงลบข้อมูลได้';
  end if;
  with d as (delete from sensor_readings where house_id = p_house returning 1)
  select count(*) into n from d;
  delete from sensor_readings_hourly where house_id = p_house;   -- rollup (004)
  return n;
end $$;

-- ลบเฉพาะ readings ก่อนวันที่ p_before (raw + rollup)
create or replace function purge_readings_before(p_house text, p_before timestamptz)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'unauthorized: ต้อง login ก่อนถึงลบข้อมูลได้';
  end if;
  with d as (delete from sensor_readings where house_id = p_house and ts < p_before returning 1)
  select count(*) into n from d;
  delete from sensor_readings_hourly where house_id = p_house and bucket < p_before;
  return n;
end $$;

-- รีเซ็ต mapping เซนเซอร์ (เคลียร์ rom_id ทุกตัวของโรง) + ล้างตาราง live scan ของโรงนี้
create or replace function reset_sensor_rom(p_house text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'unauthorized: ต้อง login ก่อนถึงลบ mapping ได้';
  end if;
  with d as (
    update sensors set rom_id = null
    where house_id = p_house and rom_id is not null
    returning 1
  )
  select count(*) into n from d;
  delete from bed_scan where house_id = p_house;   -- ล้าง live scan เก่าด้วย (จะ repopulate จาก ESP32)
  return n;
end $$;

-- สิทธิ์เรียก RPC: authenticated เท่านั้น (ถอด public/anon ออก) — กันซ้ำกับ role check ข้างใน
revoke all on function assign_sensor_rom(text, text, text) from public;
revoke all on function purge_readings_all(text) from public;
revoke all on function purge_readings_before(text, timestamptz) from public;
revoke all on function reset_sensor_rom(text) from public;
grant execute on function assign_sensor_rom(text, text, text) to authenticated;
grant execute on function purge_readings_all(text) to authenticated;
grant execute on function purge_readings_before(text, timestamptz) to authenticated;
grant execute on function reset_sensor_rom(text) to authenticated;
