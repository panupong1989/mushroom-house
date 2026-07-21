// โหมดจำลองข้อมูล (เปิดด้วย NEXT_PUBLIC_USE_MOCK — ดู lib/api.ts) สำหรับ deploy frontend เดี่ยวๆ บน Vercel
// โดยยังไม่มี backend จริง ใช้สูตร sine เดียวกับ backend/scripts/mock-telemetry.ts (dayNightFactor + wobble)
// ให้ค่าที่เห็นแกว่งสมจริง และ mirror กฎ interlock จาก backend/src/services/commandGuard.ts
// เพื่อให้ปุ่มสั่งอุปกรณ์ได้ feedback ครบทุกแบบ (สำเร็จ / ถูกปฏิเสธ 409) แม้ไม่มี backend
import { FALLBACK_SETPOINTS } from './constants';
import type {
  ActuatorKind,
  ActuatorStateRow,
  AlertRow,
  CommandAction,
  CommandResult,
  ConfigResponse,
  FsmMode,
  LatestResponse,
  SensorMetaRow,
  SensorReadingRow,
} from './types';

// ตรงกับสเปกโรงจริง (supabase/migrations/005_real_sensors.sql): air_th ในโรง 2 จุด (หัว/ท้าย),
// bed_temp ในกอง 2 แถว x 3 ตำแหน่ง (หัว/กลาง/ท้าย) = 6 จุด, outside_temp นอกโรง 1 จุด
const AIR_LOCATIONS = ['head', 'tail'] as const;
type AirLocation = (typeof AIR_LOCATIONS)[number];

const BED_ROWS = [1, 2] as const;
const BED_LOCATIONS = ['head', 'mid', 'tail'] as const;
type BedLocation = (typeof BED_LOCATIONS)[number];
const BED_TIER: Record<BedLocation, string> = { head: 'top', mid: 'mid', tail: 'bottom' };

// sensorId คงที่ต่อ "เซนเซอร์จริง" ให้ตรงกับ seed ของ supabase/migrations/005_real_sensors.sql —
// ใช้ร่วมกันทั้ง buildMockLatest, buildMockAirHistory และ buildMockSensorReadings ด้านล่าง
const AIR_SENSOR_ID: Record<AirLocation, number> = { head: 1, tail: 3 };
const BED_SENSOR_ID: Record<number, Record<BedLocation, number>> = {
  1: { head: 4, mid: 5, tail: 6 },
  2: { head: 8, mid: 9, tail: 10 },
};
const OUTSIDE_SENSOR_ID = 11;
const WATER_SENSOR_ID = 7;

// metadata เซนเซอร์ (โหมด mock) — คู่กับ fetchSupabaseSensorMeta (ตาราง sensors จริง) ให้
// component กราฟย้อนหลัง (lib/hooks.ts useSensorMeta) ใช้ path เดียวกันได้ทั้ง mock/Supabase
export const MOCK_SENSOR_META: (SensorMetaRow & { kind: string })[] = [
  { id: AIR_SENSOR_ID.head, kind: 'air_th', location: 'head', rowNo: null, tier: null },
  { id: AIR_SENSOR_ID.tail, kind: 'air_th', location: 'tail', rowNo: null, tier: null },
  ...BED_ROWS.flatMap((rowNo) =>
    BED_LOCATIONS.map((loc) => ({
      id: BED_SENSOR_ID[rowNo][loc],
      kind: 'bed_temp',
      location: loc,
      rowNo,
      tier: BED_TIER[loc],
    }))
  ),
  { id: OUTSIDE_SENSOR_ID, kind: 'outside_temp', location: 'outside', rowNo: null, tier: null },
];

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
  airTemps: Record<AirLocation, number>;
  airRhs: Record<AirLocation, number>;
  bedTemps: Record<number, Record<BedLocation, number>>; // key = row_no (1|2)
  outsideTemp: number;
  airTempMax: number; // ค่าใช้คุม = max จากทุกจุดอากาศ (docs/03-control-logic.md), ตรงกับ lib/derive.ts airTempCtrl
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
  const outsideTempBase = 28 + day * 6 + wobble * 1.5; // นอกโรงแกว่งตามแดด/ลมมากกว่าในโรง

  const airTemps = {} as Record<AirLocation, number>;
  const airRhs = {} as Record<AirLocation, number>;
  AIR_LOCATIONS.forEach((loc, i) => {
    const offset = (i - 0.5) * 0.8; // head/tail อยู่คนละฝั่งโรง
    airTemps[loc] = round1(clamp(airTempBase + offset, 26, 34));
    airRhs[loc] = round1(clamp(airRhBase - offset * 3, 80, 92));
  });

  const bedTemps = {} as Record<number, Record<BedLocation, number>>;
  BED_ROWS.forEach((rowNo, r) => {
    const rowOffset = (r - 0.5) * 0.6; // แถว 1/2 อุณหภูมิต่างกันเล็กน้อย
    const perLoc = {} as Record<BedLocation, number>;
    BED_LOCATIONS.forEach((loc, i) => {
      perLoc[loc] = round1(bedTempBase + rowOffset + (i - 1) * 0.3);
    });
    bedTemps[rowNo] = perLoc;
  });

  const airTempMax = Math.max(...Object.values(airTemps));
  const bedTempMax = Math.max(...BED_ROWS.flatMap((rowNo) => Object.values(bedTemps[rowNo])));
  const airRhAvg = Object.values(airRhs).reduce((a, b) => a + b, 0) / AIR_LOCATIONS.length;
  const outsideTemp = round1(clamp(outsideTempBase, 15, 42));
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
    outsideTemp,
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

  // sensorId คงที่ต่อ "เซนเซอร์จริง" (ตรงกับ sensors.id ใน seed) — temp/rh ของจุดเดียวกันใช้ id เดียว
  // ให้ lib/derive.ts จัดกลุ่มด้วย sensorId ได้เหมือน path Supabase จริง (ดู supabase/migrations/005_real_sensors.sql)
  AIR_LOCATIONS.forEach((loc) => {
    sensors.push({ id: id++, sensorId: AIR_SENSOR_ID[loc], kind: 'air_th', location: loc, metric: 'temp', value: snap.airTemps[loc], ts: snap.ts });
    sensors.push({ id: id++, sensorId: AIR_SENSOR_ID[loc], kind: 'air_th', location: loc, metric: 'rh', value: snap.airRhs[loc], ts: snap.ts });
  });
  BED_ROWS.forEach((rowNo) => {
    BED_LOCATIONS.forEach((loc) => {
      sensors.push({
        id: id++,
        sensorId: BED_SENSOR_ID[rowNo][loc],
        kind: 'bed_temp',
        location: loc,
        rowNo,
        metric: 'temp',
        value: snap.bedTemps[rowNo][loc],
        ts: snap.ts,
      });
    });
  });
  sensors.push({ id: id++, sensorId: OUTSIDE_SENSOR_ID, kind: 'outside_temp', location: 'outside', metric: 'temp', value: snap.outsideTemp, ts: snap.ts });
  sensors.push({ id: id++, sensorId: WATER_SENSOR_ID, kind: 'water_level', location: 'tank', metric: 'level', value: snap.waterOk ? 1 : 0, ts: snap.ts });

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

// การแจ้งเตือนจำลอง (โหมด mock/dev) — โชว์ทั้งที่ยังไม่หายและที่หายแล้ว ครบทุกระดับความรุนแรง
export function buildMockAlerts(nowMs: number = Date.now()): AlertRow[] {
  const ago = (m: number) => new Date(nowMs - m * 60000).toISOString();
  return [
    { id: 3, ts: ago(2), severity: 'critical', code: 'LOW_WATER', message: 'ระดับน้ำต่ำ — ล็อกปั๊ม/หมอกอัตโนมัติ', resolved_at: null },
    { id: 2, ts: ago(48), severity: 'warn', code: 'HOT', message: 'อากาศร้อน 34.6°C — เปิดพัดลมดูด', resolved_at: ago(41) },
    { id: 1, ts: ago(200), severity: 'info', code: 'SENSOR_LOST', message: 'เซนเซอร์อากาศจุดกลางหลุดชั่วคราว', resolved_at: ago(196) },
  ];
}

// สร้าง air_th readings ย้อนหลังสำหรับกราฟ (โหมด mock/dev) — เก็บทุก stepMs โดยใช้ buildSnapshot เดิม
// คืน SensorReadingRow[] ให้ lib/history.ts bucketAirHistory ประมวลผลต่อ (เส้นทางเดียวกับข้อมูลจริง)
export function buildMockAirHistory(sinceMs: number, nowMs: number, stepMs: number): SensorReadingRow[] {
  const rows: SensorReadingRow[] = [];
  let id = 1;
  for (let t = sinceMs; t <= nowMs; t += stepMs) {
    const snap = buildSnapshot(t);
    const ts = new Date(t).toISOString();
    AIR_LOCATIONS.forEach((loc) => {
      rows.push({ id: id++, sensorId: AIR_SENSOR_ID[loc], kind: 'air_th', location: loc, metric: 'temp', value: snap.airTemps[loc], ts });
      rows.push({ id: id++, sensorId: AIR_SENSOR_ID[loc], kind: 'air_th', location: loc, metric: 'rh', value: snap.airRhs[loc], ts });
    });
  }
  return rows;
}

// สร้าง readings ย้อนหลังของ kind ใดๆ (โหมด mock/dev) — ใช้กับกราฟย้อนหลังแบบต่อเซนเซอร์
// (lib/history.ts bucketSensorReadings) ต่างจาก buildMockAirHistory ตรงที่ครอบคลุมทุก kind
// (air_th/bed_temp/outside_temp) ให้ตรงกับ RPC sensor_history_range ของจริง
export function buildMockSensorReadings(kind: string, sinceMs: number, nowMs: number, stepMs: number): SensorReadingRow[] {
  const rows: SensorReadingRow[] = [];
  let id = 1;
  for (let t = sinceMs; t <= nowMs; t += stepMs) {
    const snap = buildSnapshot(t);
    const ts = new Date(t).toISOString();
    if (kind === 'air_th') {
      AIR_LOCATIONS.forEach((loc) => {
        rows.push({ id: id++, sensorId: AIR_SENSOR_ID[loc], kind, location: loc, metric: 'temp', value: snap.airTemps[loc], ts });
        rows.push({ id: id++, sensorId: AIR_SENSOR_ID[loc], kind, location: loc, metric: 'rh', value: snap.airRhs[loc], ts });
      });
    } else if (kind === 'bed_temp') {
      BED_ROWS.forEach((rowNo) => {
        BED_LOCATIONS.forEach((loc) => {
          rows.push({
            id: id++,
            sensorId: BED_SENSOR_ID[rowNo][loc],
            kind,
            location: loc,
            rowNo,
            metric: 'temp',
            value: snap.bedTemps[rowNo][loc],
            ts,
          });
        });
      });
    } else if (kind === 'outside_temp') {
      rows.push({ id: id++, sensorId: OUTSIDE_SENSOR_ID, kind, location: 'outside', metric: 'temp', value: snap.outsideTemp, ts });
    }
  }
  return rows;
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
