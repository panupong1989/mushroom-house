// Logic กราฟย้อนหลัง (read-only) — bucket ค่าเซนเซอร์อากาศตามช่วงเวลา
// temp ต่อ bucket = "ค่าสูงสุด" (สะท้อน airTempCtrl ที่ใช้คุม — docs/03-control-logic.md)
// rh ต่อ bucket = "ค่าเฉลี่ย" ของ reading ในช่วงนั้น
import type { SensorReadingRow } from './types';

export type HistoryRange = '24h' | '7d';

export const RANGE_MS: Record<HistoryRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

// จำนวน bucket ต่อช่วง (คุมความละเอียด/จำนวนจุดบนกราฟ)
export const RANGE_BUCKETS: Record<HistoryRange, number> = {
  '24h': 48, // ~30 นาที/จุด
  '7d': 56, // ~3 ชม./จุด
};

export interface Point {
  t: number; // เวลา (ms) กึ่งกลาง bucket
  v: number;
}

export interface AirHistory {
  temp: Point[];
  rh: Point[];
}

// bucket rows (air_th temp/rh) ในช่วง [sinceMs, nowMs] เป็น n จุด
// bucket ที่ไม่มีข้อมูลจะถูกข้าม (กราฟจะเว้นช่วง ไม่ลากผ่านค่าปลอม)
export function bucketAirHistory(
  rows: SensorReadingRow[],
  sinceMs: number,
  nowMs: number,
  buckets: number
): AirHistory {
  const span = Math.max(1, nowMs - sinceMs);
  const width = span / buckets;
  const temps: number[][] = Array.from({ length: buckets }, () => []);
  const rhs: number[][] = Array.from({ length: buckets }, () => []);

  for (const r of rows) {
    if (r.kind !== 'air_th') continue;
    const t = new Date(r.ts).getTime();
    if (Number.isNaN(t) || t < sinceMs || t > nowMs) continue;
    let idx = Math.floor((t - sinceMs) / width);
    if (idx < 0) idx = 0;
    if (idx >= buckets) idx = buckets - 1;
    if (r.metric === 'temp') temps[idx].push(r.value);
    else if (r.metric === 'rh') rhs[idx].push(r.value);
  }

  const temp: Point[] = [];
  const rh: Point[] = [];
  for (let i = 0; i < buckets; i++) {
    const center = sinceMs + (i + 0.5) * width;
    if (temps[i].length) temp.push({ t: center, v: Math.max(...temps[i]) });
    if (rhs[i].length) rh.push({ t: center, v: rhs[i].reduce((a, b) => a + b, 0) / rhs[i].length });
  }
  return { temp, rh };
}

// ขอบเขตแกน y แบบมี padding เล็กน้อย (คืน null ถ้าไม่มีจุด)
export function seriesBounds(points: Point[], pad = 1): { min: number; max: number } | null {
  if (!points.length) return null;
  let min = Infinity, max = -Infinity;
  for (const p of points) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  if (min === max) { min -= pad; max += pad; }
  else { min -= pad; max += pad; }
  return { min, max };
}

// ============================================================================
// กราฟย้อนหลังทั่วไปแบบต่อเซนเซอร์ (bed_temp 6 จุด / air_th head-tail / outside_temp)
// อ่านจาก RPC sensor_history / sensor_history_range (supabase/migrations/005_real_sensors.sql)
// ต่างจาก bucketAirHistory/AirHistory ด้านบน (ยุบรวมทุกเซนเซอร์ air_th เป็นเส้นเดียว) ตรงที่คืนค่า
// แยกต่อ sensor_id+metric ให้ component เลือกจับกลุ่ม/สีเอง
// ============================================================================

export type RangeKey = '1h' | '4h' | '12h' | '24h' | 'week' | 'month' | 'year';

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '1h', label: '1 ชม.' },
  { key: '4h', label: '4 ชม.' },
  { key: '12h', label: '12 ชม.' },
  { key: '24h', label: '24 ชม.' },
  { key: 'week', label: 'สัปดาห์' },
  { key: 'month', label: 'เดือน' },
  { key: 'year', label: 'ปี' },
];

export interface RangeMeta {
  spanMs: number;
  bucketSeconds: number;
  rollup: boolean; // true = อ่าน sensor_readings_hourly (rollup), false = อ่าน raw
}

// ต้องตรงกับ sensor_history_range ใน supabase/migrations/005_real_sensors.sql (ค่า bucket/rollup
// ต่อช่วงต้องเหมือนกันทั้งสองฝั่ง ไม่งั้นจำนวนจุดที่ frontend คาดหวัง (mock) กับที่ RPC คืนจะไม่ตรงกัน)
export const RANGE_META: Record<RangeKey, RangeMeta> = {
  '1h': { spanMs: 60 * 60 * 1000, bucketSeconds: 60, rollup: false },
  '4h': { spanMs: 4 * 60 * 60 * 1000, bucketSeconds: 300, rollup: false },
  '12h': { spanMs: 12 * 60 * 60 * 1000, bucketSeconds: 900, rollup: false },
  '24h': { spanMs: 24 * 60 * 60 * 1000, bucketSeconds: 1800, rollup: false },
  week: { spanMs: 7 * 24 * 60 * 60 * 1000, bucketSeconds: 10800, rollup: true },
  month: { spanMs: 30 * 24 * 60 * 60 * 1000, bucketSeconds: 43200, rollup: true },
  year: { spanMs: 365 * 24 * 60 * 60 * 1000, bucketSeconds: 604800, rollup: true },
};

// แถวผลลัพธ์ต่อ bucket ต่อเซนเซอร์+metric — รูปแบบเดียวกับที่ RPC sensor_history/sensor_history_range
// คืนมา (bucket_ts,sensor_id,metric,v_min,v_max,v_avg) ให้ mock กับ Supabase ใช้ downstream ร่วมกันได้
export interface SensorSeriesRow {
  bucketTs: number;
  sensorId: number;
  metric: string;
  vMin: number;
  vMax: number;
  vAvg: number;
}

// bucket sensor_readings ดิบ (โหมด mock) ให้เป็นรูปแบบเดียวกับ RPC — จัดกลุ่มด้วย (sensorId, metric, bucket idx)
export function bucketSensorReadings(
  rows: SensorReadingRow[],
  sinceMs: number,
  untilMs: number,
  buckets: number
): SensorSeriesRow[] {
  const span = Math.max(1, untilMs - sinceMs);
  const width = span / buckets;
  const acc = new Map<string, number[]>();

  for (const r of rows) {
    if (r.sensorId == null) continue;
    const t = new Date(r.ts).getTime();
    if (Number.isNaN(t) || t < sinceMs || t > untilMs) continue;
    let idx = Math.floor((t - sinceMs) / width);
    if (idx < 0) idx = 0;
    if (idx >= buckets) idx = buckets - 1;
    const key = `${r.sensorId}:${r.metric}:${idx}`;
    const values = acc.get(key);
    if (values) values.push(r.value);
    else acc.set(key, [r.value]);
  }

  const out: SensorSeriesRow[] = [];
  for (const [key, values] of acc) {
    const [sensorIdStr, metric, idxStr] = key.split(':');
    const idx = Number(idxStr);
    out.push({
      bucketTs: sinceMs + (idx + 0.5) * width,
      sensorId: Number(sensorIdStr),
      metric,
      vMin: Math.min(...values),
      vMax: Math.max(...values),
      vAvg: values.reduce((a, b) => a + b, 0) / values.length,
    });
  }
  return out;
}

// ดึงเส้นกราฟของเซนเซอร์+metric หนึ่งจุดจากผลลัพธ์ bucket รวม — stat เลือกได้ว่าจะใช้ min/max/avg
// (ธรรมเนียมเดิม: temp ใช้ max สะท้อนค่าที่ใช้คุมจริง, rh ใช้ avg — ดู bucketAirHistory ด้านบน)
export function seriesToPoints(
  rows: SensorSeriesRow[],
  sensorId: number,
  metric: string,
  stat: 'min' | 'max' | 'avg' = 'max'
): Point[] {
  return rows
    .filter((r) => r.sensorId === sensorId && r.metric === metric)
    .sort((a, b) => a.bucketTs - b.bucketTs)
    .map((r) => ({ t: r.bucketTs, v: stat === 'avg' ? r.vAvg : stat === 'min' ? r.vMin : r.vMax }));
}

// สิ้นวันของวันที่เลือก (date picker, local time) — ใช้เป็นขอบบนของช่วงเวลาตอนผู้ใช้เลือกวันย้อนหลัง
export function endOfDayMs(dateStr: string): number {
  return new Date(`${dateStr}T23:59:59.999`).getTime();
}
