'use client';

import { useEffect, useState } from 'react';

// dialog ยืนยันการลบ (DESTRUCTIVE) — บังคับพิมพ์คำยืนยัน (default "ลบ") ก่อนกดจริงได้
// โชว์จำนวนแถวที่จะลบ (count) — null = กำลังนับ · reset ช่องพิมพ์ทุกครั้งที่เปิดใหม่
export function ConfirmDeleteDialog({
  open,
  title,
  description,
  count,
  confirmWord = 'ลบ',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  count: number | null;
  confirmWord?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  if (!open) return null;
  const armed = typed.trim() === confirmWord && !busy;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={busy ? undefined : onCancel}
    >
      <div className="w-full max-w-sm rounded-xl2 bg-card p-4 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-danger">⚠️ {title}</h3>
        <p className="mt-1 text-xs text-gray-500">{description}</p>
        <p className="mt-2 rounded-xl2 bg-danger/10 p-2 text-xs text-danger">
          {count == null ? 'กำลังนับจำนวน…' : `จะลบทั้งหมด ${count.toLocaleString()} แถว — กู้คืนไม่ได้`}
        </p>
        <label className="mt-3 block text-xs text-gray-500">
          พิมพ์ <span className="font-bold text-gray-700">&ldquo;{confirmWord}&rdquo;</span> เพื่อยืนยัน
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1 w-full rounded-xl2 border border-gray-200 px-2 py-1.5 text-sm"
            aria-label="พิมพ์คำยืนยัน"
          />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl2 bg-bg px-3 py-1.5 text-sm font-medium text-gray-600 disabled:opacity-40"
          >
            ยกเลิก
          </button>
          <button
            onClick={onConfirm}
            disabled={!armed}
            className="rounded-xl2 bg-danger px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'กำลังลบ…' : 'ลบเลย'}
          </button>
        </div>
      </div>
    </div>
  );
}
