import { q } from '../db/pool.js';

// firmware Mode enum (types.h): M_BOOT, M_SELFTEST, M_SPAWN_RUN, M_FRUITING, M_MANUAL, M_SAFE_HOLD
const MODE_NAMES = ['BOOT', 'SELFTEST', 'SPAWN_RUN', 'FRUITING', 'MANUAL', 'SAFE_HOLD'];

function normalizeMode(mode: unknown): string | null {
  if (typeof mode === 'number') return MODE_NAMES[mode] ?? null;
  if (typeof mode === 'string' && mode) return mode.toUpperCase();
  return null;
}

// telemetry: {ts, mode, water_ok, air_temp, air_rh, bed_max, air:[{addr,t,rh,ok}], bed:[{addr,temp}]}
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

  for (const b of d.bed ?? []) {
    if (b.ok === false) continue;
    await q(
      `INSERT INTO sensor_readings (sensor_id, metric, value)
       SELECT id, 'temp', $3 FROM sensors WHERE house_id=$1 AND kind='bed_temp' AND address=$2`,
      [houseId, String(b.addr), b.temp]
    );
  }

  if (typeof d.water_ok === 'boolean') {
    await q(
      `INSERT INTO sensor_readings (sensor_id, metric, value)
       SELECT id, 'level', $2 FROM sensors WHERE house_id=$1 AND kind='water_level'`,
      [houseId, d.water_ok ? 1 : 0]
    );
  }

  const mode = normalizeMode(d.mode);
  if (mode) {
    await q(`UPDATE houses SET last_mode=$2, last_mode_ts=now() WHERE id=$1`, [houseId, mode]);
  }
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
