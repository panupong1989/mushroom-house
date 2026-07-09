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
