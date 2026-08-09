// รูปแบบข้อมูลจาก backend — อิงตาม docs/05-api.md และ backend/src/routes/*
// TODO(CC): sync กับ backend เมื่อมี OpenAPI/schema กลาง

export type ActuatorKind = 'mist' | 'heater' | 'exhaust' | 'light' | 'circulation';

export const ACTUATOR_KINDS: ActuatorKind[] = ['mist', 'heater', 'exhaust', 'light', 'circulation'];

// firmware Mode enum — backend/src/services/ingest.ts MODE_NAMES
export type FsmMode = 'BOOT' | 'SELFTEST' | 'SPAWN_RUN' | 'FRUITING' | 'MANUAL' | 'SAFE_HOLD';

export type SensorLocation = 'head' | 'mid' | 'tail' | 'tank' | string;

export interface SensorReadingRow {
  id: number;
  // sensorId = PK ของเซนเซอร์ (ตาราง sensors.id) — identity ที่แท้จริง ไม่ null/ไม่ซ้ำ ใช้จัดกลุ่ม
  // ค่าล่าสุดต่อเซนเซอร์ (ดู lib/derive.ts) แทน (kind, location) ที่ยุบรวมกันได้เมื่อ location ซ้ำ/null
  // optional เพราะ path เก่า (backend REST /latest) ยังไม่ส่ง id มา — derive จะ fallback เป็น kind:location
  sensorId?: number;
  kind: string; // 'air_th' | 'bed_temp' | 'water_level' | 'outside_temp'
  location: SensorLocation | null;
  // แถวที่ 1/2 ของกอง (เฉพาะ bed_temp โรง 2 แถว, supabase/migrations/005_real_sensors.sql) — null/undefined
  // สำหรับ kind อื่นหรือ path ที่ไม่มีข้อมูลนี้ (backend REST เก่า)
  rowNo?: number | null;
  // ชั้นในกอง top/mid/bottom (เฉพาะ bed_temp) — ใช้ตั้ง label การ์ดหน้าแรกเป็น บน/กลาง/ล่าง
  tier?: string | null;
  metric: string; // 'temp' | 'rh' | 'level'
  value: number;
  ts: string;
}

export interface ActuatorStateRow {
  kind: ActuatorKind;
  state: boolean;
  ts: string;
}

export interface LatestResponse {
  sensors: SensorReadingRow[];
  actuators: ActuatorStateRow[];
  mode: FsmMode | null;
  mode_ts: string | null;
}

export type ConfigResponse = Record<string, number>;

export type Severity = 'info' | 'warn' | 'critical';

// ตาราง alerts (supabase/migrations/001_init.sql) — read-only ฝั่ง frontend (anon SELECT)
export interface AlertRow {
  id: number;
  ts: string;
  severity: Severity;
  code: string; // LOW_WATER | BED_OVERHEAT | HOT | SENSOR_LOST ...
  message: string | null;
  resolved_at: string | null; // null = ยังไม่หาย (เขียน resolved_at ต้องมี Auth — ดู roadmap)
}

// metadata ของเซนเซอร์ (ตาราง sensors) — ใช้ label/จัดกลุ่มเส้นกราฟย้อนหลัง (lib/history.ts)
export interface SensorMetaRow {
  id: number;
  location: string | null;
  rowNo: number | null; // เฉพาะ bed_temp โรง 2 แถว (supabase/migrations/005_real_sensors.sql)
  tier: string | null; // 'top' | 'mid' | 'bottom' เฉพาะ bed_temp
  // "จุดนี้ใช้งานจริงไหม" — กราฟย้อนหลังต้องกรองด้วย ไม่งั้นจุดที่ปลด ROM/ปิดไปแล้วยังโผล่เส้นผี
  // จากค่าเก่าที่ค้างใน sensor_readings (ดู lib/hooks.ts useSensorMeta)
  romId: string | null; // เฉพาะ bed_temp/outside_temp — null = ยังไม่จับคู่โพรบ
  enabled: boolean; // sensors.enabled (migration 011) — false = ไม่ได้ติดตั้ง
}

// ตาราง bed_scan (supabase/migrations/007_maintenance.sql) — live ROM ที่ ESP32 เจอบนบัส 1-Wire
// (upsert ทุก ~3 วิ, 1 แถวต่อ rom) ใช้ทำ live-mapping ในหน้า Maintenance
export interface BedScanRow {
  romId: string;
  tempC: number | null;
  updatedAt: string;
  ignored: boolean; // ผู้ใช้ทำเครื่องหมาย "ไม่ใช้" (supabase/migrations/010) — ไม่นับ/ไม่แสดงบน dashboard
}

// record ตำแหน่งเซนเซอร์ (sensors) สำหรับจับคู่ ROM — kind = 'bed_temp' | 'outside_temp'
export interface MappingSensor {
  id: number;
  kind: string;
  address: string; // key ตำแหน่งคงที่ (เช่น 'row1_head_top', 'outside') — ดู lib/maintenance.ts
  romId: string | null; // rom ที่ผูกอยู่ตอนนี้ (null = ยังไม่จับคู่)
}

// SensorPoint ต้องรู้ชั้น (tier) ด้วยเพื่อ label การ์ดในกองเป็น บน/กลาง/ล่าง — ดู lib/maintenance.ts
export type SensorTier = 'top' | 'mid' | 'bottom';

// เซนเซอร์อากาศ RS485 หนึ่งตัว สำหรับหน้า "จับคู่เซนเซอร์ความชื้น" (supabase/migrations/011)
// address = modbus addr (คีย์ฮาร์ดแวร์ที่ไม่เปลี่ยน) · uiPosition = ตำแหน่งที่โชว์ (แก้ได้)
export interface AirSensor {
  id: number;
  address: string; // '1' | '2' | '3'
  location: string | null; // คีย์ routing ของเฟิร์มแวร์ — read-only ฝั่งหน้าเว็บ
  uiPosition: string | null; // 'head' | 'mid' | 'tail' | null (= ใช้ location)
  enabled: boolean;
}

// ตาราง alert_config (008 + 009) — เปิด/ปิด + ค่าเกณฑ์การแจ้งเตือนต่อ code
export interface AlertConfigRow {
  code: string;
  enabled: boolean;
  threshold: number | null; // ค่าเกณฑ์ (แยกจาก setpoint); null = ไม่มีเกณฑ์ (LOW_WATER)
}

export type CommandAction = 'on' | 'off' | 'auto';

export interface CommandOkResult {
  status: 'ok';
  message?: string; // เช่น "ส่งคำสั่งแล้ว — รอ ESP32 รับคำสั่ง" (โหมด Supabase — ดู lib/supabaseData.ts)
}
export interface CommandRejectedResult {
  status: 'rejected';
  reason: string;
  code?: string;
}
export interface CommandErrorResult {
  status: 'error';
  message: string;
}
export type CommandResult = CommandOkResult | CommandRejectedResult | CommandErrorResult;
