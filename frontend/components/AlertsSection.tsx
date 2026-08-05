'use client';

import { useEffect, useState } from 'react';
import { Card } from './Card';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { useAlerts, useNow } from '@/lib/hooks';
import {
  ALERT_CONFIG_CODES,
  SEVERITY_LABEL,
  activeAlertCount,
  alertCodeLabel,
  sortAlerts,
} from '@/lib/alerts';
import { timeAgoLabel } from '@/lib/format';
import { endOfDayMs } from '@/lib/history';
import {
  countAlerts,
  deleteAlertsAll,
  deleteAlertsBefore,
  fetchAlertConfig,
  resolveAllAlerts,
  setAlertConfig,
} from '@/lib/api';
import type { Severity } from '@/lib/types';

const SEV_STYLE: Record<Severity, string> = {
  critical: 'border-danger/30 bg-danger/10 text-danger',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
};
const SEV_ICON: Record<Severity, string> = { critical: '🔴', warn: '🟠', info: '🔵' };

type PendingDelete = { title: string; description: string; count: number | null; run: () => Promise<{ ok: boolean; count?: number; message?: string }> };

export function AlertsSection({ houseId, canManage = false }: { houseId: string; canManage?: boolean }) {
  const { alerts, loading, error } = useAlerts(houseId);
  const now = useNow(30000);
  const sorted = sortAlerts(alerts);
  const active = activeAlertCount(alerts);

  // config เปิด/ปิดการแจ้งเตือนต่อ code (enabled map — default true ถ้ายังไม่มีแถว)
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [beforeDate, setBeforeDate] = useState('');
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    fetchAlertConfig(houseId).then((rows) => {
      if (cancelled) return;
      setEnabled(Object.fromEntries(rows.map((r) => [r.code, r.enabled])));
    });
    return () => {
      cancelled = true;
    };
  }, [houseId, canManage]);

  async function toggle(code: string) {
    const next = !(enabled[code] ?? true);
    setEnabled((e) => ({ ...e, [code]: next })); // optimistic
    const res = await setAlertConfig(houseId, code, next);
    if (!res.ok) {
      setEnabled((e) => ({ ...e, [code]: !next })); // revert
      setMsg({ kind: 'err', text: `บันทึกไม่สำเร็จ — ${res.message ?? 'ตรวจสอบว่ายัง login อยู่'}` });
    }
  }

  async function doResolveAll() {
    setBusy(true);
    setMsg(null);
    const res = await resolveAllAlerts(houseId);
    setBusy(false);
    setMsg(
      res.ok
        ? { kind: 'ok', text: `✅ เคลียร์แล้ว ${res.count?.toLocaleString() ?? 0} รายการ (mark หายแล้ว)` }
        : { kind: 'err', text: `❌ เคลียร์ไม่สำเร็จ — ${res.message ?? 'ตรวจสอบว่ายัง login อยู่'}` }
    );
  }

  async function openDelete(kind: 'all' | 'before') {
    setMsg(null);
    if (kind === 'before' && !beforeDate) {
      setMsg({ kind: 'err', text: 'เลือกวันก่อนกดลบก่อนวันที่' });
      return;
    }
    const beforeIso = kind === 'before' ? new Date(endOfDayMs(beforeDate)).toISOString() : undefined;
    setPending({
      title: kind === 'all' ? 'ลบการแจ้งเตือนทั้งหมด' : `ลบการแจ้งเตือนก่อน ${beforeDate}`,
      description: kind === 'all' ? 'ลบ alert ทั้งหมดของโรงนี้ถาวร' : `ลบ alert ที่เก่ากว่า ${beforeDate} 23:59 ถาวร`,
      count: null,
      run: () => (kind === 'all' ? deleteAlertsAll(houseId) : deleteAlertsBefore(houseId, beforeIso as string)),
    });
    const n = await countAlerts(houseId, beforeIso);
    setPending((p) => (p ? { ...p, count: n } : p));
  }

  async function runDelete() {
    if (!pending) return;
    setBusy(true);
    const res = await pending.run();
    setBusy(false);
    setPending(null);
    setMsg(
      res.ok
        ? { kind: 'ok', text: `✅ ลบแล้ว ${res.count?.toLocaleString() ?? 0} รายการ` }
        : { kind: 'err', text: `❌ ลบไม่สำเร็จ — ${res.message ?? 'ตรวจสอบว่ายัง login อยู่'}` }
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---- ตั้งค่า + จัดการ (เฉพาะตอน login) ---- */}
      {canManage && (
        <Card title="⚙️ ตั้งค่าการแจ้งเตือน">
          <p className="mb-2 text-[11px] text-gray-400">
            ปิดได้แค่ &ldquo;การแจ้งเตือน&rdquo; — ระบบความปลอดภัย (ตัดปั๊ม/heater) ยังทำงานทุกกรณีเสมอ
          </p>
          <div className="flex flex-col gap-1.5">
            {ALERT_CONFIG_CODES.map((c) => {
              const on = enabled[c.code] ?? true;
              return (
                <div key={c.code} className="flex items-center justify-between gap-2 rounded-xl2 bg-bg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{c.label}</p>
                    <p className="text-[10px] text-gray-400">{c.note}</p>
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

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            <button
              onClick={doResolveAll}
              disabled={busy || active === 0}
              className="rounded-xl2 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              เคลียร์ทั้งหมด{active > 0 ? ` (${active})` : ''}
            </button>
            <button
              onClick={() => openDelete('all')}
              className="rounded-xl2 border border-danger/40 bg-danger/5 px-3 py-1.5 text-xs font-medium text-danger"
            >
              ลบทั้งหมด
            </button>
            <span className="flex items-center gap-1">
              <input
                type="date"
                value={beforeDate}
                max={now ? new Date(now).toISOString().slice(0, 10) : undefined}
                onChange={(e) => setBeforeDate(e.target.value)}
                className="rounded-xl2 border border-gray-200 bg-card px-2 py-1 text-xs text-gray-700"
                aria-label="ลบก่อนวันที่"
              />
              <button
                onClick={() => openDelete('before')}
                disabled={!beforeDate}
                className="rounded-xl2 border border-danger/40 bg-danger/5 px-2.5 py-1 text-xs font-medium text-danger disabled:opacity-40"
              >
                ลบก่อนวันนี้
              </button>
            </span>
          </div>

          {msg && (
            <div className={`mt-2 rounded-xl2 p-2 text-sm font-medium ${msg.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-danger/10 text-danger'}`}>
              {msg.text}
            </div>
          )}
        </Card>
      )}

      {/* ---- รายการแจ้งเตือน ---- */}
      <Card title={`🔔 การแจ้งเตือน${active > 0 ? ` · ${active} ที่ยังไม่หาย` : ''}`}>
        {loading ? (
          <p className="text-xs text-gray-400">กำลังโหลด…</p>
        ) : error ? (
          <div className="rounded-xl2 bg-danger/10 p-3 text-xs text-danger">{error}</div>
        ) : sorted.length === 0 ? (
          <p className="text-xs text-gray-400">ไม่มีการแจ้งเตือน — ระบบปกติ</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.slice(0, 20).map((a) => (
              <li
                key={a.id}
                className={`rounded-xl2 border p-2 ${SEV_STYLE[a.severity]} ${a.resolved_at ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {SEV_ICON[a.severity]} {alertCodeLabel(a.code)}
                  </span>
                  <span className="shrink-0 text-[10px] font-medium">
                    {a.resolved_at ? 'แก้แล้ว' : SEVERITY_LABEL[a.severity]}
                  </span>
                </div>
                {a.message && <p className="mt-0.5 text-xs opacity-90">{a.message}</p>}
                <p className="mt-0.5 text-[10px] opacity-70">{timeAgoLabel(new Date(a.ts).getTime(), now || Date.now())}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDeleteDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        description={pending?.description ?? ''}
        count={pending?.count ?? null}
        busy={busy}
        onConfirm={runDelete}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
