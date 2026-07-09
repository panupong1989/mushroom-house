// Data layer โหมด Internet (Supabase) — ให้รูปแบบข้อมูลตรงกับ backend REST เดิม
// (LatestResponse/ConfigResponse/CommandResult ใน lib/types.ts) เพื่อให้ lib/derive.ts,
// lib/interlock.ts และ component เดิมใช้ต่อได้ทันทีโดยไม่ต้องแก้
import { supabase } from './supabaseClient';
import { RANGE_MS, type AirHistory, type HistoryRange, type Point } from './history';
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

// bucket_seconds ต่อช่วง — ให้ได้จำนวนจุดใกล้เคียง RANGE_BUCKETS (24h→30 นาที, 7d→3 ชม.)
const RANGE_BUCKET_SEC: Record<HistoryRange, number> = { '24h': 1800, '7d': 10800 };

interface SensorMeta {
  kind: string;
  location: string | null;
}

// แถวล่าสุดพอสำหรับ dedupe ต่อ (kind, location, metric) ตอน initial load — เกินพอสำหรับ
// เซนเซอร์ ~7 ตัว x metric ไม่กี่แบบ ของโรงเดียว
const READING_HISTORY_LIMIT = 200;
const EVENT_HISTORY_LIMIT = 100;

function upsertReading(map: Map<string, SensorReadingRow>, row: SensorReadingRow) {
  // dedupe ด้วย sensorId (PK จริง) ไม่ใช่ (kind, location) — เซนเซอร์ที่ location ซ้ำ/null จะได้ไม่ยุบ
  // รวมกันจนค่าล่าสุดของคนละตัวทับกัน (ดู lib/derive.ts) fallback kind:location เผื่อ path ที่ไม่มี id
  const key = `${row.sensorId ?? `${row.kind}:${row.location ?? ''}`}:${row.metric}`;
  const cur = map.get(key);
  if (!cur || new Date(row.ts).getTime() >= new Date(cur.ts).getTime()) map.set(key, row);
}

function upsertActuator(map: Map<ActuatorKind, ActuatorStateRow>, row: ActuatorStateRow) {
  const cur = map.get(row.kind);
  if (!cur || new Date(row.ts).getTime() >= new Date(cur.ts).getTime()) map.set(row.kind, row);
}

// subscribe ค่าล่าสุด + สถานะ actuator ของโรง houseId แบบ realtime — คืนฟังก์ชัน unsubscribe
// เรียก onData ทุกครั้งที่มีข้อมูลใหม่ (ทั้งตอน initial fetch และตอน realtime event เข้า)
export function subscribeSupabaseLatest(
  houseId: string,
  onData: (data: LatestResponse) => void,
  onError: (message: string) => void
): () => void {
  if (!supabase) {
    onError('Supabase client ยังไม่พร้อมใช้งาน — ตรวจสอบ NEXT_PUBLIC_SUPABASE_URL/ANON_KEY');
    return () => {};
  }
  const client = supabase;
  let cancelled = false;

  const sensorMeta = new Map<number, SensorMeta>();
  const actuatorMeta = new Map<number, ActuatorKind>();
  const readings = new Map<string, SensorReadingRow>();
  const actuatorStates = new Map<ActuatorKind, ActuatorStateRow>();
  let mode: FsmMode | null = null;
  let modeTs: string | null = null;

  function emit() {
    if (cancelled) return;
    onData({
      sensors: Array.from(readings.values()),
      actuators: Array.from(actuatorStates.values()),
      mode,
      mode_ts: modeTs,
    });
  }

  async function init() {
    const [sensorsRes, actuatorsRes, houseRes] = await Promise.all([
      client.from('sensors').select('id,kind,location').eq('house_id', houseId),
      client.from('actuators').select('id,kind').eq('house_id', houseId),
      client.from('houses').select('last_mode,last_mode_ts').eq('id', houseId).maybeSingle(),
    ]);
    if (cancelled) return;
    if (sensorsRes.error || actuatorsRes.error || houseRes.error) {
      onError('เชื่อมต่อ Supabase ไม่ได้ — ตรวจสอบ NEXT_PUBLIC_SUPABASE_URL/ANON_KEY และ RLS');
      return;
    }

    for (const s of sensorsRes.data ?? []) {
      sensorMeta.set(s.id, { kind: s.kind, location: s.location });
      // location เป็น metadata สำหรับ label เท่านั้น (จัดกลุ่มด้วย sensor_id) — แต่ถ้า null = misconfig
      // ใน DB: การ์ดจะโชว์ "เซนเซอร์ #id" แทนชื่อจุด ควรไปเซ็ต location ให้ครบ (ดู supabase/migrations)
      if ((s.kind === 'air_th' || s.kind === 'bed_temp') && s.location == null) {
        console.warn(`[supabase] sensor #${s.id} (${s.kind}) ไม่มี location ใน DB — misconfig, จะแสดง label สำรอง`);
      }
    }
    for (const a of actuatorsRes.data ?? []) actuatorMeta.set(a.id, a.kind as ActuatorKind);
    mode = (houseRes.data?.last_mode as FsmMode | null) ?? null;
    modeTs = houseRes.data?.last_mode_ts ?? null;

    const [readingsRes, eventsRes] = await Promise.all([
      client
        .from('sensor_readings')
        .select('id,sensor_id,ts,metric,value')
        .eq('house_id', houseId)
        .order('ts', { ascending: false })
        .limit(READING_HISTORY_LIMIT),
      client
        .from('actuator_events')
        .select('id,actuator_id,ts,state')
        .eq('house_id', houseId)
        .order('ts', { ascending: false })
        .limit(EVENT_HISTORY_LIMIT),
    ]);
    if (cancelled) return;
    if (readingsRes.error || eventsRes.error) {
      onError('เชื่อมต่อ Supabase ไม่ได้ — ตรวจสอบ NEXT_PUBLIC_SUPABASE_URL/ANON_KEY และ RLS');
      return;
    }

    for (const row of readingsRes.data ?? []) {
      const meta = sensorMeta.get(row.sensor_id);
      if (!meta) continue;
      upsertReading(readings, {
        id: row.id,
        sensorId: row.sensor_id,
        kind: meta.kind,
        location: meta.location,
        metric: row.metric,
        value: row.value,
        ts: row.ts,
      });
    }
    for (const row of eventsRes.data ?? []) {
      const kind = actuatorMeta.get(row.actuator_id);
      if (!kind) continue;
      upsertActuator(actuatorStates, { kind, state: row.state, ts: row.ts });
    }

    emit();
  }

  init();

  const channel = client
    .channel(`house-${houseId}-latest`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'sensor_readings', filter: `house_id=eq.${houseId}` },
      (payload) => {
        const row = payload.new as { id: number; sensor_id: number; ts: string; metric: string; value: number };
        const meta = sensorMeta.get(row.sensor_id);
        if (!meta) return; // เซนเซอร์ใหม่ที่เพิ่มหลัง init — v1 ยังไม่ re-fetch meta ระหว่างทาง
        upsertReading(readings, {
          id: row.id,
          sensorId: row.sensor_id,
          kind: meta.kind,
          location: meta.location,
          metric: row.metric,
          value: row.value,
          ts: row.ts,
        });
        emit();
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'actuator_events', filter: `house_id=eq.${houseId}` },
      (payload) => {
        const row = payload.new as { actuator_id: number; ts: string; state: boolean };
        const kind = actuatorMeta.get(row.actuator_id);
        if (!kind) return;
        upsertActuator(actuatorStates, { kind, state: row.state, ts: row.ts });
        emit();
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'houses', filter: `id=eq.${houseId}` },
      (payload) => {
        const row = payload.new as { last_mode: string | null; last_mode_ts: string | null };
        mode = (row.last_mode as FsmMode | null) ?? null;
        modeTs = row.last_mode_ts;
        emit();
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError('การเชื่อมต่อ realtime กับ Supabase ขัดข้อง — กำลังลองเชื่อมต่อใหม่');
      }
    });

  return () => {
    cancelled = true;
    client.removeChannel(channel);
  };
}

// กราฟย้อนหลัง (read-only) — aggregate ฝั่ง DB ผ่าน RPC air_history (ดู supabase/migrations/002)
export async function fetchSupabaseAirHistory(houseId: string, range: HistoryRange): Promise<AirHistory> {
  if (!supabase) return { temp: [], rh: [] };
  const sinceIso = new Date(Date.now() - RANGE_MS[range]).toISOString();
  const { data, error } = await supabase.rpc('air_history', {
    p_house_id: houseId,
    p_since: sinceIso,
    p_bucket_seconds: RANGE_BUCKET_SEC[range],
  });
  if (error || !data) return { temp: [], rh: [] };
  const temp: Point[] = [];
  const rh: Point[] = [];
  for (const row of data as { bucket_ts: string; temp_max: number | null; rh_avg: number | null }[]) {
    const t = new Date(row.bucket_ts).getTime();
    if (Number.isNaN(t)) continue;
    if (row.temp_max != null) temp.push({ t, v: row.temp_max });
    if (row.rh_avg != null) rh.push({ t, v: row.rh_avg });
  }
  return { temp, rh };
}

export async function fetchSupabaseConfig(houseId: string, profile?: string): Promise<ConfigResponse> {
  if (!supabase) throw new Error('Supabase client ยังไม่พร้อมใช้งาน');

  let activeProfile = profile;
  if (!activeProfile) {
    const { data, error } = await supabase.from('houses').select('active_profile').eq('id', houseId).maybeSingle();
    if (error) throw new Error(error.message);
    activeProfile = data?.active_profile ?? 'fruiting';
  }

  const { data, error } = await supabase
    .from('control_config')
    .select('key,value')
    .eq('house_id', houseId)
    .eq('profile', activeProfile);
  if (error) throw new Error(error.message);

  const config: ConfigResponse = {};
  for (const row of data ?? []) config[row.key] = row.value;
  return config;
}

// สั่ง manual (โหมด Internet) = insert แถวลงตาราง commands — ESP32 (service_role) จะรับคำสั่งไป
// ทีหลัง (firmware นอกขอบเขต PR นี้) จึงตอบแค่ "ส่งคำสั่งแล้ว" ไม่ใช่ "ทำงานแล้วจริง"
// interlock reject ของจริงจะมาเป็น event/สถานะย้อนกลับทีหลังเมื่อ firmware รองรับ (ดู supabase/README.md)
export async function sendSupabaseCommand(
  kind: string,
  action: CommandAction,
  ttlSec: number,
  houseId: string
): Promise<CommandResult> {
  if (!supabase) return { status: 'error', message: 'Supabase client ยังไม่พร้อมใช้งาน' };

  const { error } = await supabase.from('commands').insert({
    house_id: houseId,
    actuator: kind,
    action,
    ttl_sec: ttlSec,
  });

  if (error) {
    return { status: 'error', message: `ส่งคำสั่งไม่สำเร็จ — ${error.message}` };
  }
  return { status: 'ok', message: 'ส่งคำสั่งแล้ว — รอ ESP32 รับคำสั่ง' };
}
