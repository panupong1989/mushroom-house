import { describe, expect, it } from 'vitest';
import { validateSetpoints } from './validateConfig.js';

describe('validateSetpoints — เคสผ่าน', () => {
  it('ค่าตั้งต้นจาก docs/03-control-logic.md ต้องผ่านทั้งหมด', () => {
    const errors = validateSetpoints({
      temp_floor: 27,
      temp_heater_on: 27.5,
      temp_heater_off: 29.5,
      temp_exhaust_on: 33,
      temp_danger_hot: 38,
      rh_min: 85,
      rh_max: 90,
      rh_high: 92,
    });
    expect(errors).toEqual([]);
  });

  it('partial update ที่ไม่กระทบ cross-field relation ต้องผ่าน (ข้าม check ที่ยังไม่มีข้อมูลครบ)', () => {
    const errors = validateSetpoints({ rh_min: 80 });
    expect(errors).toEqual([]);
  });
});

describe('validateSetpoints — เคสพัง', () => {
  it('temp_heater_on >= temp_heater_off ต้องพัง', () => {
    const errors = validateSetpoints({ temp_heater_on: 30, temp_heater_off: 29 });
    expect(errors.some(e => e.key === 'temp_heater_on')).toBe(true);
  });

  it('temp_heater_off >= temp_exhaust_on ต้องพัง', () => {
    const errors = validateSetpoints({ temp_heater_off: 33, temp_exhaust_on: 33 });
    expect(errors.some(e => e.key === 'temp_heater_off')).toBe(true);
  });

  it('temp_floor > temp_heater_on ต้องพัง', () => {
    const errors = validateSetpoints({ temp_floor: 28, temp_heater_on: 27.5 });
    expect(errors.some(e => e.key === 'temp_floor')).toBe(true);
  });

  it('rh_min >= rh_max ต้องพัง', () => {
    const errors = validateSetpoints({ rh_min: 90, rh_max: 85 });
    expect(errors.some(e => e.key === 'rh_min')).toBe(true);
  });

  it('rh_max > rh_high ต้องพัง', () => {
    const errors = validateSetpoints({ rh_max: 95, rh_high: 92 });
    expect(errors.some(e => e.key === 'rh_max')).toBe(true);
  });

  it('อุณหภูมินอกช่วง 0-60°C ต้องพัง', () => {
    const errors = validateSetpoints({ temp_heater_on: 65 });
    expect(errors.some(e => e.key === 'temp_heater_on')).toBe(true);
  });

  it('อุณหภูมิติดลบต้องพัง', () => {
    const errors = validateSetpoints({ temp_floor: -1 });
    expect(errors.some(e => e.key === 'temp_floor')).toBe(true);
  });

  it('RH นอกช่วง 0-100 ต้องพัง', () => {
    const errors = validateSetpoints({ rh_min: -5 });
    expect(errors.some(e => e.key === 'rh_min')).toBe(true);
  });

  it('RH เกิน 100 ต้องพัง', () => {
    const errors = validateSetpoints({ rh_high: 150 });
    expect(errors.some(e => e.key === 'rh_high')).toBe(true);
  });
});
