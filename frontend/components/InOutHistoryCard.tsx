'use client';

import { useState } from 'react';
import { Card } from './Card';
import { RangeControls } from './RangeControls';
import { MultiLineChart, type ChartSeries } from './MultiLineChart';
import { useNow, useSensorHistory, useSensorMeta } from '@/lib/hooks';
import { RANGE_META, endOfDayMs, seriesToPoints, type RangeKey } from '@/lib/history';
import { LOCATION_LABELS } from '@/lib/constants';

// อุณหภูมิในโรง (หัว/ท้าย) = เส้นทึบสีแดง 2 เฉด, ความชื้นในโรง (หัว/ท้าย) = เส้นประสีฟ้า 2 เฉด,
// อุณหภูมินอกโรง = เส้นประสีเทา 1 เส้น (ดู issue #34)
const IN_TEMP_COLOR: Record<string, string> = { head: '#ef4444', tail: '#b91c1c' };
const IN_RH_COLOR: Record<string, string> = { head: '#0ea5e9', tail: '#0369a1' };
const OUTSIDE_COLOR = '#9ca3af';
const LOC_ORDER = ['head', 'mid', 'tail'];

// ชุดที่ 2 — ในโรง (อุณหภูมิ+ความชื้น หัว/ท้าย) + นอกโรง (อุณหภูมิ)
export function InOutHistoryCard({ houseId }: { houseId: string }) {
  const [range, setRange] = useState<RangeKey>('24h');
  const [dateStr, setDateStr] = useState('');
  const now = useNow();

  const endMs = dateStr ? endOfDayMs(dateStr) : null;
  const domainMax = endMs ?? now;
  const domainMin = domainMax - RANGE_META[range].spanMs;

  const airMeta = useSensorMeta(houseId, 'air_th');
  const outsideMeta = useSensorMeta(houseId, 'outside_temp');
  const air = useSensorHistory(houseId, 'air_th', range, endMs);
  const outside = useSensorHistory(houseId, 'outside_temp', range, endMs);

  const loading = now === 0 || air.loading || outside.loading;
  const error = air.error || outside.error;

  const sortedAir = [...airMeta].sort(
    (a, b) => LOC_ORDER.indexOf(a.location ?? '') - LOC_ORDER.indexOf(b.location ?? '')
  );

  const series: ChartSeries[] = [
    ...sortedAir.map((m) => ({
      key: `temp-${m.id}`,
      label: `ในโรง${LOCATION_LABELS[m.location ?? ''] ?? m.location} · อุณหภูมิ`,
      color: IN_TEMP_COLOR[m.location ?? ''] ?? '#ef4444',
      axis: 'primary' as const,
      points: seriesToPoints(air.rows, m.id, 'temp', 'max'),
    })),
    ...sortedAir.map((m) => ({
      key: `rh-${m.id}`,
      label: `ในโรง${LOCATION_LABELS[m.location ?? ''] ?? m.location} · ความชื้น`,
      color: IN_RH_COLOR[m.location ?? ''] ?? '#0ea5e9',
      dashed: true,
      axis: 'secondary' as const,
      points: seriesToPoints(air.rows, m.id, 'rh', 'avg'),
    })),
    ...outsideMeta.map((m) => ({
      key: `outside-${m.id}`,
      label: 'นอกโรง · อุณหภูมิ',
      color: OUTSIDE_COLOR,
      dashed: true,
      axis: 'primary' as const,
      points: seriesToPoints(outside.rows, m.id, 'temp', 'max'),
    })),
  ];

  return (
    <Card title="🏠 ในโรง + นอกโรง">
      <RangeControls
        range={range}
        onRangeChange={setRange}
        dateStr={dateStr}
        onDateChange={setDateStr}
        todayStr={now ? new Date(now).toISOString().slice(0, 10) : undefined}
      />
      {loading ? (
        <div className="flex h-[150px] items-center justify-center text-xs text-gray-400">กำลังโหลด…</div>
      ) : error ? (
        <div className="rounded-xl2 bg-danger/10 p-3 text-xs text-danger">โหลดกราฟไม่สำเร็จ</div>
      ) : (
        <MultiLineChart
          series={series}
          domainMin={domainMin}
          domainMax={domainMax}
          primaryUnit="°C"
          primaryDigits={1}
          secondaryUnit="%"
          secondaryDigits={0}
        />
      )}
    </Card>
  );
}
