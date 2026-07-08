import { beforeEach, describe, expect, it, vi } from 'vitest';

// canned response ต่อคำสั่ง — key ตาม substring ที่แยกแยะ query แต่ละแบบใน commandGuard.ts
let responses: {
  airTemps?: number[];
  bedTemps?: number[];
  water?: number | null;
  actuatorStates?: Record<string, boolean>;
} = {};

vi.mock('../db/pool.js', () => ({
  q: vi.fn((text: string) => {
    if (text.includes("kind='air_th'")) {
      return Promise.resolve({ rows: (responses.airTemps ?? []).map((value) => ({ value })) });
    }
    if (text.includes("kind='bed_temp'")) {
      return Promise.resolve({ rows: (responses.bedTemps ?? []).map((value) => ({ value })) });
    }
    if (text.includes("kind='water_level'")) {
      return Promise.resolve({ rows: responses.water === undefined || responses.water === null ? [] : [{ value: responses.water }] });
    }
    if (text.includes('actuator_events')) {
      const states = responses.actuatorStates ?? {};
      return Promise.resolve({ rows: Object.entries(states).map(([kind, state]) => ({ kind, state })) });
    }
    return Promise.resolve({ rows: [] });
  }),
}));

const { checkCommandGuard } = await import('./commandGuard.js');

beforeEach(() => {
  responses = { airTemps: [30], bedTemps: [30], water: 1, actuatorStates: {} };
});

describe('checkCommandGuard — ผ่านเสมอสำหรับ off/auto และอุปกรณ์อื่นที่ไม่มี interlock', () => {
  it('action off -> allowed เสมอ', async () => {
    const r = await checkCommandGuard('house-01', 'mist', 'off');
    expect(r.allowed).toBe(true);
  });

  it('action auto -> allowed เสมอ', async () => {
    const r = await checkCommandGuard('house-01', 'heater', 'auto');
    expect(r.allowed).toBe(true);
  });

  it('exhaust/light/circulation ไม่มี interlock -> allowed เสมอแม้เงื่อนไขจะแย่', async () => {
    responses = { airTemps: [10], bedTemps: [45], water: 0, actuatorStates: {} };
    const r = await checkCommandGuard('house-01', 'exhaust', 'on');
    expect(r.allowed).toBe(true);
  });
});

describe('checkCommandGuard — mist (กฎเหล็ก docs/03-control-logic.md)', () => {
  it('น้ำต่ำ -> ปฏิเสธ LOW_WATER', async () => {
    responses.water = 0;
    const r = await checkCommandGuard('house-01', 'mist', 'on');
    expect(r).toEqual({ allowed: false, code: 'LOW_WATER', reason: expect.stringContaining('น้ำ') });
  });

  it('กองร้อนเกิน (>=40) -> ปฏิเสธ BED_OVERHEAT', async () => {
    responses.bedTemps = [41];
    const r = await checkCommandGuard('house-01', 'mist', 'on');
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe('BED_OVERHEAT');
  });

  it('อากาศเย็นกว่า 27.5 -> ปฏิเสธ COLD_INTERLOCK (ห้ามพ่นหมอกเด็ดขาด)', async () => {
    responses.airTemps = [27.0];
    const r = await checkCommandGuard('house-01', 'mist', 'on');
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe('COLD_INTERLOCK');
  });

  it('heater กำลัง ON -> ปฏิเสธ HEATER_MIST_INTERLOCK', async () => {
    responses.actuatorStates = { heater: true };
    const r = await checkCommandGuard('house-01', 'mist', 'on');
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe('HEATER_MIST_INTERLOCK');
  });

  it('ทุกเงื่อนไขปกติ -> allowed', async () => {
    const r = await checkCommandGuard('house-01', 'mist', 'on');
    expect(r.allowed).toBe(true);
  });

  it('ไม่มีข้อมูลเซนเซอร์เลย (null) -> ไม่บล็อก (fail-open ที่ชั้นนี้ ให้ firmware/edge เป็นด่านสุดท้าย)', async () => {
    responses = { airTemps: [], bedTemps: [], water: null, actuatorStates: {} };
    const r = await checkCommandGuard('house-01', 'mist', 'on');
    expect(r.allowed).toBe(true);
  });
});

describe('checkCommandGuard — heater', () => {
  it('mist กำลัง ON -> ปฏิเสธ HEATER_MIST_INTERLOCK', async () => {
    responses.actuatorStates = { mist: true };
    const r = await checkCommandGuard('house-01', 'heater', 'on');
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe('HEATER_MIST_INTERLOCK');
  });

  it('mist OFF -> allowed', async () => {
    responses.actuatorStates = { mist: false };
    const r = await checkCommandGuard('house-01', 'heater', 'on');
    expect(r.allowed).toBe(true);
  });
});
