-- ============================================================================
-- supabase/migrations/001_init.sql
-- แปลงจาก db/migrations/001..005 (Postgres ปกติ) -> Postgres/Supabase style
-- รันทั้งไฟล์นี้ครั้งเดียวใน Supabase SQL editor (idempotent — รันซ้ำได้ปลอดภัย)
-- ดูวิธี run + สถาปัตยกรรมโหมด Internet ใน supabase/README.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABLES
-- ----------------------------------------------------------------------------

create table if not exists houses (
  id             text primary key,
  name           text not null,
  timezone       text not null default 'Asia/Bangkok',
  active_profile text not null default 'fruiting',
  -- last_mode/last_mode_ts: mode ล่าสุดที่รายงานมาจาก ESP32 (telemetry.mode) ต่างจาก
  -- active_profile (ค่าที่ตั้งใจให้เป็น) เพราะ mode สะท้อนสถานะจริงของ FSM เช่น SAFE_HOLD
  -- ตอน safety trip — ดู docs/03-control-logic.md
  last_mode      text,
  last_mode_ts   timestamptz,
  created_at     timestamptz not null default now()
);

create table if not exists control_profiles (
  id       bigserial primary key,
  house_id text not null references houses(id) on delete cascade,
  name     text not null,                       -- 'spawn_run' | 'fruiting'
  unique (house_id, name)
);

create table if not exists control_config (
  house_id text not null references houses(id) on delete cascade,
  profile  text not null,                        -- profile name
  key      text not null,
  value    numeric not null,
  primary key (house_id, profile, key)
);

create table if not exists sensors (
  id       bigserial primary key,
  house_id text not null references houses(id) on delete cascade,
  kind     text not null check (kind in ('air_th', 'bed_temp', 'water_level')),
  address  text not null,          -- modbus addr (1..) หรือ 1-wire ROM
  location text,                   -- 'head' | 'mid' | 'tail' | 'tank' ...
  unit     text,
  unique (house_id, kind, address)
);

-- house_id ถูก denormalize มาจาก sensors เพื่อให้ Realtime postgres_changes filter
-- (eq.house_id) และ RLS policy ทำได้ตรงๆ โดยไม่ต้อง join ทุกครั้ง
create table if not exists sensor_readings (
  id        bigserial primary key,
  sensor_id bigint not null references sensors(id) on delete cascade,
  house_id  text not null references houses(id) on delete cascade,
  ts        timestamptz not null default now(),
  metric    text not null,          -- 'temp' | 'rh' | 'level'
  value     double precision not null
);
create index if not exists idx_readings_sensor_ts on sensor_readings (sensor_id, ts desc);
create index if not exists idx_readings_house_ts on sensor_readings (house_id, ts desc);

create table if not exists actuators (
  id            bigserial primary key,
  house_id      text not null references houses(id) on delete cascade,
  kind          text not null check (kind in ('mist', 'heater', 'exhaust', 'light', 'circulation')),
  relay_channel int  not null,
  name          text not null,
  unique (house_id, relay_channel)
);

create table if not exists actuator_events (
  id          bigserial primary key,
  actuator_id bigint not null references actuators(id) on delete cascade,
  house_id    text not null references houses(id) on delete cascade,
  ts          timestamptz not null default now(),
  state       boolean not null,
  reason      text,
  source      text not null default 'auto' check (source in ('auto', 'manual', 'safety'))
);
create index if not exists idx_evt_act_ts on actuator_events (actuator_id, ts desc);
create index if not exists idx_evt_house_ts on actuator_events (house_id, ts desc);

-- คำสั่งจาก dashboard (โหมด Internet): insert แถวใหม่ = สั่งอุปกรณ์ 1 ครั้ง
-- ESP32 (service_role) จะ subscribe/poll ตารางนี้แล้วเซ็ต acked_at ตอนรับคำสั่งไปแล้ว
create table if not exists commands (
  id         bigserial primary key,
  house_id   text not null references houses(id) on delete cascade,
  actuator   text not null,          -- kind: mist|heater|exhaust|light|circulation
  action     text not null check (action in ('on', 'off', 'auto')),
  ttl_sec    int not null default 300 check (ttl_sec > 0 and ttl_sec <= 3600),
  ts         timestamptz not null default now(),
  acked_at   timestamptz
);
create index if not exists idx_commands_house_ts on commands (house_id, ts desc);

create table if not exists alerts (
  id          bigserial primary key,
  house_id    text not null references houses(id) on delete cascade,
  ts          timestamptz not null default now(),
  severity    text not null check (severity in ('info', 'warn', 'critical')),
  code        text not null,         -- LOW_WATER|BED_OVERHEAT|HOT|SENSOR_LOST...
  message     text,
  resolved_at timestamptz
);
create index if not exists idx_alerts_house_ts on alerts (house_id, ts desc);

-- ----------------------------------------------------------------------------
-- 2) REALTIME — เปิด postgres_changes บน sensor_readings / actuator_events /
--    commands / alerts (ดูงาน 1 ใน issue) ผ่าน publication supabase_realtime
--    ที่ Supabase สร้างให้ทุกโปรเจกต์อยู่แล้ว — ใช้ DO block กันชน "already member"
--    เวลารันไฟล์นี้ซ้ำ
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['sensor_readings', 'actuator_events', 'commands', 'alerts']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- commands/alerts มี UPDATE (acked_at/resolved_at) หลังสร้างแถว — REPLICA IDENTITY FULL
-- ให้ payload realtime มีค่าคอลัมน์เดิมครบตอน UPDATE ด้วย (ไม่ใช่แค่ primary key)
alter table commands replica identity full;
alter table alerts replica identity full;

-- ----------------------------------------------------------------------------
-- 3) ROW LEVEL SECURITY
--    - anon (frontend, dashboard) : อ่านได้ทุกตาราง (read-only) + insert ได้เฉพาะ
--      commands (สั่ง manual)
--    - insert sensor_readings/actuator_events/alerts และ update commands/alerts
--      ปล่อยให้ ESP32 ใช้ service_role key ทีหลัง (service_role bypass RLS โดย
--      ค่า default ของ Supabase อยู่แล้ว จึงไม่ต้องเขียน policy เพิ่มให้มัน)
--    - ห้าม service_role key หลุดไปอยู่ใน frontend เด็ดขาด (ดู CLAUDE.md/issue)
-- ----------------------------------------------------------------------------

alter table houses            enable row level security;
alter table control_profiles  enable row level security;
alter table control_config    enable row level security;
alter table sensors           enable row level security;
alter table sensor_readings   enable row level security;
alter table actuators         enable row level security;
alter table actuator_events   enable row level security;
alter table commands          enable row level security;
alter table alerts            enable row level security;

drop policy if exists "anon read houses" on houses;
create policy "anon read houses" on houses for select to anon using (true);

drop policy if exists "anon read control_profiles" on control_profiles;
create policy "anon read control_profiles" on control_profiles for select to anon using (true);

drop policy if exists "anon read control_config" on control_config;
create policy "anon read control_config" on control_config for select to anon using (true);

drop policy if exists "anon read sensors" on sensors;
create policy "anon read sensors" on sensors for select to anon using (true);

drop policy if exists "anon read sensor_readings" on sensor_readings;
create policy "anon read sensor_readings" on sensor_readings for select to anon using (true);

drop policy if exists "anon read actuators" on actuators;
create policy "anon read actuators" on actuators for select to anon using (true);

drop policy if exists "anon read actuator_events" on actuator_events;
create policy "anon read actuator_events" on actuator_events for select to anon using (true);

drop policy if exists "anon read alerts" on alerts;
create policy "anon read alerts" on alerts for select to anon using (true);

drop policy if exists "anon read commands" on commands;
create policy "anon read commands" on commands for select to anon using (true);

-- อนุญาต insert เฉพาะคำสั่ง manual จาก dashboard เท่านั้น (ห้าม update/delete —
-- acked_at เป็นหน้าที่ของ ESP32/service_role เท่านั้น) CHECK constraint ด้านบน
-- (action/ttl_sec) กันค่าผิดรูปแบบไปพร้อมกัน
drop policy if exists "anon insert commands" on commands;
create policy "anon insert commands" on commands for insert to anon with check (true);

-- ----------------------------------------------------------------------------
-- 4) SEED — โรงเดียว (house-01) ตรงกับ db/seed.sql เดิม
-- ----------------------------------------------------------------------------

insert into houses (id, name) values ('house-01', 'โรงเห็ดฟาง 01') on conflict do nothing;

insert into control_profiles (house_id, name) values
  ('house-01', 'fruiting'), ('house-01', 'spawn_run')
on conflict do nothing;

-- sensors: RS485 air x3 (addr 1..3), bed DS18B20 x3, water float
insert into sensors (house_id, kind, address, location, unit) values
  ('house-01', 'air_th', '1', 'head', 'C/%'),
  ('house-01', 'air_th', '2', 'mid', 'C/%'),
  ('house-01', 'air_th', '3', 'tail', 'C/%'),
  ('house-01', 'bed_temp', '28-0000-01', 'head', 'C'),
  ('house-01', 'bed_temp', '28-0000-02', 'mid', 'C'),
  ('house-01', 'bed_temp', '28-0000-03', 'tail', 'C'),
  ('house-01', 'water_level', 'float-1', 'tank', 'bool')
on conflict do nothing;

-- actuators (relay channels)
insert into actuators (house_id, kind, relay_channel, name) values
  ('house-01', 'mist', 1, 'ปั๊มพ่นหมอก'),
  ('house-01', 'heater', 2, 'ฮีทเตอร์'),
  ('house-01', 'exhaust', 3, 'พัดลมดูด'),
  ('house-01', 'light', 4, 'หลอดไฟ'),
  ('house-01', 'circulation', 5, 'พัดลมหมุนเวียน')
on conflict do nothing;

-- config (fruiting + spawn_run)
insert into control_config (house_id, profile, key, value) values
  ('house-01', 'fruiting', 'temp_fruit_min', 28),
  ('house-01', 'fruiting', 'temp_fruit_max', 32),
  ('house-01', 'fruiting', 'temp_floor', 27),
  ('house-01', 'fruiting', 'temp_heater_on', 27.5),
  ('house-01', 'fruiting', 'temp_heater_off', 29.5),
  ('house-01', 'fruiting', 'temp_exhaust_on', 33),
  ('house-01', 'fruiting', 'temp_exhaust_off', 31),
  ('house-01', 'fruiting', 'temp_danger_hot', 38),
  ('house-01', 'fruiting', 'rh_min', 85),
  ('house-01', 'fruiting', 'rh_max', 90),
  ('house-01', 'fruiting', 'rh_high', 92),
  ('house-01', 'fruiting', 'vent_period_min', 120),
  ('house-01', 'fruiting', 'vent_duration_min', 10),
  ('house-01', 'fruiting', 'mist_burst_sec', 20),
  ('house-01', 'fruiting', 'mist_gap_sec', 180),
  ('house-01', 'spawn_run', 'bed_spawn_min', 32),
  ('house-01', 'spawn_run', 'bed_spawn_max', 35),
  ('house-01', 'spawn_run', 'bed_danger', 40)
on conflict (house_id, profile, key) do nothing;
