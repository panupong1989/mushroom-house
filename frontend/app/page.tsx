'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TempGauge } from '@/components/TempGauge';
import { Card } from '@/components/Card';
import { ConnectionBadge, ModeBadge } from '@/components/StatusBadges';
import { BedTempCard } from '@/components/BedTempCard';
import { InHouseCard } from '@/components/InHouseCard';
import { OutsideTempCard } from '@/components/OutsideTempCard';
import { HumidityCard } from '@/components/HumidityCard';
import { WaterLevelCard } from '@/components/WaterLevelCard';
import { ModeToggle, type SystemMode } from '@/components/ModeToggle';
import { ActuatorPanel } from '@/components/ActuatorPanel';
import { HistorySection } from '@/components/HistorySection';
import { AlertsSection } from '@/components/AlertsSection';
import { LoginPanel } from '@/components/LoginPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { TabNav, type TabKey } from '@/components/TabNav';
import { ToastStack, type Toast } from '@/components/ToastStack';
import { useConfig, useLatest, useNow, useSession } from '@/lib/hooks';
import { SUPABASE_ENABLED } from '@/lib/supabaseClient';
import { deriveTelemetry } from '@/lib/derive';
import { HOUSE_ID, sendActuatorCommand } from '@/lib/api';
import { ACTUATOR_KINDS, FALLBACK_SETPOINTS } from '@/lib/constants';

const MODE_STORAGE_KEY = 'mushroom-house:system-mode';

export default function Page() {
  const houseId = HOUSE_ID;
  const { data: latest, error } = useLatest(houseId);
  const config = useConfig(houseId);
  const now = useNow();
  const { session } = useSession();
  // โหมด Supabase: ต้อง login ถึงจะสั่งงานได้ (RLS บังคับจริงด้วย) — โหมด mock/dev ปลดล็อกให้เลย
  const canControl = !SUPABASE_ENABLED || !!session;

  const [systemMode, setSystemModeState] = useState<SystemMode>('AUTO');
  const [clearingOverrides, setClearingOverrides] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const [tab, setTab] = useState<TabKey>('monitor');

  useEffect(() => {
    const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (saved === 'AUTO' || saved === 'MANUAL') setSystemModeState(saved);
  }, []);

  const pushToast = useCallback((kind: Toast['kind'], message: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const setSystemMode = useCallback(
    async (next: SystemMode) => {
      if (next === systemMode) return;

      if (next === 'AUTO') {
        // สำคัญ: สลับ MANUAL -> AUTO ต้องเคลียร์ manual override ของทุกอุปกรณ์ทันที
        // ให้ control loop (ESP32) กลับมาคุมเอง — ส่ง action:'auto' ครบทุกตัว (docs/05-api.md)
        setClearingOverrides(true);
        const results = await Promise.all(
          ACTUATOR_KINDS.map((kind) => sendActuatorCommand(kind, 'auto', 60, houseId))
        );
        setClearingOverrides(false);
        const failed = results.filter((r) => r.status !== 'ok');
        if (failed.length === 0) {
          pushToast('success', 'กลับสู่โหมด AUTO แล้ว — เคลียร์ manual override ทุกอุปกรณ์สำเร็จ');
        } else {
          pushToast('error', `กลับสู่ AUTO แล้ว แต่เคลียร์ override ไม่สำเร็จ ${failed.length} อุปกรณ์ — ลองสั่งใหม่หรือเช็คการเชื่อมต่อ`);
        }
      } else {
        pushToast('success', 'สลับเป็นโหมด MANUAL — ปลดล็อกปุ่มควบคุมอุปกรณ์แล้ว');
      }

      setSystemModeState(next);
      window.localStorage.setItem(MODE_STORAGE_KEY, next);
    },
    [systemMode, houseId, pushToast]
  );

  const telemetry = deriveTelemetry(latest ?? null, now || Date.now());
  const setpoints = { ...FALLBACK_SETPOINTS, ...(config ?? {}) };
  const safeHold = latest?.mode === 'SAFE_HOLD';
  const controlsLocked = systemMode === 'AUTO' || safeHold;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 pb-24 sm:p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">โรงเห็ดฟาง 01</h1>
          <p className="text-xs text-gray-400">Dashboard ตรวจสอบ + ควบคุม</p>
        </div>
        <ModeBadge mode={latest?.mode ?? null} />
      </header>

      <ConnectionBadge online={telemetry.online} lastUpdateMs={telemetry.lastUpdateMs} nowMs={now || Date.now()} />

      {error && (
        <div className="rounded-xl2 bg-danger/10 p-3 text-sm text-danger">
          {error} — กำลังลองใหม่อัตโนมัติทุกไม่กี่วินาที (ตรวจสอบ NEXT_PUBLIC_API_URL หรือ
          NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)
        </div>
      )}

      <TabNav active={tab} onChange={setTab} />

      {tab === 'monitor' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="md:col-span-2 xl:col-span-1">
            <Card title="🌡️ อุณหภูมิอากาศ (ใช้คุม)">
              <TempGauge
                value={telemetry.airTempCtrl}
                goldMin={setpoints.temp_fruit_min}
                goldMax={setpoints.temp_fruit_max}
                coldLimit={setpoints.temp_heater_on}
                dangerHot={setpoints.temp_danger_hot}
              />
            </Card>
          </div>

          <InHouseCard air={telemetry.air} />
          <OutsideTempCard outside={telemetry.outside} />
          <HumidityCard rh={telemetry.airRhAvg} rhMin={setpoints.rh_min} rhMax={setpoints.rh_max} />
          <BedTempCard bed={telemetry.bed} bedDanger={setpoints.bed_danger} />
          <WaterLevelCard waterOk={telemetry.waterOk} />

          {canControl ? (
            <>
              <div className="md:col-span-2 xl:col-span-3">
                <ModeToggle mode={systemMode} onChange={setSystemMode} busy={clearingOverrides} safeHold={!!safeHold} />
              </div>
              <div className="md:col-span-2 xl:col-span-3">
                <ActuatorPanel telemetry={telemetry} setpoints={setpoints} locked={controlsLocked} houseId={houseId} />
              </div>
            </>
          ) : (
            <div className="rounded-xl2 border border-white/70 bg-card p-4 text-center text-sm text-gray-400 shadow-soft md:col-span-2 xl:col-span-3">
              🔒 เข้าสู่ระบบในแท็บ &ldquo;ตั้งค่า&rdquo; เพื่อปลดล็อกการสั่งงานอุปกรณ์
            </div>
          )}
        </div>
      )}

      {tab === 'history' && <HistorySection houseId={houseId} />}

      {tab === 'alerts' && <AlertsSection houseId={houseId} />}

      {tab === 'settings' && (
        <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-4 md:items-start">
          {SUPABASE_ENABLED && <LoginPanel session={session} />}
          {canControl ? (
            <SettingsPanel houseId={houseId} />
          ) : (
            <div className="rounded-xl2 border border-white/70 bg-card p-4 text-center text-sm text-gray-400 shadow-soft">
              🔒 เข้าสู่ระบบด้านบนก่อนเพื่อแก้ setpoint
            </div>
          )}
        </div>
      )}

      <ToastStack toasts={toasts} />
    </main>
  );
}
