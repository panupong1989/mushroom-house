import { describe, expect, it } from 'vitest';
import { deriveTelemetry } from './derive';
import type { LatestResponse, SensorReadingRow } from './types';

// ts helper — ให้ค่าเวลาต่างกันชัดเจน (นาทีที่ n)
const at = (min: number) => `2026-07-09T00:${String(min).padStart(2, '0')}:00Z`;

function airTemp(location: string | null, value: number, min: number, sensorId?: number): SensorReadingRow {
  return { id: Math.round(Math.random() * 1e9), sensorId, kind: 'air_th', location, metric: 'temp', value, ts: at(min) };
}
function airRh(location: string | null, value: number, min: number, sensorId?: number): SensorReadingRow {
  return { id: Math.round(Math.random() * 1e9), sensorId, kind: 'air_th', location, metric: 'rh', value, ts: at(min) };
}
function bedTemp(location: string | null, rowNo: number | null, value: number, min: number, sensorId?: number): SensorReadingRow {
  return { id: Math.round(Math.random() * 1e9), sensorId, kind: 'bed_temp', location, rowNo, metric: 'temp', value, ts: at(min) };
}
function outsideTemp(value: number, min: number, sensorId?: number): SensorReadingRow {
  return { id: Math.round(Math.random() * 1e9), sensorId, kind: 'outside_temp', location: 'outside', metric: 'temp', value, ts: at(min) };
}

function latest(sensors: SensorReadingRow[]): LatestResponse {
  return { sensors, actuators: [], mode: 'FRUITING', mode_ts: at(0) };
}

const NOW = new Date(at(1)).getTime();

describe('deriveTelemetry — airTempCtrl = max ของ 3 จุด (docs/03-control-logic.md)', () => {
  it('คืน "ค่าสูงสุด" ไม่ใช่ "ค่าที่มาถึงล่าสุด" แม้ค่าล่าสุดจะต่ำสุด', () => {
    // head=35 (ts เก่าสุด), mid=30, tail=28 (ts ใหม่สุด/มาถึงล่าสุด) → ต้องได้ 35 ไม่ใช่ 28
    const t = deriveTelemetry(latest([airTemp('head', 35, 3), airTemp('mid', 30, 4), airTemp('tail', 28, 5)]), NOW);
    expect(t.airTempCtrl).toBe(35);
  });

  it('เก็บค่า "ล่าสุด" ของ "แต่ละ sensor" แยกกัน แล้วค่อย max — ค่าเก่าของ sensor เดียวกันต้องไม่ชนะ', () => {
    // head sensor ส่ง 2 ครั้ง: 40 (เก่า) แล้ว 29 (ใหม่). tail=31. ล่าสุดของ head=29 → max(29,31)=31
    const t = deriveTelemetry(
      latest([airTemp('head', 40, 2), airTemp('head', 29, 6), airTemp('tail', 31, 5)]),
      NOW
    );
    expect(t.airTempCtrl).toBe(31);
  });

  it('ค่าเก่าที่ "มาถึงทีหลัง" ในอาเรย์ ต้องไม่ทับค่าใหม่ของ sensor เดียวกัน', () => {
    // mid ใหม่=33 (ts 6) มาก่อน แล้วค่าเก่า=25 (ts 2) มาทีหลังในอาเรย์ → ต้องคง 33
    const t = deriveTelemetry(latest([airTemp('mid', 33, 6), airTemp('mid', 25, 2)]), NOW);
    expect(t.airTempCtrl).toBe(33);
  });

  it('air เดียว → คืนค่านั้น', () => {
    expect(deriveTelemetry(latest([airTemp('mid', 31.5, 5)]), NOW).airTempCtrl).toBe(31.5);
  });

  it('ไม่มี air → null', () => {
    expect(deriveTelemetry(latest([]), NOW).airTempCtrl).toBeNull();
  });
});

describe('deriveTelemetry — airRhAvg = ค่าเฉลี่ยของ sensor ที่มีค่า', () => {
  it('เฉลี่ยจากทุกจุดที่มี RH', () => {
    const t = deriveTelemetry(latest([airRh('head', 80, 5), airRh('mid', 85, 5), airRh('tail', 90, 5)]), NOW);
    expect(t.airRhAvg).toBe(85);
  });

  it('นับเฉพาะ sensor ที่มี RH (จุดที่มีแต่ temp ไม่ถูกนับ)', () => {
    // head มีแต่ temp, mid=88, tail=92 → เฉลี่ย (88+92)/2 = 90
    const t = deriveTelemetry(latest([airTemp('head', 30, 5), airRh('mid', 88, 5), airRh('tail', 92, 5)]), NOW);
    expect(t.airRhAvg).toBe(90);
  });

  it('ใช้ค่า RH ล่าสุดของแต่ละจุดก่อนเฉลี่ย', () => {
    // mid: 70(เก่า)→90(ใหม่), head=80 → เฉลี่ย (90+80)/2 = 85
    const t = deriveTelemetry(latest([airRh('mid', 70, 2), airRh('mid', 90, 6), airRh('head', 80, 5)]), NOW);
    expect(t.airRhAvg).toBe(85);
  });

  it('ไม่มี RH → null', () => {
    expect(deriveTelemetry(latest([airTemp('mid', 30, 5)]), NOW).airRhAvg).toBeNull();
  });
});

describe('deriveTelemetry — จัดกลุ่มด้วย sensor_id ไม่ยุบรวมเมื่อ location null/ซ้ำ (บั๊กความปลอดภัย)', () => {
  it('3 เซนเซอร์ location=null (id ต่างกัน): ต้อง max ได้ถูก ไม่ยุบเหลือค่าล่าสุด', () => {
    // เดิม: ยุบเป็น bucket เดียว → เหลือ 28 (ล่าสุด). ใหม่: จัดกลุ่มด้วย id → max(35,30,28)=35
    const t = deriveTelemetry(
      latest([airTemp(null, 35, 3, 1), airTemp(null, 30, 4, 2), airTemp(null, 28, 5, 3)]),
      NOW
    );
    expect(t.airTempCtrl).toBe(35);
    expect(t.air).toHaveLength(3); // ทั้ง 3 ตัวยังโชว์แยกกัน ไม่หายไป
  });

  it('2 เซนเซอร์ location ซ้ำกัน (id ต่างกัน): นับทั้งคู่', () => {
    const t = deriveTelemetry(latest([airTemp('head', 30, 5, 1), airTemp('head', 34, 5, 2)]), NOW);
    expect(t.airTempCtrl).toBe(34);
    expect(t.air).toHaveLength(2);
  });

  it('sensor เดียวกัน (id เดียว) location=null ส่งซ้ำ: เก็บค่าล่าสุด ไม่ใช่ 2 แถว', () => {
    const t = deriveTelemetry(latest([airTemp(null, 40, 2, 9), airTemp(null, 31, 6, 9)]), NOW);
    expect(t.airTempCtrl).toBe(31); // ค่าล่าสุดของ id=9
    expect(t.air).toHaveLength(1);
  });

  it('RH เฉลี่ยจากเซนเซอร์ location=null หลายตัวได้ถูก', () => {
    const t = deriveTelemetry(latest([airRh(null, 80, 5, 1), airRh(null, 90, 5, 2)]), NOW);
    expect(t.airRhAvg).toBe(85);
  });

  it('เก็บ location ไว้สำหรับ label — เซนเซอร์ที่มี location คง location, ที่ null คง null', () => {
    const t = deriveTelemetry(latest([airTemp('mid', 31, 5, 2), airTemp(null, 33, 5, 9)]), NOW);
    const byId = new Map(t.air.map((p) => [p.sensorId, p]));
    expect(byId.get(2)?.location).toBe('mid');
    expect(byId.get(9)?.location).toBeNull();
    expect(t.airTempCtrl).toBe(33);
  });
});

describe('deriveTelemetry — ในกอง 6 จุด จัดกลุ่มด้วย rowNo (supabase/migrations/005_real_sensors.sql)', () => {
  it('เรียงตาม rowNo ก่อน แล้วค่อยตำแหน่ง (หัว/กลาง/ท้าย) ภายในแถว', () => {
    const t = deriveTelemetry(
      latest([
        bedTemp('tail', 2, 34, 5, 6),
        bedTemp('head', 1, 30, 5, 1),
        bedTemp('head', 2, 35, 5, 4),
        bedTemp('mid', 1, 31, 5, 2),
        bedTemp('tail', 1, 32, 5, 3),
        bedTemp('mid', 2, 33.5, 5, 5),
      ]),
      NOW
    );
    expect(t.bed.map((p) => `${p.rowNo}:${p.location}`)).toEqual([
      '1:head',
      '1:mid',
      '1:tail',
      '2:head',
      '2:mid',
      '2:tail',
    ]);
    expect(t.bedTempMax).toBe(35);
  });

  it('เซนเซอร์ legacy ที่ไม่มี rowNo (null) ไม่พัง — ยังโชว์และนับ max ได้ปกติ', () => {
    const t = deriveTelemetry(latest([bedTemp('head', null, 40, 5, 1), bedTemp('mid', null, 30, 5, 2)]), NOW);
    expect(t.bed).toHaveLength(2);
    expect(t.bed.every((p) => p.rowNo === null)).toBe(true);
    expect(t.bedTempMax).toBe(40);
  });
});

describe('deriveTelemetry — นอกโรง (kind: outside_temp)', () => {
  it('จับค่าล่าสุดของเซนเซอร์นอกโรงแยกจาก air/bed', () => {
    const t = deriveTelemetry(
      latest([outsideTemp(25, 2, 11), outsideTemp(27, 6, 11), airTemp('head', 31, 5, 1)]),
      NOW
    );
    expect(t.outside).toHaveLength(1);
    expect(t.outside[0].temp).toBe(27);
    // ต้องไม่ปนกับ airTempCtrl (ใช้คุมเฉพาะ air_th ในโรง)
    expect(t.airTempCtrl).toBe(31);
  });

  it('ไม่มีข้อมูลนอกโรง → array ว่าง', () => {
    expect(deriveTelemetry(latest([airTemp('head', 30, 5, 1)]), NOW).outside).toEqual([]);
  });
});
