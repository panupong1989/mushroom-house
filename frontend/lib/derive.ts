import { OFFLINE_THRESHOLD_MS } from './constants';
import type { ActuatorKind, LatestResponse } from './types';

export interface LocationReading {
  temp: number | null;
  rh?: number | null;
  ts: number | null;
}

export interface DerivedTelemetry {
  air: Record<string, LocationReading>;
  airTempCtrl: number | null; // ค่าใช้คุม = max จาก 3 จุด (docs/03-control-logic.md)
  airRhAvg: number | null;
  bed: Record<string, LocationReading>;
  bedTempMax: number | null;
  waterOk: boolean | null;
  actuators: Record<ActuatorKind, boolean | null>;
  lastUpdateMs: number | null;
  online: boolean;
}

function toMs(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const ms = new Date(ts).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// รวมค่าล่าสุดต่อ (sensor, metric) จาก /houses/:id/latest — query ฝั่ง backend คืนแถวได้สูงสุด 2
// แถวต่อเซนเซอร์ (ORDER BY ts DESC LIMIT 2) โดยไม่รับประกันลำดับข้ามเซนเซอร์ จึงต้อง reduce เอง
export function deriveTelemetry(latest: LatestResponse | null, nowMs: number): DerivedTelemetry {
  const air: Record<string, LocationReading & { rhTs?: number | null }> = {};
  const bed: Record<string, LocationReading> = {};
  let waterOk: number | null = null;
  let waterTs: number | null = null;
  let lastUpdateMs: number | null = toMs(latest?.mode_ts ?? null);

  for (const row of latest?.sensors ?? []) {
    const loc = row.location ?? 'unknown';
    const ts = toMs(row.ts);
    if (ts !== null && (lastUpdateMs === null || ts > lastUpdateMs)) lastUpdateMs = ts;

    if (row.kind === 'air_th') {
      const cur = air[loc] ?? { temp: null, rh: null, ts: null };
      if (row.metric === 'temp' && (cur.ts === null || (ts ?? 0) >= cur.ts)) {
        cur.temp = row.value;
        cur.ts = ts;
      } else if (row.metric === 'rh' && (cur.rhTs === undefined || cur.rhTs === null || (ts ?? 0) >= cur.rhTs)) {
        cur.rh = row.value;
        cur.rhTs = ts;
      }
      air[loc] = cur;
    } else if (row.kind === 'bed_temp') {
      const cur = bed[loc] ?? { temp: null, ts: null };
      if (row.metric === 'temp' && (cur.ts === null || (ts ?? 0) >= cur.ts)) {
        cur.temp = row.value;
        cur.ts = ts;
      }
      bed[loc] = cur;
    } else if (row.kind === 'water_level' && row.metric === 'level') {
      if (waterTs === null || (ts ?? 0) >= waterTs) {
        waterOk = row.value;
        waterTs = ts;
      }
    }
  }

  const airTemps = Object.values(air)
    .map((r) => r.temp)
    .filter((v): v is number => v !== null);
  const airRhs = Object.values(air)
    .map((r) => r.rh)
    .filter((v): v is number => v !== null && v !== undefined);
  const bedTemps = Object.values(bed)
    .map((r) => r.temp)
    .filter((v): v is number => v !== null);

  const actuators = Object.fromEntries(
    (latest?.actuators ?? []).map((a) => {
      const ts = toMs(a.ts);
      if (ts !== null && (lastUpdateMs === null || ts > lastUpdateMs)) lastUpdateMs = ts;
      return [a.kind, a.state];
    })
  ) as Record<ActuatorKind, boolean | null>;

  return {
    air,
    airTempCtrl: airTemps.length ? Math.max(...airTemps) : null,
    airRhAvg: airRhs.length ? airRhs.reduce((a, b) => a + b, 0) / airRhs.length : null,
    bed,
    bedTempMax: bedTemps.length ? Math.max(...bedTemps) : null,
    waterOk: waterOk === null ? null : waterOk === 1,
    actuators,
    lastUpdateMs,
    online: lastUpdateMs !== null && nowMs - lastUpdateMs < OFFLINE_THRESHOLD_MS,
  };
}
