// Logic การแจ้งเตือน (read-only) — เรียง/นับ/label (pure, testable)
import type { AlertRow, Severity } from './types';

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };
export const SEVERITY_LABEL: Record<Severity, string> = { critical: 'วิกฤต', warn: 'เตือน', info: 'ข้อมูล' };

// code -> ป้ายไทย (โค้ดจาก safety.cpp / firmware — ไม่รู้จักก็โชว์โค้ดดิบ)
export const ALERT_CODE_LABEL: Record<string, string> = {
  LOW_WATER: 'ระดับน้ำต่ำ',
  BED_OVERHEAT: 'กองร้อนเกิน',
  HOT: 'อากาศร้อนอันตราย',
  COLD: 'อากาศเย็นเกิน',
  SENSOR_LOST: 'เซนเซอร์หลุด',
};
export function alertCodeLabel(code: string): string {
  return ALERT_CODE_LABEL[code] ?? code;
}

// เรียง: ที่ "ยังไม่หาย" (resolved_at=null) ขึ้นก่อน -> รุนแรงกว่าก่อน -> ใหม่กว่าก่อน
export function sortAlerts(rows: AlertRow[]): AlertRow[] {
  return [...rows].sort((a, b) => {
    const ar = a.resolved_at ? 1 : 0;
    const br = b.resolved_at ? 1 : 0;
    if (ar !== br) return ar - br;
    const sr = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sr !== 0) return sr;
    return new Date(b.ts).getTime() - new Date(a.ts).getTime();
  });
}

export function activeAlertCount(rows: AlertRow[]): number {
  return rows.filter((r) => !r.resolved_at).length;
}
