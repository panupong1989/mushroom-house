import type { DerivedTelemetry } from './derive';
import { FALLBACK_SETPOINTS } from './constants';
import type { ActuatorKind, CommandAction } from './types';

// คำเตือนล่วงหน้าฝั่ง UI เท่านั้น (best-effort) — mirror กฎเหล็กจาก docs/03-control-logic.md
// ("น้ำต่ำ/กองร้อน>40/หนาว<27.5 ห้ามพ่น") เพื่อเตือนผู้ใช้ก่อนกด ไม่ใช่ authority จริง
// คำตอบจาก backend (409 + reason) คือของจริงเสมอ ดู lib/api.ts sendActuatorCommand
export function predictBlockReason(
  kind: ActuatorKind,
  action: CommandAction,
  telemetry: DerivedTelemetry,
  setpoints: Record<string, number> = FALLBACK_SETPOINTS
): string | null {
  if (action !== 'on') return null;

  if (kind === 'mist') {
    if (telemetry.waterOk === false) return 'ระดับน้ำต่ำ — ห้ามพ่นหมอก';
    if (telemetry.bedTempMax !== null && telemetry.bedTempMax >= (setpoints.bed_danger ?? FALLBACK_SETPOINTS.bed_danger)) {
      return 'กองเห็ดร้อนเกิน — ห้ามพ่นหมอก';
    }
    if (
      telemetry.airTempCtrl !== null &&
      telemetry.airTempCtrl < (setpoints.temp_heater_on ?? FALLBACK_SETPOINTS.temp_heater_on)
    ) {
      return 'อากาศเย็นเกิน (< 27.5°C) — ห้ามพ่นหมอกเด็ดขาด';
    }
    if (telemetry.actuators.heater) return 'ฮีทเตอร์กำลังทำงาน — ห้ามเปิดพ่นหมอกพร้อมกัน';
  }

  if (kind === 'heater' && telemetry.actuators.mist) {
    return 'ปั๊มพ่นหมอกกำลังทำงาน — ห้ามเปิดฮีทเตอร์พร้อมกัน';
  }

  return null;
}
