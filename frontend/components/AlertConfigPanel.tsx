'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from './Card';
import { fetchAlertConfig, sendTestAlert, setAlertConfig, setAlertThreshold } from '@/lib/api';
import { ALERT_CONFIG_CODES } from '@/lib/alerts';

// การ์ด "ตั้งค่าการแจ้งเตือน" ในหน้าตั้งค่า — toggle เปิด/ปิด + แก้ "ค่าเกณฑ์" ต่อชนิด (แยกจาก setpoint)
// ⚠️ ปิด/ตั้งค่า = คุมแค่ "เมื่อไหร่เด้งเตือน" · safety interlock (ตัดปั๊ม/heater) ทำงานทุกกรณีเสมอ
//
// ตั้งเกณฑ์ได้อิสระ ไม่ผูกกับโซนทอง/setpoint ใดๆ (ตั้งใจ — Beer 9 ส.ค.: บางสภาพแวดล้อม
// อยากเฝ้าค่าที่ต่างจากช่วงเป้าหมายปกติ ระบบไม่ควรไปห้าม)
//
// แก้แล้วต้องกด "บันทึก" (เดิมเซฟทันทีตอน toggle/blur — คนใช้ไม่รู้ว่าบันทึกไปหรือยัง)
interface CfgState {
  enabled: boolean;
  threshold: number | null;
}

export function AlertConfigPanel({ houseId }: { houseId: string }) {
  const [saved, setSaved] = useState<Record<string, CfgState>>({}); // ค่าที่อยู่ใน DB ตอนนี้
  const [draft, setDraft] = useState<Record<string, Partial<CfgState>>>({}); // เฉพาะที่ผู้ใช้แก้
  const [thresholdText, setThresholdText] = useState<Record<string, string>>({}); // ข้อความดิบในช่อง
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAlertConfig(houseId).then((rows) => {
      if (cancelled) return;
      setSaved(Object.fromEntries(rows.map((r) => [r.code, { enabled: r.enabled, threshold: r.threshold }])));
    });
    return () => {
      cancelled = true;
    };
  }, [houseId, reloadKey]);

  // ค่าที่ควรโชว์ = draft (ถ้าแก้) > DB > default ใน ALERT_CONFIG_CODES
  function current(code: string, defaultThreshold: number | null): CfgState {
    const d = draft[code] ?? {};
    const s = saved[code];
    return {
      enabled: d.enabled ?? s?.enabled ?? true,
      threshold: d.threshold !== undefined ? d.threshold : s?.threshold ?? defaultThreshold,
    };
  }

  const changed = useMemo(
    () =>
      ALERT_CONFIG_CODES.filter((c) => {
        const d = draft[c.code];
        if (!d) return false;
        const s = saved[c.code];
        const enabledChanged = d.enabled !== undefined && d.enabled !== (s?.enabled ?? true);
        const thChanged = d.threshold !== undefined && d.threshold !== (s?.threshold ?? c.defaultThreshold);
        return enabledChanged || thChanged;
      }),
    [draft, saved]
  );

  function setEnabled(code: string, enabled: boolean) {
    setMsg(null);
    setDraft((d) => ({ ...d, [code]: { ...d[code], enabled } }));
  }

  // เก็บค่าเกณฑ์ลง draft ตอน blur/Enter — validate ว่าเป็นตัวเลข (ไม่จำกัดช่วง: ตั้งได้อิสระ)
  function commitThreshold(code: string) {
    const raw = thresholdText[code];
    setThresholdText((t) => {
      const next = { ...t };
      delete next[code];
      return next;
    });
    if (raw == null || raw.trim() === '') return;
    const v = parseFloat(raw);
    if (Number.isNaN(v)) {
      setMsg({ kind: 'err', text: 'ค่าเกณฑ์ต้องเป็นตัวเลข' });
      return;
    }
    setMsg(null);
    setDraft((d) => ({ ...d, [code]: { ...d[code], threshold: v } }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    let failed = 0;
    let lastErr = '';
    for (const c of changed) {
      const d = draft[c.code] ?? {};
      const s = saved[c.code];
      if (d.enabled !== undefined && d.enabled !== (s?.enabled ?? true)) {
        const res = await setAlertConfig(houseId, c.code, d.enabled);
        if (!res.ok) {
          failed++;
          lastErr = res.message ?? '';
        }
      }
      if (d.threshold !== undefined && d.threshold !== null && d.threshold !== (s?.threshold ?? c.defaultThreshold)) {
        const res = await setAlertThreshold(houseId, c.code, d.threshold);
        if (!res.ok) {
          failed++;
          lastErr = res.message ?? '';
        }
      }
    }
    setSaving(false);
    if (failed === 0) {
      setDraft({});
      setReloadKey((k) => k + 1);
      setMsg({ kind: 'ok', text: `บันทึกแล้ว ${changed.length} รายการ` });
    } else {
      setMsg({ kind: 'err', text: `บันทึกไม่สำเร็จ ${failed} รายการ — ${lastErr || 'ตรวจสอบว่ายัง login อยู่'}` });
    }
  }

  async function test(code: string, label: string, isCritical: boolean) {
    setTesting(code);
    setMsg(null);
    const res = await sendTestAlert(houseId, code);
    setTesting(null);
    setMsg(
      res.ok
        ? {
            kind: 'ok',
            text: isCritical
              ? `ยิงทดสอบ "${label}" แล้ว — ดูในแท็บแจ้งเตือน + LINE ภายในไม่กี่วินาที`
              : `ยิงทดสอบ "${label}" แล้ว — ขึ้นในแท็บแจ้งเตือน · ระดับ "เตือน" จะไม่เข้า LINE ถ้าตั้ง LINE_MIN_SEVERITY=critical`,
          }
        : { kind: 'err', text: `ยิงทดสอบไม่สำเร็จ — ${res.message ?? 'ตรวจสอบว่ายัง login อยู่ (หรือยังไม่ได้รัน migration 014)'}` }
    );
  }

  return (
    <Card title="🔔 ตั้งค่าการแจ้งเตือน">
      <p className="mb-2 text-[11px] text-gray-400">
        ตั้ง &ldquo;เมื่อไหร่เด้งเตือน&rdquo; ได้เอง แยกจาก setpoint คุม AUTO — ตั้งค่าไหนก็ได้ตามที่อยากเฝ้า
        · ระบบความปลอดภัย (ตัดปั๊ม/heater) ยังทำงานทุกกรณีเสมอ
      </p>
      <div className="flex flex-col gap-1.5">
        {ALERT_CONFIG_CODES.map((c) => {
          const cur = current(c.code, c.defaultThreshold);
          const isCritical = c.code === 'LOW_WATER' || c.code === 'HOT' || c.code === 'BED_OVERHEAT';
          return (
            <div key={c.code} className="flex flex-wrap items-center justify-between gap-2 rounded-xl2 bg-bg px-3 py-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1 text-sm font-medium text-gray-700">
                  {c.label}
                  {c.needsFirmware && (
                    <span
                      className="rounded bg-warn/15 px-1 py-0.5 text-[10px] font-normal text-warn"
                      title="ตั้งค่าเก็บไว้ได้แล้ว แต่ ESP32 จะเริ่มยิงเตือนหลัง flash เฟิร์มแวร์เวอร์ชันใหม่"
                    >
                      รอ flash เฟิร์มแวร์
                    </span>
                  )}
                </p>
                {c.hasThreshold ? (
                  <p className="flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
                    แจ้งเมื่อ {c.cmp}
                    <input
                      type="number"
                      value={thresholdText[c.code] ?? (cur.threshold ?? '')}
                      onChange={(e) => setThresholdText((t) => ({ ...t, [c.code]: e.target.value }))}
                      onBlur={() => commitThreshold(c.code)}
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

              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => test(c.code, c.label, isCritical)}
                  disabled={testing !== null}
                  className="rounded-xl2 border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 disabled:opacity-40"
                  title="ยิง alert ปลอม 1 ครั้ง เพื่อเช็คว่าเส้นทางแจ้งเตือน (แท็บแจ้งเตือน + LINE) ทำงานอยู่"
                >
                  {testing === c.code ? 'กำลังยิง…' : '🧪 ทดสอบ'}
                </button>
                <button
                  onClick={() => setEnabled(c.code, !cur.enabled)}
                  role="switch"
                  aria-checked={cur.enabled}
                  aria-label={`เปิด/ปิดแจ้งเตือน ${c.label}`}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${cur.enabled ? 'bg-leaf' : 'bg-gray-300'}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${cur.enabled ? 'left-[22px]' : 'left-0.5'}`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs">
          {msg ? (
            <span className={msg.kind === 'ok' ? 'text-green-600' : 'text-danger'}>{msg.text}</span>
          ) : changed.length > 0 ? (
            <span className="text-gray-400">แก้ไป {changed.length} รายการ — ยังไม่ได้บันทึก</span>
          ) : (
            <span className="text-gray-400">ยังไม่มีการแก้</span>
          )}
        </span>
        <button
          onClick={save}
          disabled={saving || changed.length === 0}
          className="shrink-0 rounded-xl2 bg-gray-800 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>

      <p className="mt-2 text-[11px] text-gray-400">
        เคลียร์/ลบประวัติแจ้งเตือนอยู่ในการ์ด &ldquo;เคลียร์ข้อมูล&rdquo; ด้านล่าง · ความชื้นนอกช่วง = แจ้งอย่างเดียว ไม่หยุดระบบ
      </p>
    </Card>
  );
}
