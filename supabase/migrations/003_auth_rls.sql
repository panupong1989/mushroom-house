-- ============================================================================
-- supabase/migrations/003_auth_rls.sql
-- Auth (Email+Password) — เปลี่ยนสิทธิ์: anon = read-only ทุกตาราง, authenticated = เขียน
-- commands + control_config ได้ (additive ไม่แก้ 001/002)
-- idempotent (drop policy if exists ก่อน create) — รันใน Supabase SQL editor ต่อจาก 001/002
--
-- สร้าง user เอง: Supabase dashboard → Authentication → Users → Add user (ไม่เปิด public sign-up:
-- Authentication → Providers → Email → ปิด "Enable sign-ups")
-- ============================================================================

-- ---- 1) anon เขียน commands ไม่ได้อีกต่อไป (เดิม 001 ให้ anon insert ได้) → ปุ่มสั่งงานต้อง login ----
-- (RLS บังคับจริง ไม่ใช่แค่ซ่อนปุ่มฝั่ง UI — ใครถือ anon key ก็ insert command ไม่ได้แล้ว)
drop policy if exists "anon insert commands" on commands;

-- ---- 2) authenticated: อ่านได้ทุกตาราง (เท่า anon; policy คนละ role จึงต้องเพิ่มแยก) ----
drop policy if exists "auth read houses" on houses;
create policy "auth read houses" on houses for select to authenticated using (true);
drop policy if exists "auth read control_profiles" on control_profiles;
create policy "auth read control_profiles" on control_profiles for select to authenticated using (true);
drop policy if exists "auth read control_config" on control_config;
create policy "auth read control_config" on control_config for select to authenticated using (true);
drop policy if exists "auth read sensors" on sensors;
create policy "auth read sensors" on sensors for select to authenticated using (true);
drop policy if exists "auth read sensor_readings" on sensor_readings;
create policy "auth read sensor_readings" on sensor_readings for select to authenticated using (true);
drop policy if exists "auth read actuators" on actuators;
create policy "auth read actuators" on actuators for select to authenticated using (true);
drop policy if exists "auth read actuator_events" on actuator_events;
create policy "auth read actuator_events" on actuator_events for select to authenticated using (true);
drop policy if exists "auth read commands" on commands;
create policy "auth read commands" on commands for select to authenticated using (true);
drop policy if exists "auth read alerts" on alerts;
create policy "auth read alerts" on alerts for select to authenticated using (true);

-- ---- 3) authenticated: สั่ง manual (insert commands) — CHECK action/ttl_sec จาก 001 ยังบังคับอยู่ ----
drop policy if exists "auth insert commands" on commands;
create policy "auth insert commands" on commands for insert to authenticated with check (true);

-- ---- 4) authenticated: แก้ setpoint (insert/update control_config) — สำหรับหน้า Settings (roadmap ถัดไป) ----
drop policy if exists "auth insert control_config" on control_config;
create policy "auth insert control_config" on control_config for insert to authenticated with check (true);
drop policy if exists "auth update control_config" on control_config;
create policy "auth update control_config" on control_config for update to authenticated using (true) with check (true);

-- หมายเหตุ: update commands.acked_at + insert sensor_readings/actuator_events/alerts ยังเป็นของ
-- service_role (ESP32) ที่ bypass RLS — ไม่ต้องเพิ่ม policy ให้ authenticated
