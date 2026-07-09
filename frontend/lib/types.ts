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
  kind: string; // 'air_th' | 'bed_temp' | 'water_level'
  location: SensorLocation | null;
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
