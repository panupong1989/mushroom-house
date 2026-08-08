// Data layer โหมด Internet (Supabase) — ให้รูปแบบข้อมูลตรงกับ backend REST เดิม
// (LatestResponse/ConfigResponse/CommandResult ใน lib/types.ts) เพื่อให้ lib/derive.ts,
// lib/interlock.ts และ component เดิมใช้ต่อได้ทันทีโดยไม่ต้องแก้
import { supabase } from './supabaseClient';
import { RANGE_MS, RANGE_META, type AirHistory, type HistoryRange, type Point, type RangeKey, type SensorSeriesRow } from './history';
import { BED_SCAN_REFRESH_MS, LATEST_REFRESH_MS } from './constants';
import type {
  ActuatorKind,
  ActuatorStateRow,
  AlertConfigRow,
  AlertRow,
  BedScanRow,
  CommandAction,
  CommandResult,
  ConfigResponse,
  FsmMode,
  LatestResponse,
  MappingSensor,
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

  let metaReady = false;
  let loadedOnce = false;
  let refreshing = false;

  // metadata (sensors/actuators) เปลี่ยนแทบไม่เลย — โหลดครั้งเดียวแล้ว cache ไว้
  async function loadMeta(): Promise<boolean> {
    const [sensorsRes, actuatorsRes] = await Promise.all([
      client.from('sensors').select('id,kind,location,row_no').eq('house_id', houseId),
      client.from('actuators').select('id,kind').eq('house_id', houseId),
    ]);
    if (cancelled) return false;
    if (sensorsRes.error || actuatorsRes.error) return false;

    for (const s of sensorsRes.data ?? []) {
      sensorMeta.set(s.id, { kind: s.kind, location: s.location, rowNo: s.row_no ?? null });
      // location เป็น metadata สำหรับ label เท่านั้น (จัดกลุ่มด้วย sensor_id) — แต่ถ้า null = misconfig
      // ใน DB: การ์ดจะโชว์ "เซนเซอร์ #id" แทนชื่อจุด ควรไปเซ็ต location ให้ครบ (ดู supabase/migrations)
      if ((s.kind === 'air_th' || s.kind === 'bed_temp') && s.location == null) {
        console.warn(`[supabase] sensor #${s.id} (${s.kind}) ไม่มี location ใน DB — misconfig, จะแสดง label สำรอง`);
      }
    }
    for (const a of actuatorsRes.data ?? []) actuatorMeta.set(a.id, a.kind as ActuatorKind);
    return true;
  }

  // ค่าล่าสุด — เรียกได้ซ้ำ (initial load / poll กันพลาด / realtime กลับมาต่อ / กลับมาเปิดแท็บ)
  // upsert* เทียบ ts ก่อนทับอยู่แล้ว จึงปลอดภัยที่จะดึงซ้อนกับ event realtime
  async function loadLatest(): Promise<boolean> {
    const [readingsRes, eventsRes, houseRes] = await Promise.all([
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
      client.from('houses').select('last_mode,last_mode_ts').eq('id', houseId).maybeSingle(),
    ]);
    if (cancelled) return false;
    if (readingsRes.error || eventsRes.error || houseRes.error) return false;

    mode = (houseRes.data?.last_mode as FsmMode | null) ?? null;
    modeTs = houseRes.data?.last_mode_ts ?? null;

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
    return true;
  }

  async function refresh() {
    if (cancelled || refreshing) return;
    refreshing = true;
    try {
      if (!metaReady) metaReady = await loadMeta();
      const ok = metaReady && (await loadLatest());
      if (cancelled) return;
      if (ok) loadedOnce = true;
      // poll ที่พลาดชั่วคราวไม่ต้องขึ้น error ทับข้อมูลดีที่มีอยู่ — เตือนเฉพาะตอนยังโหลดไม่สำเร็จสักครั้ง
      else if (!loadedOnce) {
        onError('เชื่อมต่อ Supabase ไม่ได้ — ตรวจสอบ NEXT_PUBLIC_SUPABASE_URL/ANON_KEY และ RLS');
      }
    } finally {
      refreshing = false;
    }
  }

  refresh();

  // ตาข่ายกันพลาด: realtime หลุดเงียบๆ ได้ (WebSocket ตาย / แท็บหลับ / มือถือล็อกจอ) แล้ว
  // postgres_changes ไม่เข้าอีกเลย → หน้าเว็บค้างจนขึ้น "ออฟไลน์" ทั้งที่บอร์ดยังยิงข้อมูลอยู่
  const pollId = setInterval(refresh, LATEST_REFRESH_MS);

  // กลับมาเปิดแท็บ/ปลดล็อกจอ → ดึงทันที ไม่ต้องรอครบรอบ poll
  const onVisible = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

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
      // SUBSCRIBED ครั้งแรก = ต่อติดปกติ (refresh() แรกกำลังทำงานอยู่แล้ว) · ครั้งถัดๆ ไป = เพิ่ง
      // ต่อกลับหลังหลุด → ต้องดึงย้อนเอาแถวที่พลาดไประหว่างขาด (realtime ไม่ replay ให้)
      if (status === 'SUBSCRIBED') {
        if (loadedOnce) refresh();
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // ไม่ขึ้น error ให้ผู้ใช้ตกใจ — poll ทุก LATEST_REFRESH_MS คุมค่าให้สดอยู่แล้ว
        console.warn('[supabase] realtime channel', status, '— ใช้ poll สำรองระหว่างต่อใหม่');
      }
    });

  return () => {
    cancelled = true;
    clearInterval(pollId);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
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

// ---- จัดการ alert (authenticated เท่านั้น — supabase/migrations/008_alert_config.sql) ----
async function callAlertRpc(name: string, params: Record<string, unknown>): Promise<{ ok: boolean; count?: number; message?: string }> {
  if (!supabase) return { ok: false, message: 'Supabase client ยังไม่พร้อมใช้งาน' };
  const { data, error } = await supabase.rpc(name, params);
  if (error) return { ok: false, message: error.message };
  return { ok: true, count: Number(data) };
}
export function resolveAllSupabaseAlerts(houseId: string) {
  return callAlertRpc('resolve_all_alerts', { p_house: houseId });
}
export function deleteSupabaseAlertsAll(houseId: string) {
  return callAlertRpc('delete_alerts_all', { p_house: houseId });
}
export function deleteSupabaseAlertsBefore(houseId: string, beforeIso: string) {
  return callAlertRpc('delete_alerts_before', { p_house: houseId, p_before: beforeIso });
}
export async function countSupabaseAlerts(houseId: string, beforeIso?: string): Promise<number> {
  if (!supabase) return 0;
  let q = supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('house_id', houseId);
  if (beforeIso) q = q.lt('ts', beforeIso);
  const { count, error } = await q;
  return error ? 0 : count ?? 0;
}

// alert_config: อ่าน/แก้ toggle เปิด-ปิด + ค่าเกณฑ์ (threshold) การแจ้งเตือนต่อ code
export async function fetchSupabaseAlertConfig(houseId: string): Promise<AlertConfigRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('alert_config').select('code,enabled,threshold').eq('house_id', houseId);
  if (error || !data) return [];
  return data.map((r) => ({ code: r.code, enabled: r.enabled, threshold: r.threshold ?? null }));
}
export async function setSupabaseAlertConfig(houseId: string, code: string, enabled: boolean): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: 'Supabase client ยังไม่พร้อมใช้งาน' };
  const { error } = await supabase
    .from('alert_config')
    .upsert({ house_id: houseId, code, enabled }, { onConflict: 'house_id,code' });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
export async function setSupabaseAlertThreshold(houseId: string, code: string, threshold: number): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: 'Supabase client ยังไม่พร้อมใช้งาน' };
  const { error } = await supabase
    .from('alert_config')
    .upsert({ house_id: houseId, code, threshold }, { onConflict: 'house_id,code' });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
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

// ===========================================================================
// หน้า Maintenance (supabase/migrations/007_maintenance.sql)
// ===========================================================================

// subscribe ตาราง bed_scan (live ROM + temp ที่ ESP32 push) แบบ realtime — mirror subscribeSupabaseAlerts
// keyed ด้วย rom_id (upsert 1 แถวต่อ rom); DELETE = ลบออกจาก map (เช่น reset mapping)
export function subscribeBedScan(
  houseId: string,
  onData: (rows: BedScanRow[]) => void,
  onError: (message: string) => void
): () => void {
  if (!supabase) {
    onError('Supabase client ยังไม่พร้อมใช้งาน');
    return () => {};
  }
  const client = supabase;
  let cancelled = false;
  const map = new Map<string, BedScanRow>();
  const emit = () => {
    if (!cancelled) onData(Array.from(map.values()));
  };

  const toRow = (r: { rom_id: string; temp_c: number | null; updated_at: string }): BedScanRow => ({
    romId: r.rom_id,
    tempC: r.temp_c,
    updatedAt: r.updated_at,
  });

  let loadedOnce = false;
  async function reload() {
    if (cancelled) return;
    const { data, error } = await client
      .from('bed_scan')
      .select('rom_id,temp_c,updated_at')
      .eq('house_id', houseId);
    if (cancelled) return;
    if (error) {
      if (!loadedOnce) onError('โหลด live scan ไม่สำเร็จ');
      return;
    }
    loadedOnce = true;
    map.clear();   // reload = ภาพเต็มจาก DB (แถวที่ถูกลบ เช่น reset mapping จะหายตามด้วย)
    for (const r of data ?? []) map.set(r.rom_id, toRow(r));
    emit();
  }

  reload();
  // live scan ต้องสดจริง (หน้าจับคู่ดูค่าพุ่งตอนกำเซนเซอร์) — ESP32 push ทุก ~5 วิ, poll คู่กับ
  // realtime กันกรณี WebSocket หลุดแล้วค่าค้างจนขึ้น "เก่า" ทั้งที่บอร์ดยัง push อยู่
  const pollId = setInterval(reload, BED_SCAN_REFRESH_MS);

  const channel = client
    .channel(`house-${houseId}-bedscan`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bed_scan', filter: `house_id=eq.${houseId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as { rom_id?: string };
          if (old?.rom_id) map.delete(old.rom_id);
        } else {
          const r = payload.new as { rom_id: string; temp_c: number | null; updated_at: string };
          map.set(r.rom_id, toRow(r));
        }
        emit();
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED' && loadedOnce) reload();   // ต่อกลับหลังหลุด → ดึงภาพเต็มใหม่
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[supabase] realtime (live scan)', status, '— ใช้ poll สำรองระหว่างต่อใหม่');
      }
    });

  return () => {
    cancelled = true;
    clearInterval(pollId);
    client.removeChannel(channel);
  };
}

// record ตำแหน่งเซนเซอร์ (bed_temp + outside_temp) พร้อม rom_id ที่ผูกอยู่ — สำหรับ dropdown จับคู่
export async function fetchSupabaseMappingSensors(houseId: string): Promise<MappingSensor[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('sensors')
    .select('id,kind,address,rom_id')
    .eq('house_id', houseId)
    .in('kind', ['bed_temp', 'outside_temp']);
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, kind: r.kind, address: r.address, romId: r.rom_id ?? null }));
}

// จับคู่ rom → ตำแหน่ง (RPC assign_sensor_rom — authenticated เท่านั้น) · address '' = ปลดเป็นว่าง
export async function assignSupabaseSensorRom(
  houseId: string,
  rom: string,
  address: string
): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: 'Supabase client ยังไม่พร้อมใช้งาน' };
  const { error } = await supabase.rpc('assign_sensor_rom', { p_house: houseId, p_rom: rom, p_address: address });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// นับ readings (ก่อนลบ — โชว์ใน dialog ยืนยัน) · beforeIso ระบุ = นับเฉพาะก่อนวันนั้น
export async function countSupabaseReadings(houseId: string, beforeIso?: string): Promise<number> {
  if (!supabase) return 0;
  let q = supabase.from('sensor_readings').select('*', { count: 'exact', head: true }).eq('house_id', houseId);
  if (beforeIso) q = q.lt('ts', beforeIso);
  const { count, error } = await q;
  return error ? 0 : count ?? 0;
}

async function callPurgeRpc(
  name: string,
  params: Record<string, unknown>
): Promise<{ ok: boolean; count?: number; message?: string }> {
  if (!supabase) return { ok: false, message: 'Supabase client ยังไม่พร้อมใช้งาน' };
  const { data, error } = await supabase.rpc(name, params);
  if (error) return { ok: false, message: error.message };
  return { ok: true, count: Number(data) };
}

export function purgeSupabaseReadingsAll(houseId: string) {
  return callPurgeRpc('purge_readings_all', { p_house: houseId });
}
export function purgeSupabaseReadingsBefore(houseId: string, beforeIso: string) {
  return callPurgeRpc('purge_readings_before', { p_house: houseId, p_before: beforeIso });
}
export function resetSupabaseSensorRom(houseId: string) {
  return callPurgeRpc('reset_sensor_rom', { p_house: houseId });
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
