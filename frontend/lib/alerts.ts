// Logic การแจ้งเตือน (read-only) — เรียง/นับ/label (pure, testable)
import type { AlertRow, Severity } from './types';

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };
export const SEVERITY_LABEL: Record<Severity, string> = { critical: 'วิกฤต', warn: 'เตือน', info: 'ข้อมูล' };

// code -> ป้ายไทย (โค้ดจาก safety.cpp / firmware — ไม่รู้จักก็โชว์โค้ดดิบ)
export const ALERT_CODE_LABEL: Record<string, string> = {
  LOW_WATER: 'ระดับน้ำต่ำ',
  BED_OVERHEAT: 'กองร้อนเกิน',
  HOT: 'อากาศร้อนอันตราย',
  RH_HIGH: 'ความชื้นสูงเกิน',
  RH_LOW: 'ความชื้นต่ำเกิน',
  COLD: 'อากาศต่ำเกิน',
  BED_LOW: 'กองต่ำเกิน',
  SENSOR_LOST: 'เซนเซอร์หลุด',
};
export function alertCodeLabel(code: string): string {
  return ALERT_CODE_LABEL[code] ?? code;
}

// code ที่เปิด/ปิดการแจ้งเตือนได้ (ตรงกับ safety.cpp + seed ใน 008_alert_config.sql)
// ปิดได้แค่ "การแจ้งเตือน" — safety interlock ใน firmware ยังทำงานเสมอ (ดู migration 008)
// thresholdKey = key ใน setpoint ที่เป็น "ค่าเกณฑ์" ของ alert (โชว์ข้างปุ่ม); null = ไม่มีเกณฑ์ (น้ำต่ำ)
export interface AlertConfigCode {
  code: string;
  label: string;
  hasThreshold: boolean; // มีค่าเกณฑ์แก้ได้ไหม (LOW_WATER = ไม่มี)
  defaultThreshold: number | null; // ค่าเริ่มต้นถ้า alert_config ยังไม่ตั้ง (เท่า seed ใน migration 009)
  unit: string;
  cmp: string; // '≥' | '>' | '<'
  safeNote: string; // interlock ที่ยังทำงานเสมอแม้ปิดแจ้งเตือน (ว่าง = ไม่มี)
  needsFirmware?: boolean; // เกณฑ์ใหม่ที่เฟิร์มแวร์ยังไม่ได้ยิง — ต้อง flash ก่อนถึงจะเด้งจริง
}
export const ALERT_CONFIG_CODES: AlertConfigCode[] = [
  { code: 'HOT', label: 'อากาศร้อนอันตราย', hasThreshold: true, defaultThreshold: 38, unit: '°C', cmp: '≥', safeNote: 'exhaust/mist ยังทำงานเสมอ' },
  { code: 'COLD', label: 'อากาศต่ำเกิน', hasThreshold: true, defaultThreshold: 27.5, unit: '°C', cmp: '<', safeNote: 'ต่ำกว่า 27.5° ห้ามพ่นหมอกเสมอ (interlock)', needsFirmware: true },
  { code: 'BED_OVERHEAT', label: 'กองร้อนเกิน', hasThreshold: true, defaultThreshold: 40, unit: '°C', cmp: '≥', safeNote: 'heater ยังตัด + exhaust เปิดเสมอ' },
  { code: 'BED_LOW', label: 'กองต่ำเกิน', hasThreshold: true, defaultThreshold: 30, unit: '°C', cmp: '<', safeNote: '', needsFirmware: true },
  { code: 'RH_HIGH', label: 'ความชื้นสูงเกิน', hasThreshold: true, defaultThreshold: 90, unit: '%', cmp: '>', safeNote: '' },
  { code: 'RH_LOW', label: 'ความชื้นต่ำเกิน', hasThreshold: true, defaultThreshold: 85, unit: '%', cmp: '<', safeNote: '' },
  { code: 'LOW_WATER', label: 'ระดับน้ำต่ำ', hasThreshold: false, defaultThreshold: null, unit: '', cmp: '', safeNote: 'ปั๊มยังถูกตัดเมื่อน้ำต่ำเสมอ (interlock)' },
];

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
