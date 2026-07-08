// Additive safety gate สำหรับ manual command จาก UI — ดู docs/03-control-logic.md "INTERLOCK เหล็ก"
// ("น้ำต่ำ/กองร้อน>40/หนาว<27.5 ห้ามพ่น") ไม่แก้ semantics ของ evaluateControl (control.ts)
// หรือ firmware เดิม — เป็นแค่ read-only pre-check ก่อน forward คำสั่งไปที่ MQTT/ESP32
import { q } from '../db/pool.js';
import { DEFAULT_SETPOINTS } from './control.js';

export type GuardResult = { allowed: true } | { allowed: false; code: string; reason: string };

async function latestAirTempMax(houseId: string): Promise<number | null> {
  const r = await q(
    `SELECT r.value FROM sensors s JOIN LATERAL (
       SELECT value FROM sensor_readings WHERE sensor_id=s.id AND metric='temp' ORDER BY ts DESC LIMIT 1
     ) r ON true WHERE s.house_id=$1 AND s.kind='air_th'`,
    [houseId]
  );
  if (!r.rows.length) return null;
  return Math.max(...r.rows.map((row: { value: number }) => Number(row.value)));
}

async function latestBedTempMax(houseId: string): Promise<number | null> {
  const r = await q(
    `SELECT r.value FROM sensors s JOIN LATERAL (
       SELECT value FROM sensor_readings WHERE sensor_id=s.id AND metric='temp' ORDER BY ts DESC LIMIT 1
     ) r ON true WHERE s.house_id=$1 AND s.kind='bed_temp'`,
    [houseId]
  );
  if (!r.rows.length) return null;
  return Math.max(...r.rows.map((row: { value: number }) => Number(row.value)));
}

async function latestWaterOk(houseId: string): Promise<boolean | null> {
  const r = await q(
    `SELECT r.value FROM sensors s JOIN LATERAL (
       SELECT value FROM sensor_readings WHERE sensor_id=s.id ORDER BY ts DESC LIMIT 1
     ) r ON true WHERE s.house_id=$1 AND s.kind='water_level' LIMIT 1`,
    [houseId]
  );
  if (!r.rows.length) return null;
  return Number(r.rows[0].value) === 1;
}

async function latestActuatorStates(houseId: string): Promise<Record<string, boolean>> {
  const r = await q(
    `SELECT a.kind, e.state FROM actuators a JOIN LATERAL (
       SELECT state FROM actuator_events WHERE actuator_id=a.id ORDER BY ts DESC LIMIT 1
     ) e ON true WHERE a.house_id=$1 AND a.kind IN ('mist','heater')`,
    [houseId]
  );
  return Object.fromEntries(r.rows.map((row: { kind: string; state: boolean }) => [row.kind, row.state]));
}

// เช็คเฉพาะ action:'on' ของ mist/heater เท่านั้น — off/auto และอุปกรณ์อื่นผ่านเสมอ
// (exhaust/light/circulation ไม่มี interlock ตาม docs — ไม่แตะพฤติกรรมเดิมของอุปกรณ์เหล่านี้)
export async function checkCommandGuard(houseId: string, kind: string, action: string): Promise<GuardResult> {
  if (action !== 'on' || (kind !== 'mist' && kind !== 'heater')) return { allowed: true };

  if (kind === 'mist') {
    const waterOk = await latestWaterOk(houseId);
    if (waterOk === false) {
      return { allowed: false, code: 'LOW_WATER', reason: 'ระดับน้ำต่ำ — ห้ามพ่นหมอก' };
    }

    const bedTempMax = await latestBedTempMax(houseId);
    if (bedTempMax !== null && bedTempMax >= DEFAULT_SETPOINTS.bedDanger) {
      return { allowed: false, code: 'BED_OVERHEAT', reason: `กองเห็ดร้อนเกิน (${bedTempMax.toFixed(1)}°C >= ${DEFAULT_SETPOINTS.bedDanger}°C) — ห้ามพ่นหมอก` };
    }

    const airTemp = await latestAirTempMax(houseId);
    if (airTemp !== null && airTemp < DEFAULT_SETPOINTS.tempHeaterOn) {
      return { allowed: false, code: 'COLD_INTERLOCK', reason: `อากาศเย็นเกิน (${airTemp.toFixed(1)}°C < ${DEFAULT_SETPOINTS.tempHeaterOn}°C) — ห้ามพ่นหมอกเด็ดขาด` };
    }

    const states = await latestActuatorStates(houseId);
    if (states.heater === true) {
      return { allowed: false, code: 'HEATER_MIST_INTERLOCK', reason: 'ฮีทเตอร์กำลังทำงานอยู่ — ห้ามเปิดพ่นหมอกพร้อมกัน' };
    }
    return { allowed: true };
  }

  // kind === 'heater'
  const states = await latestActuatorStates(houseId);
  if (states.mist === true) {
    return { allowed: false, code: 'HEATER_MIST_INTERLOCK', reason: 'ปั๊มพ่นหมอกกำลังทำงานอยู่ — ห้ามเปิดฮีทเตอร์พร้อมกัน' };
  }
  return { allowed: true };
}
