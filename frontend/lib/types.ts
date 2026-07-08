// รูปแบบข้อมูลจาก backend — อิงตาม docs/05-api.md และ backend/src/routes/*
// TODO(CC): sync กับ backend เมื่อมี OpenAPI/schema กลาง

export type ActuatorKind = 'mist' | 'heater' | 'exhaust' | 'light' | 'circulation';

export const ACTUATOR_KINDS: ActuatorKind[] = ['mist', 'heater', 'exhaust', 'light', 'circulation'];

// firmware Mode enum — backend/src/services/ingest.ts MODE_NAMES
export type FsmMode = 'BOOT' | 'SELFTEST' | 'SPAWN_RUN' | 'FRUITING' | 'MANUAL' | 'SAFE_HOLD';

export type SensorLocation = 'head' | 'mid' | 'tail' | 'tank' | string;

export interface SensorReadingRow {
  id: number;
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

export type CommandAction = 'on' | 'off' | 'auto';

export interface CommandOkResult {
  status: 'ok';
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
