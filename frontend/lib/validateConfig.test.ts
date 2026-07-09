import { describe, expect, it } from 'vitest';
import { validateSetpoints } from './validateConfig';

const keysWithError = (c: Record<string, number>) => validateSetpoints(c).map((e) => e.key);

// ค่า setpoint ที่ถูกต้อง (ตาม docs/03) ใช้เป็นฐานแล้ว override ทีละเคส
const BASE = {
  temp_floor: 27,
  temp_heater_on: 27.5,
  temp_heater_off: 29.5,
  temp_exhaust_on: 33,
  temp_danger_hot: 38,
  rh_min: 85,
  rh_max: 90,
  rh_high: 92,
};

describe('validateSetpoints — range', () => {
  it('ค่าตั้งต้นที่ถูกต้อง → ไม่มี error', () => {
    expect(validateSetpoints(BASE)).toEqual([]);
  });
  it('temp เกิน 60 → error', () => {
    expect(keysWithError({ ...BASE, temp_danger_hot: 61 })).toContain('temp_danger_hot');
  });
  it('temp ติดลบ → error', () => {
    expect(keysWithError({ temp_floor: -1 })).toContain('temp_floor');
  });
  it('rh เกิน 100 → error', () => {
    expect(keysWithError({ ...BASE, rh_high: 101 })).toContain('rh_high');
  });
  it('NaN → error', () => {
    expect(keysWithError({ temp_heater_on: NaN })).toContain('temp_heater_on');
  });
});

describe('validateSetpoints — cross-field', () => {
  it('heater_on >= heater_off → error', () => {
    expect(keysWithError({ ...BASE, temp_heater_on: 30, temp_heater_off: 29 })).toContain('temp_heater_on');
  });
  it('heater_off >= exhaust_on → error', () => {
    expect(keysWithError({ ...BASE, temp_heater_off: 33, temp_exhaust_on: 33 })).toContain('temp_heater_off');
  });
  it('floor > heater_on → error', () => {
    expect(keysWithError({ ...BASE, temp_floor: 28, temp_heater_on: 27.5 })).toContain('temp_floor');
  });
  it('rh_min >= rh_max → error', () => {
    expect(keysWithError({ ...BASE, rh_min: 90, rh_max: 90 })).toContain('rh_min');
  });
  it('rh_max > rh_high → error', () => {
    expect(keysWithError({ ...BASE, rh_max: 93, rh_high: 92 })).toContain('rh_max');
  });
  it('cross-field ข้ามถ้าอีก key ยังไม่มีค่า (partial config)', () => {
    expect(validateSetpoints({ temp_heater_on: 30 })).toEqual([]);
  });
});
