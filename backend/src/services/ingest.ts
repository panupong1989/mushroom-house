import { q } from '../db/pool.js';

// telemetry: {ts, mode, water_ok, air_temp, air_rh, bed_max, air:[{addr,t,rh,ok}]}
export async function ingestTelemetry(houseId: string, d: any) {
  const rows: Array<[string, string, number]> = [];
  for (const a of d.air ?? []) {
    if (!a.ok) continue;
    rows.push([String(a.addr), 'temp', a.t]);
    rows.push([String(a.addr), 'rh', a.rh]);
  }
  for (const [addr, metric, value] of rows) {
    await q(
      `INSERT INTO sensor_readings (sensor_id, metric, value)
       SELECT id, $3, $4 FROM sensors WHERE house_id=$1 AND kind='air_th' AND address=$2`,
      [houseId, addr, metric, value]
    );
  }
  // TODO(CC): bed_temp readings, water_level, เก็บ mode ล่าสุดของ house
}

export async function ingestState(houseId: string, d: any) {
  const kinds = ['mist', 'heater', 'exhaust', 'light', 'circulation'] as const;
  for (const k of kinds) {
    if (typeof d[k] !== 'boolean') continue;
    await q(
      `INSERT INTO actuator_events (actuator_id, state, source, reason)
       SELECT id, $3, 'auto', 'state-report' FROM actuators WHERE house_id=$1 AND kind=$2`,
      [houseId, k, d[k]]
    );
  }
}

export async function ingestAlert(houseId: string, d: any) {
  await q(
    `INSERT INTO alerts (house_id, severity, code, message) VALUES ($1,$2,$3,$4)`,
    [houseId, d.severity ?? 'warn', d.code ?? 'UNKNOWN', d.message ?? '']
  );
}
