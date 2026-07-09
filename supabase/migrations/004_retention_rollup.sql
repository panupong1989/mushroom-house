-- ============================================================================
-- supabase/migrations/004_retention_rollup.sql
-- Retention + rollup ของ sensor_readings (โตเร็ว ~26k แถว/วัน)
--   - rollup รายชั่วโมง (min/max/avg/count) เก็บ 1 ปี
--   - raw เก็บ 30 วัน (รอบเพาะ 2-3 สัปดาห์ ต้องย้อนดูได้ทั้งรอบ)
-- ไฟล์นี้ "ไม่ลบข้อมูลเอง" — แค่สร้าง table/function/cron(rollup) เท่านั้น
-- การลบ raw (prune) เป็นแบบ soft: รัน dry-run ดูจำนวนก่อน แล้วค่อยเปิด cron จริงเอง (คำสั่งท้ายไฟล์)
-- idempotent — รันซ้ำได้; รันใน Supabase SQL editor ต่อจาก 001-003
-- ============================================================================

-- ---- 1) rollup table (รายชั่วโมงต่อ sensor+metric) ----
create table if not exists sensor_readings_hourly (
  house_id  text        not null references houses(id) on delete cascade,
  sensor_id bigint      not null references sensors(id) on delete cascade,
  bucket    timestamptz not null,               -- ต้นชั่วโมง (UTC)
  metric    text        not null,               -- 'temp' | 'rh' | 'level'
  v_min     double precision not null,
  v_max     double precision not null,
  v_avg     double precision not null,
  n         integer     not null,               -- count — ดูว่าช่วงนั้นเซนเซอร์หลุด/มาน้อยไหม
  primary key (house_id, sensor_id, bucket, metric)
);
create index if not exists idx_srh_house_bucket on sensor_readings_hourly (house_id, bucket desc);

alter table sensor_readings_hourly enable row level security;
drop policy if exists "anon read srh" on sensor_readings_hourly;
create policy "anon read srh" on sensor_readings_hourly for select to anon using (true);
drop policy if exists "auth read srh" on sensor_readings_hourly;
create policy "auth read srh" on sensor_readings_hourly for select to authenticated using (true);

-- ---- 2) rollup function: aggregate raw -> hourly (upsert, idempotent) ----
-- p_since default 3 ชม.ล่าสุด = incremental (cron รายชั่วโมงพอ); backfill เรียกด้วย p_since เก่ากว่าได้
create or replace function rollup_sensor_readings_hourly(p_since timestamptz default now() - interval '3 hours')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n_rows integer;
begin
  insert into sensor_readings_hourly (house_id, sensor_id, bucket, metric, v_min, v_max, v_avg, n)
  select r.house_id, r.sensor_id, date_trunc('hour', r.ts), r.metric,
         min(r.value), max(r.value), avg(r.value), count(*)
  from sensor_readings r
  where r.ts >= p_since
  group by r.house_id, r.sensor_id, date_trunc('hour', r.ts), r.metric
  on conflict (house_id, sensor_id, bucket, metric)
  do update set v_min = excluded.v_min, v_max = excluded.v_max, v_avg = excluded.v_avg, n = excluded.n;
  get diagnostics n_rows = row_count;
  return n_rows;
end $$;

-- ---- 3) prune functions (SOFT: p_dry_run=true = แค่คืนจำนวน ไม่ลบจริง) ----
create or replace function prune_sensor_readings(p_keep_days integer default 30, p_dry_run boolean default true)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare cutoff timestamptz := now() - make_interval(days => p_keep_days);
        n bigint;
begin
  select count(*) into n from sensor_readings where ts < cutoff;
  if p_dry_run then
    raise notice 'prune raw DRY-RUN: จะลบ % แถว (ts < %)', n, cutoff;
    return n;
  end if;
  delete from sensor_readings where ts < cutoff;
  raise notice 'prune raw: ลบ % แถว (ts < %)', n, cutoff;
  return n;
end $$;

create or replace function prune_sensor_readings_hourly(p_keep_days integer default 365, p_dry_run boolean default true)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare cutoff timestamptz := now() - make_interval(days => p_keep_days);
        n bigint;
begin
  select count(*) into n from sensor_readings_hourly where bucket < cutoff;
  if p_dry_run then
    raise notice 'prune rollup DRY-RUN: จะลบ % แถว (bucket < %)', n, cutoff;
    return n;
  end if;
  delete from sensor_readings_hourly where bucket < cutoff;
  raise notice 'prune rollup: ลบ % แถว (bucket < %)', n, cutoff;
  return n;
end $$;

-- ---- 4) RPC ให้กราฟ 7 วัน+ อ่านจาก rollup (security invoker เคารพ RLS) — 24 ชม. ยังอ่าน raw (air_history) ----
create or replace function air_history_rollup(p_house_id text, p_since timestamptz, p_bucket_seconds int)
returns table(bucket_ts timestamptz, temp_max double precision, rh_avg double precision)
language sql
stable
security invoker
as $$
  select
    to_timestamp(floor(extract(epoch from h.bucket) / greatest(p_bucket_seconds, 1)) * greatest(p_bucket_seconds, 1)) as bucket_ts,
    max(h.v_max) filter (where h.metric = 'temp') as temp_max,
    avg(h.v_avg) filter (where h.metric = 'rh')  as rh_avg
  from sensor_readings_hourly h
  join sensors s on s.id = h.sensor_id
  where h.house_id = p_house_id and s.kind = 'air_th' and h.bucket >= p_since
  group by 1
  order by 1;
$$;
grant execute on function air_history_rollup(text, timestamptz, int) to anon;

-- ---- 5) pg_cron: ตั้งเฉพาะ ROLLUP อัตโนมัติ (ปลอดภัย ไม่ลบข้อมูล) ----
-- ต้องเปิด extension pg_cron ก่อน: Database → Extensions → เปิด "pg_cron"
-- ไฟล์นี้ "ไม่" ตั้ง cron ลบ raw — ให้รัน dry-run ดูก่อน แล้วค่อยเปิดเอง (ข้อ 6)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rollup-hourly', '5 * * * *', $cron$ select rollup_sensor_readings_hourly(); $cron$);
    raise notice 'ตั้ง cron rollup-hourly แล้ว (ทุกชั่วโมง นาทีที่ 5)';
  else
    raise notice 'pg_cron ยังไม่เปิด — เปิดที่ Database → Extensions แล้วรัน cron.schedule เอง (ดูข้อ 6)';
  end if;
end $$;

-- ============================================================================
-- 6) หลัง review DRY-RUN แล้วค่อยรันเอง (ไม่อยู่ใน migration — กันลบพลาด)
-- ============================================================================
-- ก) backfill rollup ครั้งแรก (ถ้ามี raw เก่าอยู่แล้ว):
--      select rollup_sensor_readings_hourly(now() - interval '30 days');
-- ข) ดูว่าจะลบ raw กี่แถว (ยังไม่ลบ):
--      select prune_sensor_readings(30, true);
--    ดูรอลอัพ:  select prune_sensor_readings_hourly(365, true);
-- ค) ถ้าโอเค เปิด cron ลบจริง:
--      select cron.schedule('prune-raw-30d',    '15 3 * * *', $$ select prune_sensor_readings(30, false); $$);
--      select cron.schedule('prune-rollup-1y',  '20 3 * * *', $$ select prune_sensor_readings_hourly(365, false); $$);
-- ถ้าถ้าต้องยกเลิก:  select cron.unschedule('prune-raw-30d');
