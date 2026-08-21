'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from './Card';
import { fetchAlertConfig, sendTestAlert, setAlertConfig, setAlertNotifyLine, setAlertThreshold } from '@/lib/api';
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
  notifyLine: boolean;
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
      setSaved(
        Object.fromEntries(
          rows.map((r) => [r.code, { enabled: r.enabled, threshold: r.threshold, notifyLine: r.notifyLine }])
        )
      );
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
      notifyLine: d.notifyLine ?? s?.notifyLine ?? true,
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
        const lineChanged = d.notifyLine !== undefined && d.notifyLine !== (s?.notifyLine ?? true);
        return enabledChanged || thChanged || lineChanged;
      }),
    [draft, saved]
  );

  function setEnabled(code: string, enabled: boolean) {
    setMsg(null);
    setDraft((d) => ({ ...d, [code]: { ...d[code], enabled } }));
  }

  function setNotifyLine(code: string, notifyLine: boolean) {
    setMsg(null);
    setDraft((d) => ({ ...d, [code]: { ...d[code], notifyLine } }));
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
      if (d.notifyLine !== undefined && d.notifyLine !== (s?.notifyLine ?? true)) {
        const res = await setAlertNotifyLine(houseId, c.code, d.notifyLine);
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

  // ปุ่มทดสอบยิง alert จริงเข้า DB → notify-line อ่าน alert_config (enabled + notify_line) "ที่บันทึกไว้"
  // จึงต้องบอกผลตามค่าที่บันทึก ไม่ใช่ค่าใน draft (ไม่งั้นข้อความจะโกหกถ้ายังไม่กดบันทึก)
  async function test(code: string, label: string) {
    setTesting(code);
    setMsg(null);
    // ปิดทั้งชนิด (enabled=false) = ไม่ส่ง LINE ไม่ว่า notify_line เป็นอะไร — ตรงกับ notifyLineFlag() ใน notify-line
    const savedEnabled = saved[code]?.enabled ?? true;
    const savedLine = savedEnabled && (saved[code]?.notifyLine ?? true);
    const pending =
      (draft[code]?.notifyLine !== undefined && draft[code]?.notifyLine !== (saved[code]?.notifyLine ?? true)) ||
      (draft[code]?.enabled !== undefined && draft[code]?.enabled !== savedEnabled);
    const res = await sendTestAlert(houseId, code);
    setTesting(null);
    const note = pending ? ' · (ค่าที่เพิ่งแก้ยังไม่ได้บันทึก — การทดสอบใช้ค่าที่บันทึกไว้)' : '';
    setMsg(
      res.ok
        ? {
            kind: 'ok',
            text: savedLine
              ? `ยิงทดสอบ "${label}" แล้ว — ขึ้นในแท็บแจ้งเตือน + เด้ง LINE ภายในไม่กี่วินาที${note}`
              : `ยิงทดสอบ "${label}" แล้ว — ขึ้นในแท็บแจ้งเตือนอย่างเดียว (ชนิดนี้${
                  savedEnabled ? 'ปิด "ส่ง LINE" ไว้' : 'ถูกปิดทั้งชนิด จึงไม่ส่ง LINE'
                })${note}`,
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
      <p className="mb-2 text-[11px] text-gray-400">
        ชนิดที่เปิดไว้จะขึ้นในแท็บ &ldquo;แจ้งเตือน&rdquo; เสมอ · ปุ่ม <b>LINE</b> ของแต่ละแถวคือตัวเลือกว่า
        จะส่งเข้า LINE ด้วยไหม — เลือกได้อิสระทั้งฝั่ง<b>สูงเกิน</b>และฝั่ง<b>ต่ำเกิน</b> ไม่ผูกกับระดับความรุนแรง
        · <b>ปิดสวิตช์ขวาสุด = เงียบทั้งชนิด</b> (ไม่ขึ้นในแท็บแจ้งเตือน และไม่ส่ง LINE)
      </p>
      <div className="flex flex-col gap-1.5">
        {ALERT_CONFIG_CODES.map((c) => {
          const cur = current(c.code, c.defaultThreshold);
          const critical = c.severity === 'critical';
          return (
            <div key={c.code} className="flex flex-wrap items-center justify-between gap-2 rounded-xl2 bg-bg px-3 py-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1 text-sm font-medium text-gray-700">
                  {c.label}
                  {/* ระดับความรุนแรง = แค่บอกความเร่งด่วน/สีในแท็บแจ้งเตือน
                      ไม่ใช่ตัวตัดสินว่าเข้า LINE ไหมอีกแล้ว (migration 015 ย้ายไปที่ปุ่ม LINE ต่อแถว) */}
                  <span
                    className={`rounded px-1 py-0.5 text-[10px] font-normal ${
                      critical ? 'bg-danger/10 text-danger' : 'bg-warn/15 text-warn'
                    }`}
                    title={
                      critical
                        ? 'ระดับวิกฤต — เรื่องเร่งด่วน ขึ้นบนสุดในแท็บแจ้งเตือน (ปลายทาง LINE ตั้งแยกที่ปุ่ม LINE)'
                        : 'ระดับเตือน — เฝ้าดูไว้ ไม่เร่งด่วนเท่าวิกฤต (ปลายทาง LINE ตั้งแยกที่ปุ่ม LINE)'
                    }
                  >
                    {critical ? '🔴 วิกฤต' : '🟠 เตือน'}
                  </span>
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
                {/* ปลายทาง LINE ต่อชนิด (alert_config.notify_line — migration 015)
                    แสดงค่าจริงจาก DB ไม่ได้เดาจาก severity · จางลงเมื่อปิดแจ้งเตือนทั้งชนิด */}
                <button
                  onClick={() => setNotifyLine(c.code, !cur.notifyLine)}
                  role="switch"
                  aria-checked={cur.notifyLine}
                  aria-label={`ส่งแจ้งเตือน ${c.label} เข้า LINE`}
                  title={
                    !cur.enabled
                      ? 'ชนิดนี้ถูกปิดทั้งชนิด (สวิตช์ขวาสุด) — ไม่ส่ง LINE และไม่ขึ้นในแท็บแจ้งเตือน'
                      : cur.notifyLine
                        ? 'ชนิดนี้ส่งเข้า LINE — กดเพื่อปิด (ยังขึ้นในแท็บแจ้งเตือนเหมือนเดิม)'
                        : 'ชนิดนี้ไม่ส่งเข้า LINE — กดเพื่อเปิด'
                  }
                  className={`rounded-xl2 border px-2 py-1 text-[11px] font-medium transition ${
                    cur.notifyLine
                      ? 'border-leaf/40 bg-leaf/10 text-leaf'
                      : 'border-gray-200 text-gray-400 line-through'
                  } ${cur.enabled ? '' : 'opacity-40'}`}
                >
                  💬 LINE
                </button>
                <button
                  onClick={() => test(c.code, c.label)}
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
