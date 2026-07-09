'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from './Card';
import { useConfig } from '@/lib/hooks';
import { updateConfig } from '@/lib/api';
import { validateSetpoints } from '@/lib/validateConfig';

// key ที่แก้ได้ + label/หน่วย — render เฉพาะ key ที่มีจริงใน profile ที่ active
// (เช่น bed_* อยู่ profile spawn_run, temp_fruit_* อยู่ fruiting)
const CONFIG_META: { key: string; label: string; unit: string; step: number }[] = [
  { key: 'temp_fruit_min', label: 'โซนทอง ล่าง', unit: '°C', step: 0.5 },
  { key: 'temp_fruit_max', label: 'โซนทอง บน', unit: '°C', step: 0.5 },
  { key: 'temp_floor', label: 'พื้นอันตราย (ต่ำกว่านี้ดอกตาย)', unit: '°C', step: 0.5 },
  { key: 'temp_heater_on', label: 'เปิดฮีทเตอร์เมื่อต่ำกว่า', unit: '°C', step: 0.5 },
  { key: 'temp_heater_off', label: 'ปิดฮีทเตอร์เมื่อถึง', unit: '°C', step: 0.5 },
  { key: 'temp_exhaust_on', label: 'เปิดพัดลมดูดเมื่อเกิน', unit: '°C', step: 0.5 },
  { key: 'temp_exhaust_off', label: 'ปิดพัดลมดูดเมื่อ', unit: '°C', step: 0.5 },
  { key: 'temp_danger_hot', label: 'ร้อนอันตราย', unit: '°C', step: 0.5 },
  { key: 'rh_min', label: 'ความชื้นต่ำสุด', unit: '%', step: 1 },
  { key: 'rh_max', label: 'ความชื้นสูงสุด', unit: '%', step: 1 },
  { key: 'rh_high', label: 'ความชื้นเกิน (ไล่ชื้น)', unit: '%', step: 1 },
  { key: 'bed_spawn_min', label: 'กองเดินเชื้อ ต่ำสุด', unit: '°C', step: 0.5 },
  { key: 'bed_spawn_max', label: 'กองเดินเชื้อ สูงสุด', unit: '°C', step: 0.5 },
  { key: 'bed_danger', label: 'กองร้อนอันตราย', unit: '°C', step: 0.5 },
];

export function SettingsPanel({ houseId }: { houseId: string }) {
  const config = useConfig(houseId);
  const [baseline, setBaseline] = useState<Record<string, number> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!config) return;
    setBaseline(config);
    setDraft(Object.fromEntries(Object.entries(config).map(([k, v]) => [k, String(v)])));
  }, [config]);

  const fields = useMemo(() => CONFIG_META.filter((m) => baseline && m.key in baseline), [baseline]);

  // merge ค่าเดิม (baseline) + ค่าที่กำลังแก้ (draft) เพื่อ validate cross-field ให้ครบ
  const merged = useMemo(() => {
    const m: Record<string, number> = { ...(baseline ?? {}) };
    for (const f of fields) m[f.key] = parseFloat(draft[f.key] ?? '');
    return m;
  }, [baseline, draft, fields]);

  const errByKey = useMemo(
    () => Object.fromEntries(validateSetpoints(merged).map((e) => [e.key, e.message])),
    [merged]
  );
  const hasError = Object.keys(errByKey).length > 0;

  const changed = useMemo(() => {
    const out: Record<string, number> = {};
    if (!baseline) return out;
    for (const f of fields) {
      const v = parseFloat(draft[f.key] ?? '');
      if (!Number.isNaN(v) && v !== baseline[f.key]) out[f.key] = v;
    }
    return out;
  }, [baseline, draft, fields]);
  const nChanged = Object.keys(changed).length;

  async function save() {
    setSaving(true);
    setStatus(null);
    const res = await updateConfig(houseId, changed);
    setSaving(false);
    if (res.ok) {
      setBaseline((b) => ({ ...(b ?? {}), ...changed })); // อัปเดต baseline = ค่าที่บันทึกแล้ว
      setStatus({ kind: 'ok', msg: `บันทึกแล้ว ${nChanged} ค่า` });
    } else {
      setStatus({ kind: 'err', msg: res.message ?? 'บันทึกไม่สำเร็จ' });
    }
  }

  if (!config || !baseline) {
    return (
      <Card title="⚙️ ตั้งค่า setpoint">
        <p className="text-xs text-gray-400">กำลังโหลด…</p>
      </Card>
    );
  }

  return (
    <Card title="⚙️ ตั้งค่า setpoint">
      <div className="flex flex-col gap-2">
        {fields.map((m) => {
          const err = errByKey[m.key];
          return (
            <div key={m.key}>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="text-gray-600">{m.label}</span>
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    step={m.step}
                    value={draft[m.key] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [m.key]: e.target.value }))}
                    className={`w-20 rounded-xl2 border px-2 py-1 text-right text-sm ${err ? 'border-danger' : 'border-gray-200'}`}
                  />
                  <span className="w-5 text-xs text-gray-400">{m.unit}</span>
                </span>
              </label>
              {err && <p className="mt-0.5 text-right text-[10px] text-danger">{err}</p>}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs">
          {status ? (
            <span className={status.kind === 'ok' ? 'text-green-600' : 'text-danger'}>{status.msg}</span>
          ) : hasError ? (
            <span className="text-danger">แก้ค่าที่ผิดก่อนบันทึก</span>
          ) : nChanged > 0 ? (
            <span className="text-gray-400">แก้ไป {nChanged} ค่า</span>
          ) : (
            <span className="text-gray-400">ยังไม่มีการแก้</span>
          )}
        </span>
        <button
          onClick={save}
          disabled={saving || hasError || nChanged === 0}
          className="rounded-xl2 bg-gray-800 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>

      <p className="mt-2 text-[11px] text-gray-400">
        setpoint คุมฮีทเตอร์/ปั๊ม/พัดลม — ESP32 ดึงไปใช้ (v1 firmware ยัง sync กลับไม่ครบ) · แก้ได้เฉพาะตอน login
      </p>
    </Card>
  );
}
