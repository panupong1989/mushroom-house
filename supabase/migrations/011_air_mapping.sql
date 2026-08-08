-- ============================================================================
-- supabase/migrations/011_air_mapping.sql
-- จับคู่เซนเซอร์อากาศ RS485 (อุณหภูมิ+ความชื้น) กับตำแหน่งในโรง จากหน้าเว็บ
--
-- เดิม: ตำแหน่งของ air_th ถูกฮาร์ดโค้ดในเฟิร์มแวร์ (RS485 addr 1->head, 2->mid, 3->tail)
--       แก้หน้างานไม่ได้เลย ต้องแก้โค้ด+flash ใหม่
-- ใหม่: address = modbus addr (คงที่ตามฮาร์ดแวร์, มีอยู่แล้วใน seed 001) เป็น key
--       ส่วน location (หัวโรง/กลางโรง/ท้ายโรง) + enabled แก้ได้จากหน้า "จับคู่เซนเซอร์"
--       เฟิร์มแวร์ resolve sensor_id ด้วย address แทน location (ดู firmware/.../supabase.cpp)
--
-- ⚠️ ไม่แตะ control/safety — T_air ที่ใช้คุมยังเป็น max ของทุกจุดอากาศที่อ่านได้เหมือนเดิม
--    (docs/03-control-logic.md) ธง enabled คุมแค่ว่าจะ "แสดง/นับ" บน dashboard หรือไม่
--
-- เพิ่มคอลัมน์ + RPC ใหม่เท่านั้น ไม่ลบ/ไม่แก้ข้อมูลเดิม · idempotent รันซ้ำได้
-- ต้องมี 001 (sensors + seed air_th addr 1/2/3) ก่อน
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) sensors.enabled — "ใช้งานจุดนี้อยู่ไหม"
--    ใช้กับ air_th เป็นหลัก (โรงจริงมี 2 ตัว: addr 1 กับ 3 — addr 2 ไม่ได้ติดตั้ง)
--    default true เพื่อไม่เปลี่ยนพฤติกรรมของแถวเดิมทั้งหมด
-- ----------------------------------------------------------------------------

alter table sensors add column if not exists enabled boolean not null default true;

comment on column sensors.enabled is
  'false = ไม่ได้ติดตั้ง/ไม่ใช้จุดนี้ — dashboard ไม่แสดงและไม่นับ · ไม่กระทบ control/safety บน ESP32';

-- ----------------------------------------------------------------------------
-- 2) RPC ตั้งตำแหน่ง + เปิด/ปิด ของเซนเซอร์อากาศ (authenticated เท่านั้น)
--    p_address = modbus addr เป็นสตริง ('1' | '2' | '3') — key ที่ไม่เปลี่ยนตามการตั้งค่า
--    p_location = 'head' | 'mid' | 'tail' (null/'' = ยังไม่ระบุตำแหน่ง)
--    หนึ่งตำแหน่งมีได้ตัวเดียว: เคลียร์ตำแหน่งนี้จากตัวอื่นก่อน แล้วค่อยเซ็ตให้ตัวนี้
-- ----------------------------------------------------------------------------

create or replace function set_air_sensor(
  p_house    text,
  p_address  text,
  p_location text,
  p_enabled  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception 'unauthorized: ต้อง login ก่อนถึงแก้ตำแหน่งเซนเซอร์ได้';
  end if;
  if p_address is null or p_address = '' then
    raise exception 'address (modbus addr) ว่างไม่ได้';
  end if;
  if p_location is not null and p_location <> '' and p_location not in ('head', 'mid', 'tail') then
    raise exception 'location ต้องเป็น head | mid | tail (ได้รับ %)', p_location;
  end if;

  -- ตำแหน่งซ้ำไม่ได้ — ปลดตัวอื่นที่ถืออยู่ก่อน (ผู้ใช้ย้ายเซนเซอร์)
  if p_location is not null and p_location <> '' then
    update sensors set location = null
      where house_id = p_house and kind = 'air_th' and location = p_location and address <> p_address;
  end if;

  update sensors
     set location = nullif(coalesce(p_location, ''), ''),
         enabled  = coalesce(p_enabled, true)
   where house_id = p_house and kind = 'air_th' and address = p_address;
end $$;

revoke all on function set_air_sensor(text, text, text, boolean) from public;
grant execute on function set_air_sensor(text, text, text, boolean) to authenticated;
