'use client';

import { useEffect, useState } from 'react';
import { Card } from './Card';
import { HistoryChart } from './HistoryChart';
import { fetchAirHistory } from '@/lib/api';
import { RANGE_MS, type AirHistory, type HistoryRange } from '@/lib/history';

const RANGES: { key: HistoryRange; label: string }[] = [
  { key: '24h', label: '24 ชม.' },
  { key: '7d', label: '7 วัน' },
];

export function HistorySection({ houseId }: { houseId: string }) {
  const [range, setRange] = useState<HistoryRange>('24h');
  const [data, setData] = useState<AirHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const t = Date.now();
    fetchAirHistory(houseId, range)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setNow(t);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [houseId, range]);

  const since = now - RANGE_MS[range];

  return (
    <Card title="📈 ย้อนหลัง (อากาศ)">
      <div className="mb-3 flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-xl2 px-3 py-1 text-xs font-medium ${
              range === r.key ? 'bg-gray-800 text-white' : 'bg-bg text-gray-500'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-[110px] items-center justify-center text-xs text-gray-400">กำลังโหลด…</div>
      ) : error ? (
        <div className="rounded-xl2 bg-danger/10 p-3 text-xs text-danger">โหลดกราฟย้อนหลังไม่สำเร็จ</div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1 text-[11px] font-medium text-gray-400">อุณหภูมิใช้คุม (สูงสุด) °C</p>
            <HistoryChart points={data?.temp ?? []} domainMin={since} domainMax={now} color="#ef4444" unit="°" digits={1} />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-gray-400">ความชื้นเฉลี่ย %</p>
            <HistoryChart points={data?.rh ?? []} domainMin={since} domainMax={now} color="#0ea5e9" unit="%" digits={0} />
          </div>
        </div>
      )}
    </Card>
  );
}
