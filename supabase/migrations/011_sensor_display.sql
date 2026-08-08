-- ============================================================================
-- supabase/migrations/011_sensor_display.sql
-- ตั้งค่าเซนเซอร์ที่ "ใช้จริง" ได้เองจากหน้าเว็บ — โดยไม่ต้อง flash เฟิร์มแวร์ใหม่
--
-- โรงจริงไม่ได้ใช้ครบทุกจุดที่ seed ไว้:
--   - DS18B20 ในกอง: ใช้จริงไม่ครบ 6 (ที่เหลือถอดออก) -> จัดการด้วย rom mapping + 010 (ไม่ใช้)
--   - RS485 อากาศ: ใช้จริง 2 ตัว (หัวโรง/ท้ายโรง) จาก 3 address ที่ seed ไว้ (1/2/3)
--
-- ⚠️ แยก 2 อย่างออกจากกันให้ชัด (สำคัญ — อย่ารวม):
--   * sensors.location = "คีย์ routing" ที่เฟิร์มแวร์ใช้จับคู่ modbus addr -> sensor_id
--     (supabase.cpp: addr 1->'head', 2->'mid', 3->'tail' ฮาร์ดโค้ดอยู่) **ห้ามแก้จากหน้าเว็บ**
--     ถ้าแก้ ค่าจะยิงเข้าผิดตัวเงียบๆ
--   * sensors.ui_position = "ตำแหน่งที่โชว์บน dashboard" แก้ได้อิสระจากหน้าเว็บ ไม่กระทบ routing
--   (วันข้างหน้าถ้า flash เฟิร์มแวร์ที่ resolve ด้วย address แล้ว ค่อยยุบสองอันนี้เป็นอันเดียว —
--    ดู branch feat/air-sensor-mapping)
--
-- ⚠️ ไม่แตะ control/safety — T_air ที่ใช้คุมยังเป็น max ของทุกจุดอากาศที่อ่านได้ (docs/03-control-logic.md)
--    ธง enabled คุมแค่การ "แสดง/นับ" บน dashboard เท่านั้น ESP32 ไม่ได้อ่านคอลัมน์นี้
--
-- เพิ่มคอลัมน์ + RPC ใหม่เท่านั้น ไม่ลบ/ไม่แก้ข้อมูลเดิม · idempotent รันซ้ำได้
-- ต้องมี 001 (sensors + seed air_th addr 1/2/3) ก่อน
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) คอลัมน์ใหม่
-- ----------------------------------------------------------------------------

alter table sensors add column if not exists enabled     boolean not null default true;
alter table sensors add column if not exists ui_position text;

comment on column sensors.enabled is
  'false = ไม่ได้ติดตั้ง/ไม่ใช้จุดนี้ — dashboard ไม่แสดงและไม่นับ · ESP32 ไม่อ่านคอลัมน์นี้ ไม่กระทบ control/safety';
comment on column sensors.ui_position is
  'ตำแหน่งที่โชว์บน dashboard (head|mid|tail) แก้ได้จากหน้าเว็บ — null = ใช้ location เดิม · แยกจาก location ที่เป็นคีย์ routing ของเฟิร์มแวร์ (ห้ามแก้)';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sensors_ui_position_check'
  ) then
    alter table sensors add constraint sensors_ui_position_check
      check (ui_position is null or ui_position in ('head', 'mid', 'tail'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2) RPC ตั้งค่าการแสดงผลของเซนเซอร์อากาศ (authenticated เท่านั้น)
--    p_address = modbus addr เป็นสตริง ('1'|'2'|'3') — คีย์ฮาร์ดแวร์ที่ไม่เปลี่ยน
--    p_ui_position = 'head'|'mid'|'tail' (null/'' = กลับไปใช้ค่า default ตาม location)
--    หนึ่งตำแหน่งโชว์ได้ตัวเดียว: ปลดตัวอื่นที่ถือตำแหน่งนี้อยู่ก่อน
-- ----------------------------------------------------------------------------

create or replace function set_air_display(
  p_house       text,
  p_address     text,
  p_ui_position text,
  p_enabled     boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pos text := nullif(trim(coalesce(p_ui_position, '')), '');
begin
  if auth.role() <> 'authenticated' then
    raise exception 'unauthorized: ต้อง login ก่อนถึงแก้การตั้งค่าเซนเซอร์ได้';
  end if;
  if p_address is null or p_address = '' then
    raise exception 'address (modbus addr) ว่างไม่ได้';
  end if;
  if v_pos is not null and v_pos not in ('head', 'mid', 'tail') then
    raise exception 'ui_position ต้องเป็น head | mid | tail (ได้รับ %)', v_pos;
  end if;

  -- ตำแหน่งที่โชว์ซ้ำกันไม่ได้ — ปลดตัวอื่นก่อน (ผู้ใช้ย้ายเซนเซอร์)
  if v_pos is not null then
    update sensors set ui_position = null
      where house_id = p_house and kind = 'air_th' and ui_position = v_pos and address <> p_address;
  end if;

  update sensors
     set ui_position = v_pos,
         enabled     = coalesce(p_enabled, true)
   where house_id = p_house and kind = 'air_th' and address = p_address;
end $$;

revoke all on function set_air_display(text, text, text, boolean) from public;
grant execute on function set_air_display(text, text, text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) ตั้งค่าเริ่มต้นให้ตรงกับโรงจริง: ใช้ RS485 2 ตัว (addr 1 = หัวโรง, addr 3 = ท้ายโรง)
--    addr 2 ไม่ได้ติดตั้ง -> ปิดไว้ (ผู้ใช้เปิดกลับเองได้จากหน้าเว็บถ้าติดตั้งเพิ่ม)
--    เขียนเฉพาะแถวที่ยังไม่เคยตั้งค่า (ui_position is null) — ไม่ทับของที่ผู้ใช้ตั้งเองแล้ว
-- ----------------------------------------------------------------------------

update sensors set ui_position = 'head'
  where house_id = 'house-01' and kind = 'air_th' and address = '1' and ui_position is null;
update sensors set ui_position = 'tail'
  where house_id = 'house-01' and kind = 'air_th' and address = '3' and ui_position is null;
update sensors set enabled = false
  where house_id = 'house-01' and kind = 'air_th' and address = '2';
