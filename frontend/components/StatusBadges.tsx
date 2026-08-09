'use client';

import { MODE_LABELS } from '@/lib/constants';
import type { FsmMode } from '@/lib/types';

type Tone = 'ok' | 'bad' | 'unknown';

const DOT: Record<Tone, string> = { ok: 'bg-leaf', bad: 'bg-danger', unknown: 'bg-gray-300' };
const TEXT: Record<Tone, string> = { ok: 'text-gray-700', bad: 'text-danger', unknown: 'text-gray-400' };

function Chip({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[tone]}`} />
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-xs font-medium ${TEXT[tone]}`}>{value}</span>
    </span>
  );
}

// RSSI (dBm, ติดลบ — ใกล้ 0 = แรง) -> คำอ่านง่ายๆ · เกณฑ์มาตรฐานของ WiFi ทั่วไป
// >= -60 แรงดี · -61..-70 พอใช้ · -71..-80 อ่อน (เริ่มหลุดง่าย) · < -80 แย่มาก
export function rssiLabel(rssi: number): { text: string; tone: Tone } {
  if (rssi >= -60) return { text: `แรง (${rssi})`, tone: 'ok' };
  if (rssi >= -70) return { text: `พอใช้ (${rssi})`, tone: 'ok' };
  if (rssi >= -80) return { text: `อ่อน (${rssi})`, tone: 'bad' };
  return { text: `แย่มาก (${rssi})`, tone: 'bad' };
}

// แถบสถานะรวม — บอกแค่ "ตอนนี้ปกติไหม" ไม่ต้องมีเวลาให้อ่านตีความเอง (feedback Beer 9 ส.ค.)
//   บอร์ด = ESP32 ยังส่งข้อมูลเข้ามาไหม · ฐานข้อมูล = ต่อ Supabase ได้ไหม
//   สัญญาณบอร์ด = WiFi ที่ ESP32 รับได้ (houses.last_rssi — ต้อง flash เฟิร์มแวร์ที่ push ค่านี้ก่อน)
export function ConnectionBadge({
  online,
  dbOk,
  rssi,
}: {
  online: boolean;
  dbOk: boolean;
  rssi: number | null;
}) {
  // ออฟไลน์อยู่ = ค่า RSSI ที่ค้างไว้ไม่มีความหมายแล้ว อย่าโชว์ว่า "แรง"
  const wifi = rssi == null || !online ? { text: '—', tone: 'unknown' as Tone } : rssiLabel(rssi);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-full bg-card px-4 py-2 shadow-soft">
      <Chip label="บอร์ด" value={online ? 'ออนไลน์' : 'ออฟไลน์'} tone={online ? 'ok' : 'bad'} />
      <Chip label="ฐานข้อมูล" value={dbOk ? 'เชื่อมต่อ' : 'ขัดข้อง'} tone={dbOk ? 'ok' : 'bad'} />
      <Chip label="สัญญาณบอร์ด" value={wifi.text} tone={wifi.tone} />
    </div>
  );
}

const MODE_STYLES: Record<FsmMode, string> = {
  BOOT: 'bg-gray-100 text-gray-600',
  SELFTEST: 'bg-gray-100 text-gray-600',
  SPAWN_RUN: 'bg-leaf/10 text-leaf-dark',
  FRUITING: 'bg-leaf/10 text-leaf-dark',
  MANUAL: 'bg-gold/20 text-[#8a6410]',
  SAFE_HOLD: 'bg-danger/10 text-danger',
};

export function ModeBadge({ mode }: { mode: FsmMode | null }) {
  if (!mode) {
    return <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500">ไม่ทราบสถานะ</span>;
  }
  return (
    <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${MODE_STYLES[mode]}`}>{MODE_LABELS[mode]}</span>
  );
}
