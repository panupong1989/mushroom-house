'use client';

import { useEffect, useState } from 'react';
import { fetchConfig, fetchLatest } from './api';
import { SUPABASE_ENABLED } from './supabaseClient';
import { subscribeSupabaseLatest } from './supabaseData';
import { POLL_INTERVAL_MS } from './constants';
import type { ConfigResponse, LatestResponse } from './types';

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
