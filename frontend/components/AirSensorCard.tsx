'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from './Card';
import { fetchAirSensors, setAirDisplay } from '@/lib/api';
import { AIR_POSITIONS, airPositionLabel, duplicateAirPositions } from '@/lib/maintenance';
import { fmtNum } from '@/lib/format';
import type { DerivedTelemetry } from '@/lib/derive';
import type { AirSensor } from '@/lib/types';

interface Draft {
  position: string; // '' = ยังไม่ระบุ
  enabled: boolean;
}

// จับคู่เซนเซอร์อากาศ RS485 (อุณหภูมิ+ความชื้น) กับตำแหน่งในโรง
// - address = modbus addr ที่ตั้งไว้ที่ตัวเซนเซอร์ (คีย์ฮาร์ดแวร์ ไม่เปลี่ยน) — โชว์อย่างเดียว
// - ตำแหน่ง + "ใช้งาน" แก้ได้ เขียนลง ui_position/enabled ผ่าน RPC set_air_display
//   (ไม่แตะ sensors.location ที่เฟิร์มแวร์ใช้ routing — แก้แล้วค่าจะเข้าผิดตัว ดู migration 011)
export function AirSensorCard({ houseId, telemetry }: { houseId: string; telemetry: DerivedTelemetry }) {
  const [rows, setRows] = useState<AirSensor[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAirSensors(houseId).then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, [houseId, reloadKey]);

  // ค่าล่าสุดต่อ sensor_id (จาก telemetry) — ให้เห็นว่าตัวไหนกำลังตอบอยู่จริง
  const liveById = useMemo(() => {
    const m = new Map<number, { temp: number | null; rh: number | null }>();
    for (const p of telemetry.air) if (p.sensorId != null) m.set(p.sensorId, { temp: p.temp, rh: p.rh });
    return m;
  }, [telemetry.air]);

  const current = (s: AirSensor): Draft => ({ position: s.uiPosition ?? s.location ?? '', enabled: s.enabled });
  const selected = (s: AirSensor): Draft => draft[s.address] ?? current(s);

  const dups = useMemo(() => duplicateAirPositions(rows.map(selected)), [rows, draft]);
  const changes = rows.filter((s) => {
    const a = current(s);
    const b = selected(s);
    return a.position !== b.position || a.enabled !== b.enabled;
  });

  async function save() {
    setSaving(true);
    setStatus(null);
    let failed = 0;
    let lastMsg = '';
    for (const s of changes) {
      const d = selected(s);
      const res = await setAirDisplay(houseId, s.address, d.position, d.enabled);
      if (!res.ok) {
        failed++;
        lastMsg = res.message ?? '';
      }
    }
    setSaving(false);
    setDraft({});
    setReloadKey((k) => k + 1);
    setStatus(
      failed === 0
        ? { kind: 'ok', msg: `บันทึกแล้ว ${changes.length} ตัว` }
        : {
            kind: 'err',
            msg: `บันทึกไม่สำเร็จ ${failed} ตัว — ${lastMsg || 'ตรวจสอบว่ายัง login อยู่ (หรือยังไม่ได้รัน migration 011)'}`,
          }
    );
  }

  return (
    <Card title="💧 จับคู่เซนเซอร์ความชื้น (RS485)">
      <p className="mb-2 text-[11px] text-gray-400">
        เลือกว่าเซนเซอร์แต่ละตัว (ตาม address ที่ตั้งไว้ที่ตัวเครื่อง) อยู่ตำแหน่งไหน · เอาเครื่องหมาย
        <b> ใช้งาน</b> ออกสำหรับตัวที่ไม่ได้ติดตั้ง — จะไม่ขึ้นหน้าแรก
      </p>

      {rows.length === 0 ? (
        <p className="rounded-xl2 bg-bg p-3 text-center text-xs text-gray-400">ยังไม่มีข้อมูลเซนเซอร์อากาศ</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((s) => {
            const d = selected(s);
            const live = liveById.get(s.id);
            const responding = live?.temp != null;
            const dup = d.enabled && d.position !== '' && dups.includes(d.position);
            return (
              <div
                key={s.address}
                className={`flex flex-wrap items-center gap-2 rounded-xl2 bg-bg px-2.5 py-2 text-sm ${d.enabled ? '' : 'opacity-50'}`}
              >
                <span className="font-mono text-xs text-gray-500">addr {s.address}</span>
                <span className={`flex items-center gap-1 ${responding ? 'text-gray-700' : 'text-gray-400'}`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${responding ? 'bg-leaf' : 'bg-gray-300'}`} />
                  <span className="font-semibold">{responding ? `${fmtNum(live?.temp ?? null)}°` : 'ไม่ตอบ'}</span>
                  {responding && <span className="text-xs text-sky-600">{fmtNum(live?.rh ?? null)}%RH</span>}
                </span>

                <label className="ml-auto flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={d.enabled}
                    onChange={(e) => setDraft((x) => ({ ...x, [s.address]: { ...d, enabled: e.target.checked } }))}
                    aria-label={`ใช้งานเซนเซอร์ addr ${s.address}`}
                  />
                  ใช้งาน
                </label>

                <select
                  value={d.position}
                  disabled={!d.enabled}
                  onChange={(e) => setDraft((x) => ({ ...x, [s.address]: { ...d, position: e.target.value } }))}
                  className={`rounded-xl2 border px-2 py-1 text-xs disabled:opacity-40 ${dup ? 'border-danger text-danger' : 'border-gray-200 text-gray-700'}`}
                  aria-label={`ตำแหน่งของเซนเซอร์อากาศ addr ${s.address}`}
                >
                  <option value="">ยังไม่ระบุ</option>
                  {AIR_POSITIONS.map((p) => (
                    <option key={p.address} value={p.address}>
                      {p.label}
                    </option>
                  ))}
                </select>

                <span className="w-16 text-right text-[10px]">
                  {!d.enabled ? (
                    <span className="text-gray-400">— ไม่ใช้</span>
                  ) : d.position === '' ? (
                    <span className="text-gray-400">ยังไม่ระบุ</span>
                  ) : (
                    <span className="text-leaf-dark">✓ {airPositionLabel(d.position)}</span>
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
          onClick={save}
          disabled={saving || dups.length > 0 || changes.length === 0}
          className="rounded-xl2 bg-gray-800 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </Card>
  );
}
