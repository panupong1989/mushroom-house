import type { ActuatorKind, FsmMode } from './types';

export { ACTUATOR_KINDS } from './types';

// ค่าตั้งต้น fallback (ตรงกับ db/seed.sql + docs/03-control-logic.md)
// ใช้เมื่อ GET /houses/:id/config ยังโหลดไม่เสร็จ/ล้มเหลว — ของจริงต้อง fetch มาเสมอเมื่อทำได้
export const FALLBACK_SETPOINTS = {
  // โซนทอง (ช่วงอุณหภูมิเป้าหมายตอนออกดอก) — แสดงผลอย่างเดียว ไม่ได้คุมอุปกรณ์
  // (เฟิร์มแวร์ไม่ได้อ่าน temp_fruit_* เลย ตัวคุมจริงคือ temp_heater_on/off + temp_exhaust_on)
  temp_fruit_min: 30,
  temp_fruit_max: 33,
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

// label ของจุดเซนเซอร์: ใช้ชื่อตำแหน่งถ้ารู้ ไม่งั้น fallback เป็น location ดิบ หรือ "เซนเซอร์ #id"
// สำคัญ: เซนเซอร์ที่ location เป็น null ต้อง "แสดง" ด้วย label สำรอง ไม่ใช่ยุบหายไปเงียบๆ (ดู lib/derive.ts)
export function sensorPointLabel(location: string | null, sensorId: number | null): string {
  if (location && LOCATION_LABELS[location]) return LOCATION_LABELS[location];
  if (location) return location;
  return sensorId != null ? `เซนเซอร์ #${sensorId}` : 'เซนเซอร์';
}

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
// firmware ส่ง sensor_readings ทุก ~20s (READINGS_POST_PERIOD_MS) — เผื่อ 90s (~4 รอบ)
// กันขึ้น "ออฟไลน์" กระพริบตอน post คลาดนิดหน่อย/WiFi สะดุดสั้นๆ (เดิม 30s แน่นเกินไป)
export const OFFLINE_THRESHOLD_MS = 90_000;
// ตาข่ายกันพลาดของ realtime: ดึงค่าล่าสุดซ้ำทุก 30 วิ (< OFFLINE_THRESHOLD_MS) เผื่อ WebSocket
// หลุด/หลับแล้ว postgres_changes หายไปเงียบๆ — ไม่งั้น dashboard ค้างแล้วขึ้น "ออฟไลน์" ทั้งที่บอร์ดยิงอยู่
export const LATEST_REFRESH_MS = 30_000;
// live scan (bed_scan) ต้องสดกว่า — ESP32 push ทุก ~5 วิ และหน้าจับคู่ตัดสินจาก "ค่าพุ่ง" ตอนกำเซนเซอร์
export const BED_SCAN_REFRESH_MS = 5_000;
// กราฟย้อนหลัง: ดึงซ้ำทุก 30 วิ เมื่อดูช่วง "ย้อนหลังจากตอนนี้" (bucket เล็กสุดคือ 1 นาที ที่ช่วง 1 ชม.
// จึงไม่ต้องถี่กว่านี้) — กันเส้นค้างขาดช่วงเวลาเปิดหน้าทิ้งไว้
export const HISTORY_REFRESH_MS = 30_000;
