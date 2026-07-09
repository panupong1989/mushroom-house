import { describe, expect, it } from 'vitest';
import { bucketAirHistory, seriesBounds } from './history';
import type { SensorReadingRow } from './types';

const T0 = new Date('2026-07-09T00:00:00Z').getTime();
const HOUR = 60 * 60 * 1000;

function row(kind: string, metric: string, value: number, tMs: number): SensorReadingRow {
  return { id: Math.round(Math.random() * 1e9), kind, metric, value, ts: new Date(tMs).toISOString(), location: 'mid' };
}

describe('bucketAirHistory', () => {
  it('temp ต่อ bucket = ค่าสูงสุด (สะท้อน airTempCtrl), rh = ค่าเฉลี่ย', () => {
    const rows = [
      row('air_th', 'temp', 30, T0 + 0.1 * HOUR),
      row('air_th', 'temp', 35, T0 + 0.4 * HOUR), // bucket 0 -> max 35
      row('air_th', 'rh', 80, T0 + 0.1 * HOUR),
      row('air_th', 'rh', 90, T0 + 0.4 * HOUR), // bucket 0 -> avg 85
      row('air_th', 'temp', 28, T0 + 1.5 * HOUR), // bucket 1 -> 28
    ];
    const { temp, rh } = bucketAirHistory(rows, T0, T0 + 2 * HOUR, 2);
    expect(temp.map((p) => p.v)).toEqual([35, 28]);
    expect(rh.map((p) => p.v)).toEqual([85]);
  });

  it('ข้าม bucket ที่ไม่มีข้อมูล (ไม่ลากเส้นผ่านค่าปลอม)', () => {
    const rows = [row('air_th', 'temp', 31, T0 + 0.1 * HOUR), row('air_th', 'temp', 33, T0 + 3.5 * HOUR)];
    const { temp } = bucketAirHistory(rows, T0, T0 + 4 * HOUR, 4);
    expect(temp).toHaveLength(2); // bucket 0 และ 3 เท่านั้น
    expect(temp.map((p) => p.v)).toEqual([31, 33]);
  });

  it('กรอง kind ที่ไม่ใช่ air_th และ reading นอกช่วงเวลาออก', () => {
    const rows = [
      row('bed_temp', 'temp', 99, T0 + 0.1 * HOUR), // ไม่ใช่ air_th
      row('air_th', 'temp', 40, T0 - HOUR), // ก่อนช่วง
      row('air_th', 'temp', 32, T0 + 5 * HOUR), // หลังช่วง
      row('air_th', 'temp', 30, T0 + 0.5 * HOUR), // ในช่วง
    ];
    const { temp } = bucketAirHistory(rows, T0, T0 + HOUR, 1);
    expect(temp.map((p) => p.v)).toEqual([30]);
  });

  it('bucket center คำนวณถูก (กึ่งกลาง bucket)', () => {
    const { temp } = bucketAirHistory([row('air_th', 'temp', 30, T0 + 0.5 * HOUR)], T0, T0 + 2 * HOUR, 2);
    expect(temp[0].t).toBe(T0 + 0.5 * HOUR); // bucket 0 center = 0.5h
  });
});

describe('seriesBounds', () => {
  it('คืน min/max พร้อม padding', () => {
    const b = seriesBounds([{ t: 0, v: 28 }, { t: 1, v: 34 }], 1);
    expect(b).toEqual({ min: 27, max: 35 });
  });
  it('จุดค่าเท่ากันทั้งหมด → กาง padding ทั้งสองด้าน', () => {
    const b = seriesBounds([{ t: 0, v: 30 }, { t: 1, v: 30 }], 2);
    expect(b).toEqual({ min: 28, max: 32 });
  });
  it('ไม่มีจุด → null', () => {
    expect(seriesBounds([])).toBeNull();
  });
});
