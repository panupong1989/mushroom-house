import type { ActuatorKind, FsmMode } from './types';

// ค่าตั้งต้น fallback (ตรงกับ db/seed.sql + docs/03-control-logic.md)
// ใช้เมื่อ GET /houses/:id/config ยังโหลดไม่เสร็จ/ล้มเหลว — ของจริงต้อง fetch มาเสมอเมื่อทำได้
export const FALLBACK_SETPOINTS = {
  temp_fruit_min: 28,
  temp_fruit_max: 32,
  temp_heater_on: 27.5,
  temp_heater_off: 29.5,
  temp_exhaust_on: 33,
  temp_danger_hot: 38,
  rh_min: 85,
  rh_max: 90,
  rh_high: 92,
  bed_danger: 40,
};

export const GAUGE_MIN = 15;
export const GAUGE_MAX = 45;

export const ACTUATOR_LABELS: Record<ActuatorKind, string> = {
  mist: 'ปั๊มพ่นหมอก',
  heater: 'ฮีทเตอร์',
  exhaust: 'พัดลมดูดอากาศ',
  light: 'หลอดไฟ',
  circulation: 'พัดลมหมุนเวียน',
};

export const LOCATION_LABELS: Record<string, string> = {
  head: 'หัวโรง',
  mid: 'กลางโรง',
  tail: 'ท้ายโรง',
  tank: 'ถังน้ำ',
};

export const MODE_LABELS: Record<FsmMode, string> = {
  BOOT: 'กำลังเริ่มระบบ',
  SELFTEST: 'ตรวจสอบระบบ',
  SPAWN_RUN: 'AUTO · เดินเชื้อ',
  FRUITING: 'AUTO · ออกดอก',
  MANUAL: 'MANUAL',
  SAFE_HOLD: 'หยุดฉุกเฉิน (SAFE HOLD)',
};

// ttl_sec สูงสุดที่ backend ยอมรับ (backend/src/routes/actuators.ts: max(3600))
// ใช้ค่านี้ตอนกด [เปิด] แบบ manual ค้าง แล้ว refresh ก่อนหมดอายุ (ดู hooks/useManualHold.ts)
export const MANUAL_TTL_SEC = 3600;
export const MANUAL_REFRESH_MS = 4 * 60 * 1000; // ต่ออายุทุก 4 นาที (< 60 นาที กัน TTL หมด)
export const POLL_INTERVAL_MS = 4000;
export const OFFLINE_THRESHOLD_MS = 30_000; // ไม่มีข้อมูลใหม่เกิน 30s ถือว่าออฟไลน์
