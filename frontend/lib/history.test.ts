import { describe, expect, it } from 'vitest';
import {
  LONG_RANGE_OPTIONS,
  QUICK_RANGE_OPTIONS,
  RANGE_OPTIONS,
  bucketAirHistory,
  rangeDescription,
  seriesBounds,
  timeTicks,
  valueTicks,
} from './history';
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

describe('QUICK_RANGE_OPTIONS / LONG_RANGE_OPTIONS', () => {
  it('แบ่ง 2 กลุ่มครบทุกตัวเลือก ไม่ทับกัน (ดู issue #38)', () => {
    expect(QUICK_RANGE_OPTIONS.map((o) => o.key)).toEqual(['1h', '4h', '12h', '24h']);
    expect(LONG_RANGE_OPTIONS.map((o) => o.key)).toEqual(['week', 'month', 'year']);
    expect(QUICK_RANGE_OPTIONS.length + LONG_RANGE_OPTIONS.length).toBe(RANGE_OPTIONS.length);
  });
});

describe('valueTicks', () => {
  it('เลือก step เลขสวย (1/2/5×10^k) ครอบคลุมช่วง', () => {
    // ช่วงอุณหภูมิทั่วไป 30.6–34.1 → step 0.5
    expect(valueTicks(30.6, 34.1, 8)).toEqual([31, 31.5, 32, 32.5, 33, 33.5, 34]);
    // ช่วงกว้าง 20.3–36.0 → step 2
    expect(valueTicks(20.3, 36.0, 8)).toEqual([22, 24, 26, 28, 30, 32, 34, 36]);
  });

  it('target น้อย (มือถือ) → tick ห่างขึ้น', () => {
    expect(valueTicks(20.3, 36.0, 3)).toEqual([25, 30, 35]);
  });

  it('tick อยู่ใน [min, max] เสมอ ไม่ทะลุขอบ', () => {
    for (const t of valueTicks(78, 94, 5)) {
      expect(t).toBeGreaterThanOrEqual(78);
      expect(t).toBeLessThanOrEqual(94);
    }
  });

  it('ช่วงเสีย (span<=0 หรือ ±Infinity) → คืน []', () => {
    expect(valueTicks(30, 30)).toEqual([]);
    expect(valueTicks(35, 30)).toEqual([]);
    expect(valueTicks(-Infinity, Infinity)).toEqual([]);
  });

  it('ไม่มี floating error สะสม (เช่น 32.500000000004)', () => {
    for (const t of valueTicks(0.1, 1.9, 8)) {
      expect(String(t).length).toBeLessThanOrEqual(4); // 0.2, 0.4, ... 1.8
    }
  });
});

describe('timeTicks', () => {
  const HOUR_MS = 60 * 60 * 1000;
  // 10:24 เวลาท้องถิ่น (สตริงไม่มี Z = local) — ผล tick ต้องลงตัวตามนาฬิกาท้องถิ่น
  const END = new Date('2026-07-22T10:24:00').getTime();

  it('ช่วง 24 ชม. target 8 → step 3 ชม. ลงตัวตามเวลาท้องถิ่น', () => {
    const ticks = timeTicks(END - 24 * HOUR_MS, END, 8);
    expect(ticks).toHaveLength(8);
    for (const t of ticks) {
      const d = new Date(t);
      expect(d.getHours() % 3).toBe(0); // 12:00, 15:00, ..., 09:00
      expect(d.getMinutes()).toBe(0);
    }
  });

  it('ช่วง 1 ชม. target 5 → step 15 นาที', () => {
    const ticks = timeTicks(END - HOUR_MS, END, 5);
    expect(ticks).toHaveLength(4);
    for (const t of ticks) expect(new Date(t).getMinutes() % 15).toBe(0);
  });

  it('ช่วง 7 วัน target 8 → step 1 วัน ที่เที่ยงคืนท้องถิ่น', () => {
    const ticks = timeTicks(END - 7 * 24 * HOUR_MS, END, 8);
    expect(ticks).toHaveLength(7);
    for (const t of ticks) {
      const d = new Date(t);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
    }
  });

  it('tick อยู่ใน [min, max] เสมอ', () => {
    for (const target of [3, 5, 8]) {
      const min = END - 30 * 24 * HOUR_MS;
      for (const t of timeTicks(min, END, target)) {
        expect(t).toBeGreaterThanOrEqual(min);
        expect(t).toBeLessThanOrEqual(END);
      }
    }
  });

  it('ช่วงเสีย → คืน []', () => {
    expect(timeTicks(END, END)).toEqual([]);
    expect(timeTicks(END, END - HOUR_MS)).toEqual([]);
  });
});

describe('rangeDescription', () => {
  const T = new Date('2026-07-22T10:24:00').getTime();

  it('ช่วงย้อนหลังจากตอนนี้ (quick) โชว์ label + เวลาเริ่ม-สิ้นสุด', () => {
    const min = T - 24 * 60 * 60 * 1000;
    expect(rangeDescription('24h', '', min, T)).toBe(
      `ย้อนหลัง 24 ชม. (21 ก.ค. 10:24 – 22 ก.ค. 10:24)`
    );
  });

  it('เลือกวัน → โชว์วันที่ทั้งวัน ไม่ผูกกับ label ของปุ่มช่วง', () => {
    const startOfDay = new Date('2026-07-20T00:00:00').getTime();
    const endOfDay = new Date('2026-07-20T23:59:59.999').getTime();
    expect(rangeDescription('1h', '2026-07-20', startOfDay, endOfDay)).toBe('20 ก.ค. 2569 ทั้งวัน (00:00 – 23:59)');
  });

  it('ช่วงระยะยาว โชว์วันที่ (ไม่มีเวลา)', () => {
    const min = T - 7 * 24 * 60 * 60 * 1000;
    expect(rangeDescription('week', '', min, T)).toBe('ช่วง สัปดาห์ (15 ก.ค. 2569 – 22 ก.ค. 2569)');
  });
});
