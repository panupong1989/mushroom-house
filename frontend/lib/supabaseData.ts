// Data layer โหมด Internet (Supabase) — ให้รูปแบบข้อมูลตรงกับ backend REST เดิม
// (LatestResponse/ConfigResponse/CommandResult ใน lib/types.ts) เพื่อให้ lib/derive.ts,
// lib/interlock.ts และ component เดิมใช้ต่อได้ทันทีโดยไม่ต้องแก้
import { supabase } from './supabaseClient';
import { RANGE_MS, RANGE_META, type AirHistory, type HistoryRange, type Point, type RangeKey, type SensorSeriesRow } from './history';
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

const ALERTS_LIMIT = 50;

// bucket_seconds ต่อช่วง — ให้ได้จำนวนจุดใกล้เคียง RANGE_BUCKETS (24h→30 นาที, 7d→3 ชม.)
const RANGE_BUCKET_SEC: Record<HistoryRange, number> = { '24h': 1800, '7d': 10800 };

interface SensorMeta {
  kind: string;
  location: string | null;
  rowNo: number | null;
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
      client.from('sensors').select('id,kind,location,row_no').eq('house_id', houseId),
      client.from('actuators').select('id,kind').eq('house_id', houseId),
      client.from('houses').select('last_mode,last_mode_ts').eq('id', houseId).maybeSingle(),
    ]);
    if (cancelled) return;
    if (sensorsRes.error || actuatorsRes.error || houseRes.error) {
      onError('เชื่อมต่อ Supabase ไม่ได้ — ตรวจสอบ NEXT_PUBLIC_SUPABASE_URL/ANON_KEY และ RLS');
      return;
    }

    for (const s of sensorsRes.data ?? []) {
      sensorMeta.set(s.id, { kind: s.kind, location: s.location, rowNo: s.row_no ?? null });
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
        rowNo: meta.rowNo,
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
          rowNo: meta.rowNo,
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
  // 24 ชม. อ่าน raw (air_history); 7 วัน+ อ่าน rollup รายชั่วโมง (air_history_rollup) — เบากว่า/ข้อมูลไม่โดน prune
  const rpcName = range === '24h' ? 'air_history' : 'air_history_rollup';
  const { data, error } = await supabase.rpc(rpcName, {
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

// metadata เซนเซอร์ต่อ kind (id/location/row_no/tier) — ใช้ label + จัดกลุ่มเส้นกราฟย้อนหลัง
// (ตาราง sensors, supabase/migrations/005_real_sensors.sql) anon อ่านได้ตาม RLS เดิม
export async function fetchSupabaseSensorMeta(houseId: string, kind: string): Promise<SensorMetaRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('sensors')
    .select('id,location,row_no,tier')
    .eq('house_id', houseId)
    .eq('kind', kind);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    location: row.location,
    rowNo: row.row_no ?? null,
    tier: row.tier ?? null,
  }));
}

interface RpcSensorHistoryRow {
  bucket_ts: string;
  sensor_id: number;
  metric: string;
  v_min: number;
  v_max: number;
  v_avg: number;
}

function mapSensorHistoryRows(data: RpcSensorHistoryRow[]): SensorSeriesRow[] {
  return data
    .map((row) => ({
      bucketTs: new Date(row.bucket_ts).getTime(),
      sensorId: row.sensor_id,
      metric: row.metric,
      vMin: row.v_min,
      vMax: row.v_max,
      vAvg: row.v_avg,
    }))
    .filter((r) => !Number.isNaN(r.bucketTs));
}

// กราฟย้อนหลังต่อเซนเซอร์ (read-only) — endMs=null ใช้ RPC sensor_history_range (อิง now() ฝั่ง DB,
// สำหรับ "ล่าสุด/live"); endMs ระบุ = ผู้ใช้เลือกวันย้อนหลังจาก date picker เรียก sensor_history ตรงๆ
// ด้วย since ที่คำนวณเอง แล้วกรอง bucket_ts <= endMs ฝั่ง client (RPC ไม่มีขอบบน)
export async function fetchSupabaseSensorHistory(
  houseId: string,
  kind: string,
  range: RangeKey,
  endMs: number | null
): Promise<SensorSeriesRow[]> {
  if (!supabase) return [];
  const meta = RANGE_META[range];

  if (endMs == null) {
    const { data, error } = await supabase.rpc('sensor_history_range', {
      p_house_id: houseId,
      p_kind: kind,
      p_range: range,
    });
    if (error || !data) return [];
    return mapSensorHistoryRows(data as RpcSensorHistoryRow[]);
  }

  const sinceIso = new Date(endMs - meta.spanMs).toISOString();
  const { data, error } = await supabase.rpc('sensor_history', {
    p_house_id: houseId,
    p_kind: kind,
    p_since: sinceIso,
    p_bucket_seconds: meta.bucketSeconds,
    p_use_rollup: meta.rollup,
  });
  if (error || !data) return [];
  return mapSensorHistoryRows(data as RpcSensorHistoryRow[]).filter((r) => r.bucketTs <= endMs);
}

// การแจ้งเตือน (read-only) — anon SELECT ได้ตาม RLS
export async function fetchSupabaseAlerts(houseId: string): Promise<AlertRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('alerts')
    .select('id,ts,severity,code,message,resolved_at')
    .eq('house_id', houseId)
    .order('ts', { ascending: false })
    .limit(ALERTS_LIMIT);
  if (error || !data) return [];
  return data as AlertRow[];
}

// subscribe alerts realtime — initial fetch + INSERT (แจ้งเตือนใหม่) + UPDATE (resolved_at เปลี่ยน)
export function subscribeSupabaseAlerts(
  houseId: string,
  onData: (rows: AlertRow[]) => void,
  onError: (message: string) => void
): () => void {
  if (!supabase) {
    onError('Supabase client ยังไม่พร้อมใช้งาน');
    return () => {};
  }
  const client = supabase;
  let cancelled = false;
  const map = new Map<number, AlertRow>();
  const emit = () => {
    if (!cancelled) onData(Array.from(map.values()));
  };

  fetchSupabaseAlerts(houseId).then((rows) => {
    if (cancelled) return;
    for (const r of rows) map.set(r.id, r);
    emit();
  });

  const channel = client
    .channel(`house-${houseId}-alerts`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'alerts', filter: `house_id=eq.${houseId}` },
      (payload) => {
        const r = payload.new as AlertRow;
        map.set(r.id, r);
        emit();
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'alerts', filter: `house_id=eq.${houseId}` },
      (payload) => {
        const r = payload.new as AlertRow;
        map.set(r.id, r);
        emit();
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError('การเชื่อมต่อ realtime การแจ้งเตือนขัดข้อง — กำลังลองใหม่');
      }
    });

  return () => {
    cancelled = true;
    client.removeChannel(channel);
  };
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

// แก้ setpoint (โหมด Internet) — upsert control_config ของ active profile
// ต้อง login (RLS: authenticated เท่านั้น insert/update control_config ได้ — ดู 003_auth_rls.sql)
export async function updateSupabaseConfig(
  houseId: string,
  updates: Record<string, number>
): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: 'Supabase client ยังไม่พร้อมใช้งาน' };

  const { data: house, error: hErr } = await supabase
    .from('houses')
    .select('active_profile')
    .eq('id', houseId)
    .maybeSingle();
  if (hErr) return { ok: false, message: hErr.message };
  const profile = house?.active_profile ?? 'fruiting';

  const rows = Object.entries(updates).map(([key, value]) => ({ house_id: houseId, profile, key, value }));
  if (rows.length === 0) return { ok: true };

  const { error } = await supabase.from('control_config').upsert(rows, { onConflict: 'house_id,profile,key' });
  if (error) {
    // RLS ปฏิเสธ (ยังไม่ login / token หมดอายุ) มักได้ code 401/42501
    return { ok: false, message: `บันทึกไม่สำเร็จ — ${error.message}` };
  }
  return { ok: true };
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
