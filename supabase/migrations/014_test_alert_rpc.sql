-- ============================================================================
-- supabase/migrations/014_test_alert_rpc.sql
-- ปุ่ม "ทดสอบ" ต่อชนิดแจ้งเตือนในหน้าตั้งค่า — ยิง alert ปลอมเพื่อเช็คว่าเส้นทาง
-- alerts INSERT -> Database Webhook -> notify-line -> LINE ยังทำงานอยู่ไหม
--
-- ต้องเป็น RPC เพราะ RLS ของ alerts เปิดให้ authenticated แค่ SELECT (INSERT เป็นของ
-- service_role/ESP32 เท่านั้น — ดู 003_auth_rls.sql) ไม่อยากเปิด policy INSERT ให้ user
-- กว้างๆ เพราะจะเขียน alert อะไรก็ได้ · RPC นี้คุมรูปแบบให้: message คงที่ + severity
-- ตามชนิดจริง เขียนได้เฉพาะ code ที่รู้จัก
--
-- ⚠️ ไม่แตะ control/safety — แค่ insert แถวใน alerts (ตารางบันทึก/แจ้งเตือน ไม่ใช่ตัวสั่งงาน)
-- idempotent — create or replace
-- ============================================================================

create or replace function send_test_alert(p_house text, p_code text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sev text;
  v_id  bigint;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'unauthorized: ต้อง login ก่อนถึงยิงทดสอบแจ้งเตือนได้';
  end if;

  -- severity ต้องตรงกับที่เฟิร์มแวร์ใช้จริง (main.cpp notify_check) ไม่งั้นทดสอบแล้วหลอกตัวเอง:
  -- ตัว warn จะไม่เข้า LINE ถ้า LINE_MIN_SEVERITY=critical ซึ่งเป็นพฤติกรรมจริงที่ควรเห็นตอนเทส
  v_sev := case p_code
    when 'LOW_WATER'    then 'critical'
    when 'HOT'          then 'critical'
    when 'BED_OVERHEAT' then 'critical'
    when 'COLD'         then 'warn'
    when 'BED_LOW'      then 'warn'
    when 'RH_HIGH'      then 'warn'
    when 'RH_LOW'       then 'warn'
    else null
  end;

  if v_sev is null then
    raise exception 'ไม่รู้จัก alert code: %', p_code;
  end if;

  insert into alerts (house_id, severity, code, message)
  values (p_house, v_sev, p_code, '🧪 ทดสอบระบบแจ้งเตือน (ไม่ใช่เหตุการณ์จริง)')
  returning id into v_id;

  return v_id;
end $$;

revoke all on function send_test_alert(text, text) from public;
grant execute on function send_test_alert(text, text) to authenticated;
