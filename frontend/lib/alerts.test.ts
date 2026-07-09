import { describe, expect, it } from 'vitest';
import { activeAlertCount, alertCodeLabel, sortAlerts } from './alerts';
import type { AlertRow } from './types';

const at = (min: number) => `2026-07-09T00:${String(min).padStart(2, '0')}:00Z`;
function a(id: number, sev: AlertRow['severity'], min: number, resolvedMin: number | null): AlertRow {
  return { id, ts: at(min), severity: sev, code: 'X', message: null, resolved_at: resolvedMin === null ? null : at(resolvedMin) };
}

describe('sortAlerts', () => {
  it('ที่ยังไม่หายขึ้นก่อนที่หายแล้ว (แม้ ts เก่ากว่า)', () => {
    const out = sortAlerts([a(1, 'info', 50, 55), a(2, 'info', 10, null)]);
    expect(out.map((x) => x.id)).toEqual([2, 1]);
  });
  it('ในกลุ่มยังไม่หาย: รุนแรงกว่าก่อน', () => {
    const out = sortAlerts([a(1, 'info', 30, null), a(2, 'critical', 20, null), a(3, 'warn', 25, null)]);
    expect(out.map((x) => x.severity)).toEqual(['critical', 'warn', 'info']);
  });
  it('severity เท่ากัน: ใหม่กว่าก่อน', () => {
    const out = sortAlerts([a(1, 'warn', 10, null), a(2, 'warn', 40, null)]);
    expect(out.map((x) => x.id)).toEqual([2, 1]);
  });
  it('ไม่กลายพันธุ์ array เดิม (คืน copy)', () => {
    const input = [a(1, 'info', 10, null), a(2, 'critical', 20, null)];
    sortAlerts(input);
    expect(input.map((x) => x.id)).toEqual([1, 2]);
  });
});

describe('activeAlertCount', () => {
  it('นับเฉพาะที่ resolved_at = null', () => {
    expect(activeAlertCount([a(1, 'info', 10, null), a(2, 'warn', 20, 25), a(3, 'critical', 30, null)])).toBe(2);
  });
  it('ไม่มี active -> 0', () => {
    expect(activeAlertCount([a(1, 'info', 10, 15)])).toBe(0);
  });
});

describe('alertCodeLabel', () => {
  it('โค้ดที่รู้จัก -> ไทย', () => {
    expect(alertCodeLabel('LOW_WATER')).toBe('ระดับน้ำต่ำ');
  });
  it('โค้ดไม่รู้จัก -> โชว์โค้ดดิบ', () => {
    expect(alertCodeLabel('WEIRD_CODE')).toBe('WEIRD_CODE');
  });
});
