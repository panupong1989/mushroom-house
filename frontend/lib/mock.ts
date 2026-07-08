// โหมดจำลองข้อมูล (เปิดด้วย NEXT_PUBLIC_USE_MOCK — ดู lib/api.ts) สำหรับ deploy frontend เดี่ยวๆ บน Vercel
// โดยยังไม่มี backend จริง ใช้สูตร sine เดียวกับ backend/scripts/mock-telemetry.ts (dayNightFactor + wobble)
// ให้ค่าที่เห็นแกว่งสมจริง และ mirror กฎ interlock จาก backend/src/services/commandGuard.ts
// เพื่อให้ปุ่มสั่งอุปกรณ์ได้ feedback ครบทุกแบบ (สำเร็จ / ถูกปฏิเสธ 409) แม้ไม่มี backend
import { FALLBACK_SETPOINTS } from './constants';
import type {
  ActuatorKind,
  ActuatorStateRow,
  CommandAction,
  CommandResult,
  ConfigResponse,
  FsmMode,
  LatestResponse,
  SensorReadingRow,
} from './types';

const LOCATIONS = ['head', 'mid', 'tail'] as const;
type Location = (typeof LOCATIONS)[number];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

// -1 (เย็นสุด ~ตี 3) .. +1 (ร้อนสุด ~เที่ยง) วนรอบ 24 ชม. — ตรงกับ backend/scripts/mock-telemetry.ts
function dayNightFactor(nowMs: number): number {
  const hourOfDay = (nowMs / 3_600_000) % 24;
  return Math.sin(((hourOfDay - 6) / 24) * 2 * Math.PI);
}

function isDaylight(nowMs: number): boolean {
  const hour = new Date(nowMs).getHours();
  return hour >= 6 && hour < 18;
}

// น้ำต่ำเป็นพักๆ (นาทีที่ 0 ของทุกรอบ 12 นาที) เพื่อโชว์เคส LOW_WATER แบบทำนายได้ ไม่ใช่สุ่มล้วน
function mockWaterOk(nowMs: number): boolean {
  return Math.floor(nowMs / 60_000) % 12 !== 0;
}

interface MockSnapshot {
  ts: string;
  airTemps: Record<Location, number>;
  airRhs: Record<Location, number>;
  bedTemps: Record<Location, number>;
  airTempMax: number; // ค่าใช้คุม = max จาก 3 จุด (docs/03-control-logic.md), ตรงกับ lib/derive.ts airTempCtrl
  bedTempMax: number;
  waterOk: boolean;
  mist: boolean;
  heater: boolean;
  exhaust: boolean;
  light: boolean;
  circulation: boolean;
}

function buildSnapshot(nowMs: number): MockSnapshot {
  const day = dayNightFactor(nowMs);
  const wobble = Math.sin(nowMs / 45_000); // แกว่งเร็วเลียนแบบ noise เซนเซอร์จริง

  const airTempBase = 30 + day * 3 + wobble; // ~26-34
  const airRhBase = 86 - day * 4 + wobble * 2; // ~80-92, ชื้นขึ้นตอนกลางคืน
  const bedTempBase = 33 + day * 1.5 + wobble * 0.5; // กองเห็ดอุ่นกว่าอากาศเล็กน้อย

  const airTemps = {} as Record<Location, number>;
  const airRhs = {} as Record<Location, number>;
  const bedTemps = {} as Record<Location, number>;

  LOCATIONS.forEach((loc, i) => {
    airTemps[loc] = round1(clamp(airTempBase + (i - 1) * 0.4, 26, 34));
    airRhs[loc] = round1(clamp(airRhBase - (i - 1) * 1.2, 80, 92));
    bedTemps[loc] = round1(bedTempBase + (i - 1) * 0.3);
  });

  const airTempMax = Math.max(...Object.values(airTemps));
  const bedTempMax = Math.max(...Object.values(bedTemps));
  const airRhAvg = Object.values(airRhs).reduce((a, b) => a + b, 0) / LOCATIONS.length;
  const waterOk = mockWaterOk(nowMs);

  // สะท้อน INTERLOCK เหล็ก (CLAUDE.md/docs/03-control-logic.md): ห้าม mist ถ้า T_air<27.5 หรือน้ำต่ำ,
  // ห้าม heater+mist ON พร้อมกัน — ใช้ตัดสินสถานะจำลองของ actuator เท่านั้น ไม่ใช่ authority จริง
  const mistAllowed = waterOk && airTempMax >= FALLBACK_SETPOINTS.temp_heater_on;
  const mist = mistAllowed && airRhAvg < FALLBACK_SETPOINTS.rh_max;
  const heater = airTempMax < FALLBACK_SETPOINTS.temp_heater_on + 0.5 && !mist;
  const exhaust = airTempMax > FALLBACK_SETPOINTS.temp_exhaust_on;
  const circulation = Math.abs(airTempMax - bedTempMax) > 2;

  return {
    ts: new Date(nowMs).toISOString(),
    airTemps,
    airRhs,
    bedTemps,
    airTempMax,
    bedTempMax,
    waterOk,
    mist,
    heater,
    exhaust,
    light: isDaylight(nowMs),
    circulation,
  };
}

export function buildMockLatest(nowMs: number = Date.now()): LatestResponse {
  const snap = buildSnapshot(nowMs);
  const sensors: SensorReadingRow[] = [];
  let id = 1;

  LOCATIONS.forEach((loc) => {
    sensors.push({ id: id++, kind: 'air_th', location: loc, metric: 'temp', value: snap.airTemps[loc], ts: snap.ts });
    sensors.push({ id: id++, kind: 'air_th', location: loc, metric: 'rh', value: snap.airRhs[loc], ts: snap.ts });
  });
  LOCATIONS.forEach((loc) => {
    sensors.push({ id: id++, kind: 'bed_temp', location: loc, metric: 'temp', value: snap.bedTemps[loc], ts: snap.ts });
  });
  sensors.push({ id: id++, kind: 'water_level', location: 'tank', metric: 'level', value: snap.waterOk ? 1 : 0, ts: snap.ts });

  const actuators: ActuatorStateRow[] = [
    { kind: 'mist', state: snap.mist, ts: snap.ts },
    { kind: 'heater', state: snap.heater, ts: snap.ts },
    { kind: 'exhaust', state: snap.exhaust, ts: snap.ts },
    { kind: 'light', state: snap.light, ts: snap.ts },
    { kind: 'circulation', state: snap.circulation, ts: snap.ts },
  ];

  const mode: FsmMode = 'FRUITING';
  return { sensors, actuators, mode, mode_ts: snap.ts };
}

export function buildMockConfig(): ConfigResponse {
  return { ...FALLBACK_SETPOINTS };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// จำลอง POST /actuators/:kind/command — mirror ทั้ง happy path และ 409 จาก backend/src/services/commandGuard.ts
// (โค้ด/ข้อความ error เดียวกัน) เพื่อให้เห็น toast ครบทุกแบบแม้ไม่มี backend จริง
export async function mockSendActuatorCommand(kind: ActuatorKind, action: CommandAction): Promise<CommandResult> {
  await delay(150 + Math.random() * 250); // จำลอง network latency ให้ UI เห็นสถานะ "กำลังส่ง" ก่อนตอบกลับ

  if (action === 'on' && (kind === 'mist' || kind === 'heater')) {
    const snap = buildSnapshot(Date.now());

    if (kind === 'mist') {
      if (!snap.waterOk) {
        return { status: 'rejected', reason: 'ระดับน้ำต่ำ — ห้ามพ่นหมอก', code: 'LOW_WATER' };
      }
      if (snap.bedTempMax >= FALLBACK_SETPOINTS.bed_danger) {
        return {
          status: 'rejected',
          reason: `กองเห็ดร้อนเกิน (${snap.bedTempMax.toFixed(1)}°C >= ${FALLBACK_SETPOINTS.bed_danger}°C) — ห้ามพ่นหมอก`,
          code: 'BED_OVERHEAT',
        };
      }
      if (snap.airTempMax < FALLBACK_SETPOINTS.temp_heater_on) {
        return {
          status: 'rejected',
          reason: `อากาศเย็นเกิน (${snap.airTempMax.toFixed(1)}°C < ${FALLBACK_SETPOINTS.temp_heater_on}°C) — ห้ามพ่นหมอกเด็ดขาด`,
          code: 'COLD_INTERLOCK',
        };
      }
      if (snap.heater) {
        return { status: 'rejected', reason: 'ฮีทเตอร์กำลังทำงานอยู่ — ห้ามเปิดพ่นหมอกพร้อมกัน', code: 'HEATER_MIST_INTERLOCK' };
      }
    } else if (snap.mist) {
      return { status: 'rejected', reason: 'ปั๊มพ่นหมอกกำลังทำงานอยู่ — ห้ามเปิดฮีทเตอร์พร้อมกัน', code: 'HEATER_MIST_INTERLOCK' };
    }
  }

  return { status: 'ok' };
}
