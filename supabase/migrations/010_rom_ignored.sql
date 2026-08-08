-- ============================================================================
-- supabase/migrations/010_rom_ignored.sql
-- "ไม่ใช้" ต่อ ROM — ทำเครื่องหมายโพรบ DS18B20 ที่เจอบนบัสแต่ไม่ได้ใช้งาน (สำรอง/เสีย/ถอดออก)
-- ให้หน้าจับคู่ไม่นับเป็นงานค้าง และ dashboard ไม่เอาไปแสดง
--
-- ⚠️ ไม่แตะ control/safety — ESP32 ยังอ่านทุกโพรบบนบัสเหมือนเดิม; ธงนี้คุมแค่ "แสดง/นับ" ฝั่ง UI
--    (โพรบที่ไม่ผูกตำแหน่งอยู่แล้วไม่ถูกโพสต์เข้า sensor_readings ตั้งแต่ต้น — ดู supabase.cpp)
--
-- เพิ่มคอลัมน์ + RPC ใหม่เท่านั้น ไม่ลบ/ไม่แก้ข้อมูลเดิม · idempotent รันซ้ำได้
-- ต้องมี 007 ก่อน (ตาราง bed_scan + assign_sensor_rom)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) bed_scan.ignored — ธง "ไม่ใช้" ต่อ ROM
--    อยู่บน bed_scan เพราะเป็นทะเบียน ROM ที่เจอจริงบนบัส (โพรบที่ไม่ได้ใช้ไม่มีแถวใน sensors)
--    ESP32 upsert เฉพาะ house_id/rom_id/temp_c/updated_at (PostgREST merge-duplicates อัปเดต
--    เฉพาะคอลัมน์ที่ส่งมา) → ค่า ignored ที่ผู้ใช้ตั้งไว้ไม่ถูกทับทุก 5 วิ
-- ----------------------------------------------------------------------------

alter table bed_scan add column if not exists ignored boolean not null default false;

comment on column bed_scan.ignored is
  'true = ผู้ใช้ทำเครื่องหมาย "ไม่ใช้" โพรบตัวนี้ (ไม่นับเป็นงานค้างในหน้าจับคู่, ไม่แสดงบน dashboard) — ไม่กระทบ control/safety';

-- ----------------------------------------------------------------------------
-- 2) RPC ตั้ง/ยกเลิกธง "ไม่ใช้" (authenticated เท่านั้น — mirror assign_sensor_rom ใน 007)
--    ตั้ง ignored = true จะปลด rom ออกจากตำแหน่งที่ผูกอยู่ด้วย (ไม่ใช้ = ต้องไม่กินตำแหน่ง)
-- ----------------------------------------------------------------------------

create or replace function set_rom_ignored(p_house text, p_rom text, p_ignored boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception 'unauthorized: ต้อง login ก่อนถึงแก้สถานะเซนเซอร์ได้';
  end if;
  if p_rom is null or p_rom = '' then
    raise exception 'rom_id ว่างไม่ได้';
  end if;

  update bed_scan set ignored = coalesce(p_ignored, false)
    where house_id = p_house and rom_id = p_rom;

  -- "ไม่ใช้" ต้องไม่ค้างผูกตำแหน่งไว้ (ไม่งั้นตำแหน่งนั้นดูเหมือนมีเซนเซอร์แต่ไม่มีค่าเข้า)
  if coalesce(p_ignored, false) then
    update sensors set rom_id = null
      where house_id = p_house and rom_id = p_rom;
  end if;
end $$;

revoke all on function set_rom_ignored(text, text, boolean) from public;
grant execute on function set_rom_ignored(text, text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) reset_sensor_rom (007) ลบแถว bed_scan ทิ้งอยู่แล้ว → ธง ignored หายตามไปด้วยโดยธรรมชาติ
--    (ESP32 จะ repopulate แถวใหม่ด้วย ignored = false) — ไม่ต้องแก้อะไรเพิ่ม
-- ----------------------------------------------------------------------------
