-- ============================================================================
-- supabase/migrations/006_drop_legacy_sensors.sql
-- ⚠️ DESTRUCTIVE — ลบ sensor เก่า (scaffold placeholder) ที่ไม่ตรงกับ hardware จริงเฟส 1
-- ทำตอนนี้เพราะยังไม่มีข้อมูลจริง (จังหวะปลอดภัยที่สุด) — review แล้วก่อน apply (PR)
--
-- ก่อนหน้านี้ 005_real_sensors.sql "เพิ่มอย่างเดียว ไม่ลบ" จึงเหลือ legacy ค้างอยู่ 4 ตัว
-- ที่ไม่ตรงกับโรงจริง (2 แถว × 3 ชั้น). ไฟล์นี้เก็บกวาดให้ sensors ตรงกับของจริง.
--
-- ลบ (house-01):
--   - bed_temp legacy 3 ตัว: addr 28-0000-01/02/03 (single-row สมมติตอน scaffold, row_no/tier = null)
--     → ถูกแทนด้วย row1/row2 × top/mid/bottom (6 ตัว) จาก 005 แล้ว
--   - air_th 'mid' (addr='2'): สเปกโรงจริงวัดอากาศแค่ head+tail — ตัว mid ไม่ได้ใช้
--     ⚠️ มี sensor_readings ผูกอยู่ 1 แถว (test/mock 31.5°C ts 2026-07-09 ตอน scaffold) →
--        ถูกลบตาม FK ON DELETE CASCADE (ยืนยันแล้วว่าเป็น dev leftover ไม่ใช่ข้อมูลจริง)
--
-- คงไว้ (เหลือ 10 ตัว):
--   - air_th head + tail (2) · bed_temp row1/row2 × top/mid/bottom (6) · outside_temp (1) · water_level (1)
--   - water_level เก็บไว้ตามการตัดสินใจของ Beer (ยังไม่ตัดทิ้งเฟสนี้)
--
-- idempotent — รันซ้ำได้ (DELETE ที่ลบหมดแล้วจะไม่ลบอะไรเพิ่ม)
-- ============================================================================

delete from sensors
where house_id = 'house-01'
  and (
    -- legacy single-row bed_temp (ไม่มี row_no/tier) — แทนด้วย 6 ตัวจริงจาก 005 แล้ว
    (kind = 'bed_temp' and row_no is null)
    -- air_th ที่ไม่ใช่ head/tail (คือ 'mid') — สเปกจริงใช้แค่ head+tail
    or (kind = 'air_th' and location not in ('head', 'tail'))
  );
-- readings ของ sensor ที่ถูกลบ (+ rollup ถ้ามี) หายตาม FK ON DELETE CASCADE อัตโนมัติ
