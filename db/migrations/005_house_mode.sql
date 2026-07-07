-- 005 house: เก็บ mode ล่าสุดที่รายงานมาจาก ESP32 (telemetry.mode)
-- ต่างจาก active_profile (ค่าที่ backend ตั้งใจให้เป็น) เพราะ mode สะท้อนสถานะจริงของ FSM
-- (เช่น SAFE_HOLD ตอน safety trip) — ดู docs/03-control-logic.md ข้อ FSM
ALTER TABLE houses ADD COLUMN last_mode TEXT;
ALTER TABLE houses ADD COLUMN last_mode_ts TIMESTAMPTZ;
