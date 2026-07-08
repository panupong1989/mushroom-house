import type { ActuatorKind, CommandAction, CommandResult, ConfigResponse, LatestResponse } from './types';
import { buildMockConfig, buildMockLatest, mockSendActuatorCommand } from './mock';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
export const HOUSE_ID = process.env.NEXT_PUBLIC_HOUSE_ID ?? 'house-01';

// NEXT_PUBLIC_USE_MOCK: 'true'/'false' บังคับโหมดตรงๆ, ถ้าไม่ตั้งเลย -> mock ถ้าไม่มี NEXT_PUBLIC_API_URL
// (ให้ deploy frontend เดี่ยวๆ บน Vercel โดยยังไม่มี backend จริงก็เห็นข้อมูลวิ่งได้ทันที — ดู frontend/README.md)
function resolveUseMock(): boolean {
  const raw = process.env.NEXT_PUBLIC_USE_MOCK;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return !process.env.NEXT_PUBLIC_API_URL;
}
export const USE_MOCK = resolveUseMock();

export class ApiError extends Error {}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new ApiError(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export function fetchLatest(houseId: string = HOUSE_ID): Promise<LatestResponse> {
  if (USE_MOCK) return Promise.resolve(buildMockLatest(Date.now()));
  return getJson<LatestResponse>(`/houses/${houseId}/latest`);
}

export function fetchConfig(houseId: string = HOUSE_ID, profile?: string): Promise<ConfigResponse> {
  if (USE_MOCK) return Promise.resolve(buildMockConfig());
  const qs = profile ? `?profile=${encodeURIComponent(profile)}` : '';
  return getJson<ConfigResponse>(`/houses/${houseId}/config${qs}`);
}

// POST /actuators/:kind/command — docs/05-api.md
// หมายเหตุ: backend ปัจจุบัน (backend/src/routes/actuators.ts) ตอบ {ok:true} เสมอ ยังไม่เช็ค
// กฎเหล็กด้านความปลอดภัยก่อนส่งคำสั่ง — ถ้ามีการเพิ่ม gate ฝั่ง backend (แยกคอมมิต) endpoint นี้
// จะตอบ 409 {ok:false, reason, code} เมื่อถูกปฏิเสธ ซึ่งฟังก์ชันนี้รองรับไว้แล้ว
export async function sendActuatorCommand(
  kind: string,
  action: CommandAction,
  ttlSec: number,
  houseId: string = HOUSE_ID
): Promise<CommandResult> {
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
