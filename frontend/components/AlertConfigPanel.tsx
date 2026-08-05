'use client';

import { useEffect, useState } from 'react';
import { Card } from './Card';
import { fetchAlertConfig, setAlertConfig, setAlertThreshold } from '@/lib/api';
import { ALERT_CONFIG_CODES } from '@/lib/alerts';

// การ์ด "ตั้งค่าการแจ้งเตือน" ในหน้าตั้งค่า — toggle เปิด/ปิด + แก้ "ค่าเกณฑ์" ต่อชนิด (แยกจาก setpoint)
// ⚠️ ปิด/ตั้งค่า = คุมแค่ "เมื่อไหร่เด้งเตือน" · safety interlock (ตัดปั๊ม/heater) ทำงานทุกกรณีเสมอ
interface CfgState {
  enabled: boolean;
  threshold: number | null;
}

export function AlertConfigPanel({ houseId }: { houseId: string }) {
  const [cfg, setCfg] = useState<Record<string, CfgState>>({});
  const [draft, setDraft] = useState<Record<string, string>>({}); // ค่าที่กำลังพิมพ์ในช่อง threshold
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAlertConfig(houseId).then((rows) => {
      if (cancelled) return;
      setCfg(Object.fromEntries(rows.map((r) => [r.code, { enabled: r.enabled, threshold: r.threshold }])));
    });
    return () => {
      cancelled = true;
    };
  }, [houseId]);

  async function toggle(code: string) {
    const next = !(cfg[code]?.enabled ?? true);
    setCfg((c) => ({ ...c, [code]: { enabled: next, threshold: c[code]?.threshold ?? null } })); // optimistic
    setMsg(null);
    const res = await setAlertConfig(houseId, code, next);
    if (!res.ok) {
      setCfg((c) => ({ ...c, [code]: { enabled: !next, threshold: c[code]?.threshold ?? null } }));
      setMsg(`บันทึกไม่สำเร็จ — ${res.message ?? 'ตรวจสอบว่ายัง login อยู่'}`);
    }
  }

  // บันทึกค่าเกณฑ์ตอน blur/Enter — validate เป็นตัวเลข
  async function commitThreshold(code: string, fallback: number | null) {
    const raw = draft[code];
    setDraft((d) => {
      const next = { ...d };
      delete next[code];
      return next;
    });
    if (raw == null || raw.trim() === '') return;
    const v = parseFloat(raw);
    if (Number.isNaN(v)) {
      setMsg('ค่าเกณฑ์ต้องเป็นตัวเลข');
      return;
    }
    if (v === (cfg[code]?.threshold ?? fallback)) return; // ไม่เปลี่ยน
    setCfg((c) => ({ ...c, [code]: { enabled: c[code]?.enabled ?? true, threshold: v } })); // optimistic
    setMsg(null);
    const res = await setAlertThreshold(houseId, code, v);
    if (!res.ok) setMsg(`บันทึกเกณฑ์ไม่สำเร็จ — ${res.message ?? 'ตรวจสอบว่ายัง login อยู่'}`);
  }

  return (
    <Card title="🔔 ตั้งค่าการแจ้งเตือน">
      <p className="mb-2 text-[11px] text-gray-400">
        ตั้ง &ldquo;เมื่อไหร่เด้งเตือน&rdquo; ได้เอง (แยกจาก setpoint คุม AUTO) · ระบบความปลอดภัย (ตัดปั๊ม/heater) ยังทำงานทุกกรณีเสมอ
      </p>
      <div className="flex flex-col gap-1.5">
        {ALERT_CONFIG_CODES.map((c) => {
          const on = cfg[c.code]?.enabled ?? true;
          const value = cfg[c.code]?.threshold ?? c.defaultThreshold;
          return (
            <div key={c.code} className="flex items-center justify-between gap-2 rounded-xl2 bg-bg px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">{c.label}</p>
                {c.hasThreshold ? (
                  <p className="flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
                    แจ้งเมื่อ {c.cmp}
                    <input
                      type="number"
                      value={draft[c.code] ?? (value ?? '')}
                      onChange={(e) => setDraft((d) => ({ ...d, [c.code]: e.target.value }))}
                      onBlur={() => commitThreshold(c.code, c.defaultThreshold)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      className="w-14 rounded border border-gray-200 bg-card px-1 py-0.5 text-right text-xs"
                      aria-label={`ค่าเกณฑ์ ${c.label}`}
                    />
                    {c.unit}
                    {c.safeNote && <span className="text-gray-400">· {c.safeNote}</span>}
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-400">{c.safeNote}</p>
                )}
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
        เคลียร์/ลบประวัติแจ้งเตือนอยู่ในการ์ด &ldquo;เคลียร์ข้อมูล&rdquo; ด้านล่าง · ความชื้นนอกช่วง = แจ้งอย่างเดียว ไม่หยุดระบบ
      </p>
    </Card>
  );
}
