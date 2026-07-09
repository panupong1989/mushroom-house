import type { ActuatorKind, AlertRow, CommandAction, CommandResult, ConfigResponse, LatestResponse } from './types';
import { buildMockAirHistory, buildMockAlerts, buildMockConfig, buildMockLatest, mockSendActuatorCommand } from './mock';
import { SUPABASE_ENABLED } from './supabaseClient';
import {
  fetchSupabaseAirHistory,
  fetchSupabaseAlerts,
  fetchSupabaseConfig,
  sendSupabaseCommand,
  updateSupabaseConfig,
} from './supabaseData';
import { RANGE_BUCKETS, RANGE_MS, bucketAirHistory, type AirHistory, type HistoryRange } from './history';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
export const HOUSE_ID = process.env.NEXT_PUBLIC_HOUSE_ID ?? 'house-01';

// ลำดับความสำคัญของแหล่งข้อมูล: Supabase (โหมด Internet, ดู supabase/README.md) > backend REST
// (NEXT_PUBLIC_API_URL) > mock. NEXT_PUBLIC_USE_MOCK บังคับ mock ตรงๆ ได้เสมอไว้ดีบัก ไม่ว่าจะตั้ง
// Supabase/API_URL ไว้หรือไม่ — ให้ deploy frontend เดี่ยวๆ บน Vercel โดยยังไม่มี backend/Supabase จริง
// ก็เห็นข้อมูลวิ่งได้ทันที (ดู frontend/README.md)
function resolveUseMock(): boolean {
  const raw = process.env.NEXT_PUBLIC_USE_MOCK;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (SUPABASE_ENABLED) return false;
  return !process.env.NEXT_PUBLIC_API_URL;
}
export const USE_MOCK = resolveUseMock();

export class ApiError extends Error {}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new ApiError(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

// หมายเหตุ: โหมด Supabase ไม่ใช้ fetchLatest นี้ — lib/hooks.ts useLatest เรียก
// subscribeSupabaseLatest (realtime) ตรงๆ แทน เพราะ fetch ครั้งเดียวไม่พอสำหรับ realtime
export function fetchLatest(houseId: string = HOUSE_ID): Promise<LatestResponse> {
  if (USE_MOCK) return Promise.resolve(buildMockLatest(Date.now()));
  return getJson<LatestResponse>(`/houses/${houseId}/latest`);
}

// กราฟย้อนหลัง (read-only): Supabase RPC (aggregate ฝั่ง DB) > mock (bucket ฝั่ง client)
// backend REST เดิมไม่มี endpoint ประวัติ — ใช้ mock ให้กราฟยังโชว์ได้ตอน dev
export function fetchAirHistory(houseId: string = HOUSE_ID, range: HistoryRange = '24h'): Promise<AirHistory> {
  if (SUPABASE_ENABLED) return fetchSupabaseAirHistory(houseId, range);
  const now = Date.now();
  const since = now - RANGE_MS[range];
  const stepMs = RANGE_MS[range] / 240; // ~240 จุดดิบก่อน bucket ให้เส้นเนียน
  const rows = buildMockAirHistory(since, now, stepMs);
  return Promise.resolve(bucketAirHistory(rows, since, now, RANGE_BUCKETS[range]));
}

// การแจ้งเตือน (read-only): Supabase > mock. โหมด Supabase ใช้ subscribeSupabaseAlerts (realtime)
// ผ่าน useAlerts แทน — fetch นี้ไว้สำหรับ mock/dev (backend REST เดิมไม่มี endpoint alerts)
export function fetchAlerts(houseId: string = HOUSE_ID): Promise<AlertRow[]> {
  if (SUPABASE_ENABLED) return fetchSupabaseAlerts(houseId);
  return Promise.resolve(buildMockAlerts());
}

// แก้ setpoint: Supabase (upsert control_config, ต้อง login) > mock (dev = ตอบ ok เฉยๆ ไม่ persist)
export function updateConfig(
  houseId: string = HOUSE_ID,
  updates: Record<string, number>
): Promise<{ ok: boolean; message?: string }> {
  if (SUPABASE_ENABLED) return updateSupabaseConfig(houseId, updates);
  return Promise.resolve({ ok: true });
}

export function fetchConfig(houseId: string = HOUSE_ID, profile?: string): Promise<ConfigResponse> {
  if (SUPABASE_ENABLED) return fetchSupabaseConfig(houseId, profile);
  if (USE_MOCK) return Promise.resolve(buildMockConfig());
  const qs = profile ? `?profile=${encodeURIComponent(profile)}` : '';
  return getJson<ConfigResponse>(`/houses/${houseId}/config${qs}`);
}

// POST /actuators/:kind/command — docs/05-api.md (โหมด backend REST)
// หมายเหตุ: backend ปัจจุบัน (backend/src/routes/actuators.ts) ตอบ {ok:true} เสมอ ยังไม่เช็ค
// กฎเหล็กด้านความปลอดภัยก่อนส่งคำสั่ง — ถ้ามีการเพิ่ม gate ฝั่ง backend (แยกคอมมิต) endpoint นี้
// จะตอบ 409 {ok:false, reason, code} เมื่อถูกปฏิเสธ ซึ่งฟังก์ชันนี้รองรับไว้แล้ว
// โหมด Supabase: insert ลงตาราง commands แทน (ดู lib/supabaseData.ts sendSupabaseCommand)
export async function sendActuatorCommand(
  kind: string,
  action: CommandAction,
  ttlSec: number,
  houseId: string = HOUSE_ID
): Promise<CommandResult> {
  if (SUPABASE_ENABLED) return sendSupabaseCommand(kind, action, ttlSec, houseId);
  if (USE_MOCK) return mockSendActuatorCommand(kind as ActuatorKind, action);
  try {
    const res = await fetch(`${API_URL}/actuators/${kind}/command?house=${encodeURIComponent(houseId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ttl_sec: ttlSec }),
    });

    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      return { status: 'rejected', reason: body.reason ?? 'ถูกปฏิเสธโดยกฎความปลอดภัย', code: body.code };
    }
    if (!res.ok) {
      return { status: 'error', message: `backend ตอบผิดพลาด (${res.status})` };
    }
    return { status: 'ok' };
  } catch {
    return { status: 'error', message: 'ส่งคำสั่งไม่สำเร็จ — เครือข่ายขัดข้องหรือ backend ออฟไลน์' };
  }
}
