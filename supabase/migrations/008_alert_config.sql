-- ============================================================================
-- supabase/migrations/008_alert_config.sql
-- จัดการการแจ้งเตือน:
--   1) alert_config — เปิด/ปิด "การแจ้งเตือน" ต่อ code (firmware อ่านแล้วข้ามการโพสต์ code ที่ปิด)
--   2) RPC เคลียร์/ลบ alert (authenticated เท่านั้น)
--
-- ⚠️ กฎเหล็ก: alert_config ปิดแค่ "การแจ้งเตือน" (โพสต์ลง alerts / ส่ง LINE) เท่านั้น
--    safety interlock ใน firmware (ตัดปั๊มเมื่อน้ำต่ำ / heater OFF เมื่อกองร้อน ฯลฯ) ทำงานทุก code เสมอ
--    ไม่ขึ้นกับ alert_config — ปิด alert ไม่ได้ปิดระบบกันพัง
--
-- idempotent · schema ที่ต้องมีก่อน: 001 (alerts), 003 (auth RLS)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) alert_config — 1 แถวต่อ (house_id, code) เก็บว่าจะแจ้งเตือน code นั้นไหม
-- ----------------------------------------------------------------------------
create table if not exists alert_config (
  house_id text not null references houses(id) on delete cascade,
  code     text not null,
  enabled  boolean not null default true,
  primary key (house_id, code)
);

-- seed code ที่มีจริงจาก safety.cpp (เปิด default) — เฟสแรก Beer จะปิด LOW_WATER เองผ่าน UI
insert into alert_config (house_id, code, enabled) values
  ('house-01', 'LOW_WATER', true),
  ('house-01', 'BED_OVERHEAT', true),
  ('house-01', 'HOT', true)
on conflict (house_id, code) do nothing;

-- realtime: ให้ dashboard เห็น toggle เปลี่ยนทันที (mirror pattern จาก 001)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'alert_config'
  ) then
    execute 'alter publication supabase_realtime add table public.alert_config';
  end if;
end $$;
alter table alert_config replica identity full;

alter table alert_config enable row level security;
drop policy if exists "anon read alert_config" on alert_config;
create policy "anon read alert_config" on alert_config for select to anon using (true);
drop policy if exists "auth read alert_config" on alert_config;
create policy "auth read alert_config" on alert_config for select to authenticated using (true);
-- authenticated แก้ toggle ได้ (upsert) — anon แก้ไม่ได้ (เหมือน control_config ใน 003)
drop policy if exists "auth insert alert_config" on alert_config;
create policy "auth insert alert_config" on alert_config for insert to authenticated with check (true);
drop policy if exists "auth update alert_config" on alert_config;
create policy "auth update alert_config" on alert_config for update to authenticated using (true) with check (true);

-- ----------------------------------------------------------------------------
-- 2) RPC จัดการ alert (authenticated เท่านั้น, คืนจำนวนแถวที่กระทำ)
-- ----------------------------------------------------------------------------

-- เคลียร์: mark ทุก alert ที่ยังไม่หาย เป็น resolved (เก็บประวัติไว้ ไม่ลบ)
create or replace function resolve_all_alerts(p_house text)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare n bigint;
begin
  if auth.role() <> 'authenticated' then raise exception 'unauthorized'; end if;
  with d as (
    update alerts set resolved_at = now()
    where house_id = p_house and resolved_at is null
    returning 1
  )
  select count(*) into n from d;
  return n;
end $$;

-- ลบถาวรทั้งหมด
create or replace function delete_alerts_all(p_house text)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare n bigint;
begin
  if auth.role() <> 'authenticated' then raise exception 'unauthorized'; end if;
  with d as (delete from alerts where house_id = p_house returning 1)
  select count(*) into n from d;
  return n;
end $$;

-- ลบถาวรเฉพาะก่อนวันที่
create or replace function delete_alerts_before(p_house text, p_before timestamptz)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare n bigint;
begin
  if auth.role() <> 'authenticated' then raise exception 'unauthorized'; end if;
  with d as (delete from alerts where house_id = p_house and ts < p_before returning 1)
  select count(*) into n from d;
  return n;
end $$;

revoke all on function resolve_all_alerts(text) from public;
revoke all on function delete_alerts_all(text) from public;
revoke all on function delete_alerts_before(text, timestamptz) from public;
grant execute on function resolve_all_alerts(text) to authenticated;
grant execute on function delete_alerts_all(text) to authenticated;
grant execute on function delete_alerts_before(text, timestamptz) to authenticated;
