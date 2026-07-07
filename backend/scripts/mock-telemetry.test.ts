import { describe, expect, it } from 'vitest';
import { dayNightFactor, simulateSnapshot, simulateActuatorState } from './mock-telemetry.js';

const HOUR = 3_600_000;

describe('mock-telemetry — simulateSnapshot', () => {
  it('อุณหภูมิอากาศอยู่ในช่วง 26-34 และ RH อยู่ในช่วง 80-92 ตลอด 24 ชม.', () => {
    for (let h = 0; h < 24; h++) {
      const s = simulateSnapshot(h * HOUR);
      expect(s.air_temp).toBeGreaterThanOrEqual(26);
      expect(s.air_temp).toBeLessThanOrEqual(34);
      expect(s.air_rh).toBeGreaterThanOrEqual(80);
      expect(s.air_rh).toBeLessThanOrEqual(92);
      expect(s.air).toHaveLength(3);
      expect(s.bed).toHaveLength(3);
      for (const a of s.air) {
        expect(a.t).toBeGreaterThanOrEqual(26);
        expect(a.t).toBeLessThanOrEqual(34);
        expect(a.rh).toBeGreaterThanOrEqual(80);
        expect(a.rh).toBeLessThanOrEqual(92);
      }
    }
  });

  it('addr ของ air/bed ตรงกับที่ seed ไว้ใน db/seed.sql', () => {
    const s = simulateSnapshot(0);
    expect(s.air.map(a => a.addr)).toEqual([1, 2, 3]);
    expect(s.bed.map(b => b.addr)).toEqual(['28-0000-01', '28-0000-02', '28-0000-03']);
  });

  it('กลางคืน (ตี 3) เย็นกว่ากลางวัน (เที่ยง)', () => {
    const night = simulateSnapshot(3 * HOUR);
    const noon = simulateSnapshot(12 * HOUR);
    expect(night.air_temp).toBeLessThan(noon.air_temp);
  });
});

describe('mock-telemetry — dayNightFactor', () => {
  it('อยู่ในช่วง -1..1', () => {
    for (let h = 0; h < 24; h++) {
      const f = dayNightFactor(h * HOUR);
      expect(f).toBeGreaterThanOrEqual(-1);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});

describe('mock-telemetry — simulateActuatorState (interlock)', () => {
  it('ห้าม mist ON เมื่อ air_temp < 27.5 (hardware interlock)', () => {
    const cold = simulateSnapshot(3 * HOUR);
    if (cold.air_temp < 27.5) {
      const state = simulateActuatorState(cold);
      expect(state.mist).toBe(false);
    }
  });

  it('heater กับ mist ไม่ ON พร้อมกัน', () => {
    for (let h = 0; h < 24; h++) {
      const s = simulateSnapshot(h * HOUR);
      const state = simulateActuatorState(s);
      expect(state.heater && state.mist).toBe(false);
    }
  });
});
