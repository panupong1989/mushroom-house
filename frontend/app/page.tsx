'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TempGauge } from '@/components/TempGauge';
import { Card } from '@/components/Card';
import { ConnectionBadge, ModeBadge } from '@/components/StatusBadges';
import { BedTempCard } from '@/components/BedTempCard';
import { HumidityCard } from '@/components/HumidityCard';
import { WaterLevelCard } from '@/components/WaterLevelCard';
import { ModeToggle, type SystemMode } from '@/components/ModeToggle';
import { ActuatorPanel } from '@/components/ActuatorPanel';
import { ToastStack, type Toast } from '@/components/ToastStack';
import { useConfig, useLatest, useNow } from '@/lib/hooks';
import { deriveTelemetry } from '@/lib/derive';
import { HOUSE_ID, sendActuatorCommand } from '@/lib/api';
import { ACTUATOR_KINDS, FALLBACK_SETPOINTS, LOCATION_LABELS } from '@/lib/constants';
import { fmtNum } from '@/lib/format';

const MODE_STORAGE_KEY = 'mushroom-house:system-mode';

export default function Page() {
  const houseId = HOUSE_ID;
  const { data: latest, error } = useLatest(houseId);
  const config = useConfig(houseId);
  const now = useNow();

  const [systemMode, setSystemModeState] = useState<SystemMode>('AUTO');
  const [clearingOverrides, setClearingOverrides] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

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
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-24">
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
          {error} — กำลังลองใหม่อัตโนมัติทุกไม่กี่วินาที (ตรวจสอบ NEXT_PUBLIC_API_URL)
        </div>
      )}

      <Card title="อุณหภูมิอากาศ">
        <TempGauge
          value={telemetry.airTempCtrl}
          goldMin={setpoints.temp_fruit_min}
          goldMax={setpoints.temp_fruit_max}
          coldLimit={setpoints.temp_heater_on}
          dangerHot={setpoints.temp_danger_hot}
        />
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {(['head', 'mid', 'tail'] as const).map((loc) => (
            <div key={loc} className="rounded-xl2 bg-bg p-2">
              <p className="text-[11px] text-gray-500">{LOCATION_LABELS[loc]}</p>
              <p className="text-sm font-semibold text-gray-700">{fmtNum(telemetry.air[loc]?.temp ?? null)}°</p>
            </div>
          ))}
        </div>
      </Card>

      <HumidityCard rh={telemetry.airRhAvg} rhMin={setpoints.rh_min} rhMax={setpoints.rh_max} />
      <BedTempCard bed={telemetry.bed} bedDanger={setpoints.bed_danger} />
      <WaterLevelCard waterOk={telemetry.waterOk} />

      <ModeToggle mode={systemMode} onChange={setSystemMode} busy={clearingOverrides} safeHold={!!safeHold} />
      <ActuatorPanel telemetry={telemetry} setpoints={setpoints} locked={controlsLocked} houseId={houseId} />

      <ToastStack toasts={toasts} />
    </main>
  );
}
