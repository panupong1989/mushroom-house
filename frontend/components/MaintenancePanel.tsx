'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from './Card';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { useBedScan, useNow } from '@/lib/hooks';
import {
  assignSensorRom,
  countReadings,
  fetchMappingSensors,
  purgeReadingsAll,
  purgeReadingsBefore,
  resetSensorRom,
} from '@/lib/api';
import { BED_POSITIONS, duplicatePositions, pendingChanges, positionLabel, shortRom } from '@/lib/maintenance';
import { endOfDayMs } from '@/lib/history';
import type { DerivedTelemetry } from '@/lib/derive';
import type { FsmMode, MappingSensor } from '@/lib/types';

const FRESH_MS = 15_000; // live scan เก่ากว่านี้ = เตือน (ESP32 push ทุก ~3 วิ)
const MODE_LABEL: Record<string, string> = {
  BOOT: 'บูต', SELFTEST: 'เซลฟ์เทสต์', SPAWN_RUN: 'เดินเชื้อ', FRUITING: 'ออกดอก', MANUAL: 'มือ', SAFE_HOLD: 'เซฟโฮลด์',
};

type PendingDelete = {
  title: string;
  description: string;
  count: number | null;
  run: () => Promise<{ ok: boolean; count?: number; message?: string }>;
};

export function MaintenancePanel({
  houseId,
  telemetry,
  mode,
}: {
  houseId: string;
  telemetry: DerivedTelemetry;
  mode: FsmMode | null;
}) {
  const { rows: scan, loading: scanLoading } = useBedScan(houseId);
  const now = useNow();
  const [sensors, setSensors] = useState<MappingSensor[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const [beforeDate, setBeforeDate] = useState('');
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMappingSensors(houseId).then((rows) => {
      if (!cancelled) setSensors(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [houseId, reloadKey]);

  // rom → ตำแหน่งที่ผูกอยู่ตอนนี้ (จาก DB)
  const currentByRom = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of sensors) if (s.romId) m[s.romId] = s.address;
    return m;
  }, [sensors]);

  const selectedByRom = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of scan) m[s.romId] = draft[s.romId] ?? currentByRom[s.romId] ?? '';
    return m;
  }, [scan, draft, currentByRom]);

  const dups = useMemo(() => duplicatePositions(selectedByRom), [selectedByRom]);
  const changes = useMemo(() => pendingChanges(selectedByRom, currentByRom), [selectedByRom, currentByRom]);
  const mappedCount = sensors.filter((s) => s.romId).length;

  async function saveMapping() {
    setSaving(true);
    setStatus(null);
    let failed = 0;
    for (const { rom, address } of changes) {
      const res = await assignSensorRom(houseId, rom, address);
      if (!res.ok) failed++;
    }
    setSaving(false);
    setDraft({});
    setReloadKey((k) => k + 1);
    setStatus(
      failed === 0
        ? { kind: 'ok', msg: `บันทึกการจับคู่แล้ว ${changes.length} ตัว` }
        : { kind: 'err', msg: `บันทึกไม่สำเร็จ ${failed}/${changes.length} ตัว — ตรวจสอบว่ายัง login อยู่` }
    );
  }

  async function runDelete() {
    if (!pending) return;
    setDeleting(true);
    const res = await pending.run();
    setDeleting(false);
    setPending(null);
    if (res.ok) {
      setStatus({ kind: 'ok', msg: `ลบแล้ว ${res.count?.toLocaleString() ?? ''} แถว` });
      setReloadKey((k) => k + 1);
    } else {
      setStatus({ kind: 'err', msg: res.message ?? 'ลบไม่สำเร็จ — ตรวจสอบว่ายัง login อยู่' });
    }
  }

  // เปิด dialog ลบ readings (all/before) — นับจำนวนก่อน แล้วอัปเดต count ใน dialog
  async function openPurge(kind: 'all' | 'before') {
    if (kind === 'before' && !beforeDate) {
      setStatus({ kind: 'err', msg: 'เลือกวันก่อนกดลบข้อมูลก่อนวันที่' });
      return;
    }
    const beforeIso = kind === 'before' ? new Date(endOfDayMs(beforeDate)).toISOString() : undefined;
    setPending({
      title: kind === 'all' ? 'ลบข้อมูลกราฟทั้งหมด' : `ลบข้อมูลก่อน ${beforeDate}`,
      description:
        kind === 'all'
          ? 'ลบ sensor_readings + rollup รายชั่วโมงทั้งหมดของโรงนี้'
          : `ลบ readings + rollup ที่เก่ากว่า ${beforeDate} 23:59`,
      count: null,
      run: () => (kind === 'all' ? purgeReadingsAll(houseId) : purgeReadingsBefore(houseId, beforeIso as string)),
    });
    const n = await countReadings(houseId, beforeIso);
    setPending((p) => (p ? { ...p, count: n } : p));
  }

  function openResetRom() {
    setPending({
      title: 'ลบ mapping เซนเซอร์',
      description: 'รีเซ็ต rom_id ทุกตัว + ล้าง live scan — ต้องจับคู่ใหม่ทั้งหมด',
      count: mappedCount,
      run: () => resetSensorRom(houseId),
    });
  }

  const rs485Count = telemetry.air.filter((p) => p.temp != null).length;

  return (
    <div className="flex flex-col gap-4">
      {/* ---- ส่วนที่ 3: สถานะเซนเซอร์ (ดูตอนติดตั้ง) ---- */}
      <Card title="🔧 สถานะเซนเซอร์ (ตอนติดตั้ง)">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="DS18B20 เจอ" value={scanLoading ? '…' : `${scan.length}`} unit="ตัว" />
          <Stat label="RS485 ตอบ" value={`${rs485Count}`} unit="ตัว" />
          <Stat label="ระดับน้ำ" value={telemetry.waterOk == null ? '–' : telemetry.waterOk ? 'ปกติ' : 'ต่ำ'} />
          <Stat label="โหมด" value={mode ? MODE_LABEL[mode] ?? mode : '–'} />
        </div>
        {!telemetry.online && (
          <p className="mt-2 text-[11px] text-warn">⚠️ ESP32 ออฟไลน์ (ไม่มีข้อมูลใหม่) — ค่าอาจไม่อัปเดต</p>
        )}
      </Card>

      {/* ---- ส่วนที่ 1: จับคู่ ROM ↔ ตำแหน่ง (live) ---- */}
      <Card title="🌡️ จับคู่เซนเซอร์กับตำแหน่ง (live)">
        <p className="mb-2 text-[11px] text-gray-400">
          กำเซนเซอร์ด้วยมือ → ดูว่า ROM ไหนอุณหภูมิพุ่ง = ตัวนั้น → เลือกตำแหน่ง แล้วกดบันทึก · จับคู่แล้ว {mappedCount}/{BED_POSITIONS.length}
        </p>

        {scanLoading ? (
          <p className="py-4 text-center text-xs text-gray-400">กำลังโหลด live scan…</p>
        ) : scan.length === 0 ? (
          <p className="rounded-xl2 bg-bg p-3 text-center text-xs text-gray-400">
            ยังไม่เจอ ROM — ต้อง flash firmware ตัวที่ push scan ขึ้น Supabase ก่อน (PR firmware) แล้ว ESP32 ต้องออนไลน์
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {scan.map((row) => {
              const sel = selectedByRom[row.romId] ?? '';
              const ageMs = now && row.updatedAt ? now - new Date(row.updatedAt).getTime() : 0;
              const stale = ageMs > FRESH_MS;
              const dup = sel !== '' && dups.includes(sel);
              return (
                <div
                  key={row.romId}
                  className="flex flex-wrap items-center gap-2 rounded-xl2 bg-bg px-2.5 py-2 text-sm"
                >
                  <span className="font-mono text-xs text-gray-500" title={row.romId}>
                    {shortRom(row.romId)}
                  </span>
                  <span className={`flex items-center gap-1 ${stale ? 'text-warn' : 'text-gray-700'}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${stale ? 'bg-warn' : 'bg-leaf'}`} />
                    <span className="font-semibold">{row.tempC == null ? '–' : `${row.tempC.toFixed(1)}°`}</span>
                  </span>
                  <select
                    value={sel}
                    onChange={(e) => setDraft((d) => ({ ...d, [row.romId]: e.target.value }))}
                    className={`ml-auto rounded-xl2 border px-2 py-1 text-xs ${dup ? 'border-danger text-danger' : 'border-gray-200 text-gray-700'}`}
                    aria-label={`ตำแหน่งของ ${row.romId}`}
                  >
                    <option value="">ว่าง</option>
                    {BED_POSITIONS.map((p) => (
                      <option key={p.address} value={p.address}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <span className="w-16 text-right text-[10px]">
                    {sel === '' ? (
                      <span className="text-gray-400">ยังไม่จับคู่</span>
                    ) : (
                      <span className="text-leaf-dark">✓ {positionLabel(sel)}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs">
            {status ? (
              <span className={status.kind === 'ok' ? 'text-green-600' : 'text-danger'}>{status.msg}</span>
            ) : dups.length > 0 ? (
              <span className="text-danger">มีตำแหน่งซ้ำ — แก้ก่อนบันทึก</span>
            ) : changes.length > 0 ? (
              <span className="text-gray-400">แก้ไป {changes.length} ตัว</span>
            ) : (
              <span className="text-gray-400">ยังไม่มีการแก้</span>
            )}
          </span>
          <button
            onClick={saveMapping}
            disabled={saving || dups.length > 0 || changes.length === 0}
            className="rounded-xl2 bg-gray-800 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึกการจับคู่'}
          </button>
        </div>
      </Card>

      {/* ---- ส่วนที่ 2: เคลียร์ข้อมูล (DESTRUCTIVE) ---- */}
      <Card title="🗑️ เคลียร์ข้อมูล (ลบถาวร)">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => openPurge('all')}
            className="rounded-xl2 border border-danger/40 bg-danger/5 px-3 py-2 text-left text-sm font-medium text-danger"
          >
            ลบข้อมูลกราฟทั้งหมด <span className="text-[11px] font-normal">(sensor_readings + rollup)</span>
          </button>

          <div className="flex flex-wrap items-center gap-2 rounded-xl2 border border-danger/40 bg-danger/5 px-3 py-2">
            <span className="text-sm font-medium text-danger">ลบเฉพาะข้อมูลก่อนวันที่</span>
            <input
              type="date"
              value={beforeDate}
              max={now ? new Date(now).toISOString().slice(0, 10) : undefined}
              onChange={(e) => setBeforeDate(e.target.value)}
              className="rounded-xl2 border border-gray-200 bg-card px-2 py-1 text-xs text-gray-700"
              aria-label="เลือกวันที่จะลบก่อนหน้า"
            />
            <button
              onClick={() => openPurge('before')}
              disabled={!beforeDate}
              className="ml-auto rounded-xl2 bg-danger px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
            >
              ลบ
            </button>
          </div>

          <button
            onClick={openResetRom}
            className="rounded-xl2 border border-danger/40 bg-danger/5 px-3 py-2 text-left text-sm font-medium text-danger"
          >
            ลบ mapping เซนเซอร์ <span className="text-[11px] font-normal">(รีเซ็ต rom_id ทั้งหมด)</span>
          </button>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          ทุกปุ่มต้องยืนยันด้วยการพิมพ์ &ldquo;ลบ&rdquo; · ลบผ่าน RPC ที่ต้อง login เท่านั้น (anon ลบไม่ได้)
        </p>
      </Card>

      <ConfirmDeleteDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        description={pending?.description ?? ''}
        count={pending?.count ?? null}
        busy={deleting}
        onConfirm={runDelete}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl2 bg-bg p-2 text-center">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-700">
        {value}
        {unit && <span className="ml-0.5 text-[11px] font-normal text-gray-400">{unit}</span>}
      </p>
    </div>
  );
}
