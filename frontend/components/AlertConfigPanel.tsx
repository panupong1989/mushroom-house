'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from './Card';
import { useConfig } from '@/lib/hooks';
import { fetchAlertConfig, setAlertConfig } from '@/lib/api';
import { ALERT_CONFIG_CODES } from '@/lib/alerts';
import { FALLBACK_SETPOINTS } from '@/lib/constants';

// การ์ด "ตั้งค่าการแจ้งเตือน" ในหน้าตั้งค่า — toggle เปิด/ปิดต่อชนิด + โชว์ค่าเกณฑ์ข้างปุ่ม
// ค่าเกณฑ์ = setpoint เดียวกับที่ใช้คุม (เช่น HOT ใช้ temp_danger_hot) ยกเว้นน้ำต่ำที่ไม่มีเกณฑ์
// ⚠️ ปิด = เงียบการแจ้งเตือนเท่านั้น · safety interlock ยังทำงานทุกกรณี (firmware)
export function AlertConfigPanel({ houseId }: { houseId: string }) {
  const config = useConfig(houseId);
  const setpoints = useMemo(() => ({ ...FALLBACK_SETPOINTS, ...(config ?? {}) }) as Record<string, number>, [config]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAlertConfig(houseId).then((rows) => {
      if (!cancelled) setEnabled(Object.fromEntries(rows.map((r) => [r.code, r.enabled])));
    });
    return () => {
      cancelled = true;
    };
  }, [houseId]);

  async function toggle(code: string) {
    const next = !(enabled[code] ?? true);
    setEnabled((e) => ({ ...e, [code]: next })); // optimistic
    setMsg(null);
    const res = await setAlertConfig(houseId, code, next);
    if (!res.ok) {
      setEnabled((e) => ({ ...e, [code]: !next })); // revert
      setMsg(`บันทึกไม่สำเร็จ — ${res.message ?? 'ตรวจสอบว่ายัง login อยู่'}`);
    }
  }

  return (
    <Card title="🔔 ตั้งค่าการแจ้งเตือน">
      <p className="mb-2 text-[11px] text-gray-400">
        ปิดได้แค่ &ldquo;การแจ้งเตือน&rdquo; — ระบบความปลอดภัย (ตัดปั๊ม/heater) ยังทำงานทุกกรณีเสมอ · เกณฑ์ = ค่าเดียวกับ setpoint
      </p>
      <div className="flex flex-col gap-1.5">
        {ALERT_CONFIG_CODES.map((c) => {
          const on = enabled[c.code] ?? true;
          const threshold =
            c.thresholdKey != null && setpoints[c.thresholdKey] != null
              ? `แจ้งเมื่อ ${c.cmp} ${setpoints[c.thresholdKey]}${c.unit}`
              : c.safeNote || '—';
          return (
            <div key={c.code} className="flex items-center justify-between gap-2 rounded-xl2 bg-bg px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">{c.label}</p>
                <p className="truncate text-[10px] text-gray-400">
                  {threshold}
                  {c.thresholdKey != null && c.safeNote && <span> · {c.safeNote}</span>}
                </p>
              </div>
              <button
                onClick={() => toggle(c.code)}
                role="switch"
                aria-checked={on}
                aria-label={`เปิด/ปิดแจ้งเตือน ${c.label}`}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-leaf' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          );
        })}
      </div>
      {msg && <p className="mt-2 text-xs text-danger">{msg}</p>}
      <p className="mt-2 text-[11px] text-gray-400">
        แก้ค่าเกณฑ์ได้ที่ &ldquo;ตั้งค่า setpoint&rdquo; ด้านบน · เคลียร์/ลบประวัติแจ้งเตือนอยู่ในการ์ด &ldquo;เคลียร์ข้อมูล&rdquo; ด้านล่าง
      </p>
    </Card>
  );
}
