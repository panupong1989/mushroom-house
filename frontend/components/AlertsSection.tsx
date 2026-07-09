'use client';

import { Card } from './Card';
import { useAlerts, useNow } from '@/lib/hooks';
import { SEVERITY_LABEL, activeAlertCount, alertCodeLabel, sortAlerts } from '@/lib/alerts';
import { timeAgoLabel } from '@/lib/format';
import type { Severity } from '@/lib/types';

const SEV_STYLE: Record<Severity, string> = {
  critical: 'border-danger/30 bg-danger/10 text-danger',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
};
const SEV_ICON: Record<Severity, string> = { critical: '🔴', warn: '🟠', info: '🔵' };

export function AlertsSection({ houseId }: { houseId: string }) {
  const { alerts, loading, error } = useAlerts(houseId);
  const now = useNow(30000);
  const sorted = sortAlerts(alerts);
  const active = activeAlertCount(alerts);

  return (
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
  );
}
