'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { fetchAlerts, fetchConfig, fetchLatest, fetchSensorHistory, fetchSensorMeta } from './api';
import { SUPABASE_ENABLED, supabase } from './supabaseClient';
import { subscribeSupabaseAlerts, subscribeSupabaseLatest } from './supabaseData';
import { POLL_INTERVAL_MS } from './constants';
import type { RangeKey, SensorSeriesRow } from './history';
import type { AlertRow, ConfigResponse, LatestResponse, SensorMetaRow } from './types';

export interface SessionState {
  session: Session | null;
  loading: boolean;
}

// ติดตาม session ของ Supabase Auth (Email+Password) — persist ใน localStorage โดย default
// โหมด mock/dev (ไม่มี Supabase) คืน loading=false, session=null (หน้าใช้ !SUPABASE_ENABLED เป็น "authed")
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ session: null, loading: true });
  useEffect(() => {
    if (!supabase) {
      setState({ session: null, loading: false });
      return;
    }
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
    return () => sub.subscription.unsubscribe();
  }, []);
  return state;
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  // ค่าเริ่มต้น (SSR/first paint) เป็น 0 กัน hydration mismatch — ของจริง set ทันทีใน effect ด้านบน
  return now ?? 0;
}

// ความสูงกราฟหน้าประวัติ (px): มือถือ/แท็บเล็ตคงเดิม 150, เดสก์ท็อป (>=1024px) สูง ~58vh
// (clamp 320–680 กันจอเตี้ย/สูงผิดปกติ) — คืน 150 ตอน SSR/first paint กัน hydration mismatch
// แล้วค่อยวัดจริงใน effect; อัปเดตตาม resize (รวมหมุนจอ/ย่อหน้าต่าง)
export function useChartHeight(): number {
  const [height, setHeight] = useState(150);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => {
      setHeight(mq.matches ? Math.min(680, Math.max(320, Math.round(window.innerHeight * 0.58))) : 150);
    };
    update();
    // ฟังทั้ง resize (ปรับขนาดหน้าต่าง) และ mq change (ข้าม breakpoint) — บางสภาพแวดล้อมยิงไม่ครบทั้งคู่
    window.addEventListener('resize', update);
    mq.addEventListener('change', update);
    return () => {
      window.removeEventListener('resize', update);
      mq.removeEventListener('change', update);
    };
  }, []);
  return height;
}

export interface LatestState {
  data: LatestResponse | null;
  error: string | null;
  loading: boolean;
}

// โหมด Supabase: subscribe realtime (postgres_changes) ผ่าน subscribeSupabaseLatest แทนการ poll
// โหมด backend REST/mock (เดิม): poll GET /houses/:id/latest ทุก POLL_INTERVAL_MS
export function useLatest(houseId: string): LatestState {
  const [state, setState] = useState<LatestState>({ data: null, error: null, loading: true });

  useEffect(() => {
    let cancelled = false;

    if (SUPABASE_ENABLED) {
      const unsubscribe = subscribeSupabaseLatest(
        houseId,
        (data) => {
          if (!cancelled) setState({ data, error: null, loading: false });
        },
        (message) => {
          if (!cancelled) setState((s) => ({ ...s, error: message, loading: false }));
        }
      );
      return () => {
        cancelled = true;
        unsubscribe();
      };
    }

    async function tick() {
      try {
        const data = await fetchLatest(houseId);
        if (!cancelled) setState({ data, error: null, loading: false });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, error: 'เชื่อมต่อ backend ไม่ได้', loading: false }));
      }
    }
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [houseId]);

  return state;
}

export interface AlertsState {
  alerts: AlertRow[];
  error: string | null;
  loading: boolean;
}

// โหมด Supabase: subscribe realtime (alerts INSERT/UPDATE) — โหมด mock/dev: fetch ครั้งเดียว
export function useAlerts(houseId: string): AlertsState {
  const [state, setState] = useState<AlertsState>({ alerts: [], error: null, loading: true });

  useEffect(() => {
    let cancelled = false;

    if (SUPABASE_ENABLED) {
      const unsubscribe = subscribeSupabaseAlerts(
        houseId,
        (alerts) => {
          if (!cancelled) setState({ alerts, error: null, loading: false });
        },
        (message) => {
          if (!cancelled) setState((s) => ({ ...s, error: message, loading: false }));
        }
      );
      return () => {
        cancelled = true;
        unsubscribe();
      };
    }

    fetchAlerts(houseId)
      .then((alerts) => {
        if (!cancelled) setState({ alerts, error: null, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, error: 'โหลดการแจ้งเตือนไม่สำเร็จ', loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [houseId]);

  return state;
}

// metadata เซนเซอร์ต่อ kind (id/location/row_no/tier) — เปลี่ยนไม่บ่อย โหลดครั้งเดียวตอน mount/เปลี่ยน kind
export function useSensorMeta(houseId: string, kind: string): SensorMetaRow[] {
  const [meta, setMeta] = useState<SensorMetaRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchSensorMeta(houseId, kind).then((rows) => {
      if (!cancelled) setMeta(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [houseId, kind]);
  return meta;
}

export interface SensorHistoryState {
  rows: SensorSeriesRow[];
  loading: boolean;
  error: boolean;
}

// กราฟย้อนหลังต่อเซนเซอร์ — โหลดใหม่ทุกครั้งที่ range/endMs (date picker) เปลี่ยน
export function useSensorHistory(houseId: string, kind: string, range: RangeKey, endMs: number | null): SensorHistoryState {
  const [state, setState] = useState<SensorHistoryState>({ rows: [], loading: true, error: false });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: false }));
    fetchSensorHistory(houseId, kind, range, endMs)
      .then((rows) => {
        if (!cancelled) setState({ rows, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ rows: [], loading: false, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [houseId, kind, range, endMs]);
  return state;
}

// setpoint เปลี่ยนไม่บ่อย — โหลดครั้งเดียวตอน mount พอ (ไม่ต้อง poll ถี่เท่า telemetry)
export function useConfig(houseId: string, profile?: string): ConfigResponse | null {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchConfig(houseId, profile)
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        /* ใช้ FALLBACK_SETPOINTS ต่อไปถ้าโหลดไม่สำเร็จ */
      });
    return () => {
      cancelled = true;
    };
  }, [houseId, profile]);
  return config;
}
