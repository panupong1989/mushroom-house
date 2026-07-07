import { describe, expect, it } from 'vitest';
import {
  ALL_OFF,
  DEFAULT_SETPOINTS,
  IDLE_MIST_TIMER,
  evaluateControl,
  type SensorSnapshot,
} from './control.js';

function snapshot(overrides: Partial<SensorSnapshot>): SensorSnapshot {
  return { airTemp: 30, airRh: 87, bedTempMax: 20, waterOk: true, ...overrides };
}

describe('evaluateControl — temperature ladder (docs/03-control-logic.md)', () => {
  it('T_air < 27.5 -> heater ON, mist OFF เสมอ (interlock เหล็ก)', () => {
    const out = evaluateControl({ sensors: snapshot({ airTemp: 27.0, airRh: 60 }) });
    expect(out.actuators.heater).toBe(true);
    expect(out.actuators.mist).toBe(false);
    expect(out.tripped).toBe(false);
  });

  it('heater กับ mist ห้าม ON พร้อมกัน แม้ heater ยังค้าง ON จาก hysteresis และ RH ต่ำ', () => {
    // เข้าโซนทองด้วย heater ยังเปิดค้างจากรอบก่อน (T ต่ำกว่า heater_off) + RH ต่ำพอจะสั่ง burst
    const out = evaluateControl({
      sensors: snapshot({ airTemp: 28.0, airRh: 60 }),
      prevActuators: { ...ALL_OFF, heater: true },
      mistTimer: { mistOn: false, msSinceChange: DEFAULT_SETPOINTS.mistGapMs },
    });
    expect(out.actuators.heater && out.actuators.mist).toBe(false);
  });

  it('T_air >= 33 -> exhaust ON', () => {
    const out = evaluateControl({ sensors: snapshot({ airTemp: 33.0 }) });
    expect(out.actuators.exhaust).toBe(true);
    expect(out.actuators.heater).toBe(false);
  });
});

describe('evaluateControl — safety interlocks (priority 1)', () => {
  it('water_ok=false -> mist LOCK OFF พร้อม alert LOW_WATER', () => {
    const out = evaluateControl({
      sensors: snapshot({ waterOk: false, airTemp: 30, airRh: 60 }),
      prevActuators: { ...ALL_OFF, mist: true },
    });
    expect(out.actuators.mist).toBe(false);
    expect(out.alert).toBe('LOW_WATER');
    expect(out.tripped).toBe(true);
  });

  it('water_ok=false ยังคง LOCK mist OFF แม้เคยสั่ง mist ON ไว้ก่อนหน้า', () => {
    const out = evaluateControl({
      sensors: snapshot({ waterOk: false }),
      prevActuators: { heater: false, mist: true, exhaust: false, circulation: false },
    });
    expect(out.actuators.mist).toBe(false);
  });

  it('bed_temp_max >= 40 -> heater OFF + exhaust ON + alert BED_OVERHEAT', () => {
    const out = evaluateControl({
      sensors: snapshot({ bedTempMax: 40, airTemp: 30 }),
      prevActuators: { ...ALL_OFF, heater: true },
    });
    expect(out.actuators.heater).toBe(false);
    expect(out.actuators.exhaust).toBe(true);
    expect(out.alert).toBe('BED_OVERHEAT');
    expect(out.tripped).toBe(true);
  });

  it('T_air >= temp_danger_hot(38) -> exhaust ON เต็มที่ + mist ON + alert HOT', () => {
    const out = evaluateControl({ sensors: snapshot({ airTemp: 38 }) });
    expect(out.actuators.exhaust).toBe(true);
    expect(out.actuators.mist).toBe(true);
    expect(out.actuators.heater).toBe(false);
    expect(out.alert).toBe('HOT');
    expect(out.tripped).toBe(true);
  });

  it('safety ตัดสินก่อนเสมอ แม้ ladder ปกติจะสั่งต่างออกไป', () => {
    // T ต่ำกว่า heater_on ปกติจะสั่ง heater ON, แต่บ่อน้ำแห้งต้อง lock mist off ก่อน (ladder ยังไม่ทำงาน)
    const out = evaluateControl({ sensors: snapshot({ airTemp: 20, waterOk: false }) });
    expect(out.tripped).toBe(true);
    expect(out.alert).toBe('LOW_WATER');
  });
});

describe('evaluateControl — humidity (โซนทอง, priority 4)', () => {
  it('โซนทอง 28-32 + RH<85 -> mist burst (หลังพ้น mist_gap)', () => {
    const out = evaluateControl({
      sensors: snapshot({ airTemp: 30, airRh: 80 }),
      mistTimer: { mistOn: false, msSinceChange: DEFAULT_SETPOINTS.mistGapMs },
    });
    expect(out.actuators.mist).toBe(true);
  });

  it('โซนทอง RH ปกติ (85-90) -> ไม่พ่นหมอก', () => {
    const out = evaluateControl({ sensors: snapshot({ airTemp: 30, airRh: 87 }) });
    expect(out.actuators.mist).toBe(false);
  });

  it('mist burst หยุดเองเมื่อครบ mist_burst_ms', () => {
    const out = evaluateControl({
      sensors: snapshot({ airTemp: 30, airRh: 80 }),
      mistTimer: { mistOn: true, msSinceChange: DEFAULT_SETPOINTS.mistBurstMs },
    });
    expect(out.actuators.mist).toBe(false);
    expect(out.mistTimer.mistOn).toBe(false);
  });

  it('RH > rh_high -> เปิด circulation ไล่ชื้น แทนการพ่นหมอก', () => {
    const out = evaluateControl({ sensors: snapshot({ airTemp: 30, airRh: 93 }) });
    expect(out.actuators.mist).toBe(false);
    expect(out.actuators.circulation).toBe(true);
  });
});
