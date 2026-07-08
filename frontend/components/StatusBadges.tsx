'use client';

import { MODE_LABELS } from '@/lib/constants';
import { timeAgoLabel } from '@/lib/format';
import type { FsmMode } from '@/lib/types';

export function ConnectionBadge({ online, lastUpdateMs, nowMs }: { online: boolean; lastUpdateMs: number | null; nowMs: number }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-card px-3 py-1.5 shadow-soft">
      <span className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-leaf' : 'bg-danger'}`} />
      <span className="text-xs font-medium text-gray-700">{online ? 'ออนไลน์' : 'ออฟไลน์'}</span>
      <span className="text-xs text-gray-400">· {timeAgoLabel(lastUpdateMs, nowMs)}</span>
    </div>
  );
}

const MODE_STYLES: Record<FsmMode, string> = {
  BOOT: 'bg-gray-100 text-gray-600',
  SELFTEST: 'bg-gray-100 text-gray-600',
  SPAWN_RUN: 'bg-leaf/10 text-leaf-dark',
  FRUITING: 'bg-leaf/10 text-leaf-dark',
  MANUAL: 'bg-gold/20 text-[#8a6410]',
  SAFE_HOLD: 'bg-danger/10 text-danger',
};

export function ModeBadge({ mode }: { mode: FsmMode | null }) {
  if (!mode) {
    return <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500">ไม่ทราบสถานะ</span>;
  }
  return (
    <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${MODE_STYLES[mode]}`}>{MODE_LABELS[mode]}</span>
  );
}
