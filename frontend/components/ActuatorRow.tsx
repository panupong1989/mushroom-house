'use client';

import { useState } from 'react';
import { sendActuatorCommand } from '@/lib/api';
import { MANUAL_TTL_SEC } from '@/lib/constants';
import type { ActuatorKind, CommandAction } from '@/lib/types';

type RowStatus =
  | { kind: 'idle' }
  | { kind: 'sending'; action: CommandAction }
  | { kind: 'success'; message?: string }
  | { kind: 'error'; message: string }
  | { kind: 'rejected'; reason: string };

interface ActuatorRowProps {
  kind: ActuatorKind;
  label: string;
  isOn: boolean | null;
  locked: boolean;
  predictedBlock: string | null;
  houseId: string;
}

export function ActuatorRow({ kind, label, isOn, locked, predictedBlock, houseId }: ActuatorRowProps) {
  const [status, setStatus] = useState<RowStatus>({ kind: 'idle' });

  async function send(action: CommandAction) {
    setStatus({ kind: 'sending', action });
    // ttl_sec: backend/src/routes/actuators.ts บังคับต้องมีค่า (max 3600s)
    // ใช้ค่าสูงสุดตอน "เปิด" เพื่อให้พฤติกรรมใกล้เคียง "เปิดค้าง" มากที่สุดโดยไม่แก้ backend/firmware
    // TODO(CC): ถ้าต้องการ manual hold แบบไม่มีวันหมดอายุจริง ต้องเพิ่ม ttl_sec=0 (ไม่หมดอายุ) ฝั่ง backend/firmware
    const ttl = action === 'on' ? MANUAL_TTL_SEC : 60;
    const result = await sendActuatorCommand(kind, action, ttl, houseId);
    if (result.status === 'ok') {
      setStatus({ kind: 'success', message: result.message });
    } else if (result.status === 'rejected') {
      setStatus({ kind: 'rejected', reason: result.reason });
    } else {
      setStatus({ kind: 'error', message: result.message });
    }
    setTimeout(() => setStatus({ kind: 'idle' }), result.status === 'ok' ? 2500 : 5000);
  }

  const sending = status.kind === 'sending';
  const onActive = isOn === true;

  return (
    <div className="flex flex-col gap-1.5 rounded-xl2 bg-bg p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-xs font-semibold ${onActive ? 'text-leaf-dark' : 'text-gray-400'}`}>
          {isOn === null ? 'ไม่ทราบสถานะ' : onActive ? 'กำลังทำงาน' : 'ปิดอยู่'}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={locked || sending}
          onClick={() => send('on')}
          className="flex-1 rounded-lg bg-leaf px-3 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-30"
        >
          เปิด
        </button>
        <button
          type="button"
          disabled={locked || sending}
          onClick={() => send('off')}
          className="flex-1 rounded-lg bg-gray-400 px-3 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-30"
        >
          ปิด
        </button>
      </div>

      {!locked && predictedBlock && status.kind === 'idle' && (
        <p className="text-xs text-gold">⚠ {predictedBlock}</p>
      )}
      {status.kind === 'sending' && <p className="text-xs text-gray-500">กำลังส่งคำสั่ง…</p>}
      {status.kind === 'success' && <p className="text-xs text-leaf-dark">{status.message ?? 'สำเร็จ'}</p>}
      {status.kind === 'rejected' && <p className="text-xs font-semibold text-danger">ถูกปฏิเสธ: {status.reason}</p>}
      {status.kind === 'error' && <p className="text-xs font-semibold text-danger">ล้มเหลว: {status.message}</p>}
    </div>
  );
}
