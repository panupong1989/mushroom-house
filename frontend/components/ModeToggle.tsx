'use client';

import { Card } from './Card';

export type SystemMode = 'AUTO' | 'MANUAL';

interface ModeToggleProps {
  mode: SystemMode;
  onChange: (mode: SystemMode) => void;
  busy: boolean;
  safeHold: boolean;
}

export function ModeToggle({ mode, onChange, busy, safeHold }: ModeToggleProps) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-medium text-gray-500">โหมดควบคุม (ทั้งระบบ)</h2>
          <p className="text-xs text-gray-400">สลับเป็น MANUAL เพื่อเทสอุปกรณ์หน้างาน — กลับ AUTO จะเคลียร์ override ทั้งหมดทันที</p>
        </div>
      </div>
      <div className="mt-3 flex rounded-full bg-bg p-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => onChange('AUTO')}
          className={`flex-1 rounded-full py-2 text-sm font-semibold transition disabled:opacity-50 ${
            mode === 'AUTO' ? 'bg-leaf text-white shadow-soft' : 'text-gray-500'
          }`}
        >
          AUTO
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onChange('MANUAL')}
          className={`flex-1 rounded-full py-2 text-sm font-semibold transition disabled:opacity-50 ${
            mode === 'MANUAL' ? 'bg-gold text-white shadow-soft' : 'text-gray-500'
          }`}
        >
          MANUAL
        </button>
      </div>
      {busy && <p className="mt-2 text-xs text-gray-500">กำลังเคลียร์ manual override ทุกอุปกรณ์…</p>}
      {safeHold && (
        <p className="mt-2 text-xs font-semibold text-danger">
          ระบบอยู่ใน SAFE HOLD (ฉุกเฉิน) — ปุ่มควบคุมอุปกรณ์ถูกล็อกไว้เพื่อความปลอดภัย ไม่ว่าจะอยู่โหมดใด
        </p>
      )}
    </Card>
  );
}
