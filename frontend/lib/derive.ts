import { OFFLINE_THRESHOLD_MS } from './constants';
import type { ActuatorKind, LatestResponse, SensorReadingRow } from './types';

// จุดข้อมูลของ "หนึ่งเซนเซอร์" — จัดกลุ่มด้วย sensorId (PK จริง) ไม่ใช่ location เพราะ location
// เป็น metadata ที่ null/ซ้ำได้ ถ้ายุบด้วย location ค่ากองรวมกันเงียบๆ แล้ว gauge (ค่าคุมความปลอดภัย)
// จะเพี้ยนโดยไม่มีสัญญาณ — ดู docs/03-control-logic.md (T_air = max ของทุกจุด)
export interface SensorPoint {
  sensorId: number | null; // null เฉพาะ path เก่า (backend REST) ที่ไม่ส่ง id — fallback ไป kind:location
  location: string | null;
  temp: number | null;
  rh: number | null; // เฉพาะ air_th
  ts: number | null;
}

export interface DerivedTelemetry {
  air: SensorPoint[]; // เรียงตามลำดับจุด (head→mid→tail→อื่นๆ) สำหรับแสดงผลรายจุด
  airTempCtrl: number | null; // ค่าใช้คุม = max จากทุกเซนเซอร์อากาศ (docs/03-control-logic.md)
  airRhAvg: number | null;
  bed: SensorPoint[];
  bedTempMax: number | null;
  waterOk: boolean | null;
  actuators: Record<ActuatorKind, boolean | null>;
  lastUpdateMs: number | null;
  online: boolean;
}

// สถานะระหว่างสร้าง — เก็บ ts ของ temp/rh แยกกันเพื่อเลือก "ค่าล่าสุด" ของแต่ละ metric อย่างถูกต้อง
interface PointAcc {
  sensorId: number | null;
  location: string | null;
  temp: number | null;
  tempTs: number | null;
  rh: number | null;
  rhTs: number | null;
}

// ลำดับการแสดงผลรายจุด — จุดที่รู้ตำแหน่งมาก่อนตามสายโรง แล้วค่อยจุดที่ location ผิดปกติ (null/ไม่รู้จัก)
const LOC_ORDER = ['head', 'mid', 'tail', 'tank'];

function toMs(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const ms = new Date(ts).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// identity ของเซนเซอร์: sensorId ก่อนเสมอ (ไม่ null/ไม่ซ้ำ) — fallback kind:location เฉพาะ path เก่า
function identityKey(row: SensorReadingRow): string {
  return row.sensorId != null ? `id:${row.sensorId}` : `kl:${row.kind}:${row.location ?? '∅'}`;
}

function accToPoint(a: PointAcc): SensorPoint {
  return { sensorId: a.sensorId, location: a.location, temp: a.temp, rh: a.rh, ts: a.tempTs ?? a.rhTs };
}

function orderPoints(a: SensorPoint, b: SensorPoint): number {
  const ia = LOC_ORDER.indexOf(a.location ?? '');
  const ib = LOC_ORDER.indexOf(b.location ?? '');
  const oa = ia === -1 ? 99 : ia;
  const ob = ib === -1 ? 99 : ib;
  if (oa !== ob) return oa - ob;
  return (a.sensorId ?? 0) - (b.sensorId ?? 0);
}

function upsertTemp(map: Map<string, PointAcc>, row: SensorReadingRow, ts: number | null) {
  const key = identityKey(row);
  const cur = map.get(key) ?? { sensorId: row.sensorId ?? null, location: row.location, temp: null, tempTs: null, rh: null, rhTs: null };
  if (cur.tempTs === null || (ts ?? 0) >= cur.tempTs) {
    cur.temp = row.value;
    cur.tempTs = ts;
  }
  cur.location = cur.location ?? row.location;
  map.set(key, cur);
}

function upsertRh(map: Map<string, PointAcc>, row: SensorReadingRow, ts: number | null) {
  const key = identityKey(row);
  const cur = map.get(key) ?? { sensorId: row.sensorId ?? null, location: row.location, temp: null, tempTs: null, rh: null, rhTs: null };
  if (cur.rhTs === null || (ts ?? 0) >= cur.rhTs) {
    cur.rh = row.value;
    cur.rhTs = ts;
  }
  cur.location = cur.location ?? row.location;
  map.set(key, cur);
}

// รวมค่าล่าสุด "ต่อเซนเซอร์" (จัดกลุ่มด้วย sensorId) แล้วค่อย aggregate — airTempCtrl = max ของทุก
// เซนเซอร์อากาศ, airRhAvg = เฉลี่ยเฉพาะเซนเซอร์ที่มี RH, bedTempMax = max ของทุกโพรบในกอง
export function deriveTelemetry(latest: LatestResponse | null, nowMs: number): DerivedTelemetry {
  const airBy = new Map<string, PointAcc>();
  const bedBy = new Map<string, PointAcc>();
  let waterOk: number | null = null;
  let waterTs: number | null = null;
  let lastUpdateMs: number | null = toMs(latest?.mode_ts ?? null);

  for (const row of latest?.sensors ?? []) {
    const ts = toMs(row.ts);
    if (ts !== null && (lastUpdateMs === null || ts > lastUpdateMs)) lastUpdateMs = ts;

    if (row.kind === 'air_th') {
      if (row.metric === 'temp') upsertTemp(airBy, row, ts);
      else if (row.metric === 'rh') upsertRh(airBy, row, ts);
    } else if (row.kind === 'bed_temp') {
      if (row.metric === 'temp') upsertTemp(bedBy, row, ts);
    } else if (row.kind === 'water_level' && row.metric === 'level') {
      if (waterTs === null || (ts ?? 0) >= waterTs) {
        waterOk = row.value;
        waterTs = ts;
      }
    }
  }

  const air = Array.from(airBy.values()).map(accToPoint).sort(orderPoints);
  const bed = Array.from(bedBy.values()).map(accToPoint).sort(orderPoints);

  const airTemps = air.map((p) => p.temp).filter((v): v is number => v !== null);
  const airRhs = air.map((p) => p.rh).filter((v): v is number => v !== null);
  const bedTemps = bed.map((p) => p.temp).filter((v): v is number => v !== null);

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
