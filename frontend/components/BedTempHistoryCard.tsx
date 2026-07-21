'use client';

import { useState } from 'react';
import { Card } from './Card';
import { RangeControls } from './RangeControls';
import { MultiLineChart, type ChartSeries } from './MultiLineChart';
import { useNow, useSensorHistory, useSensorMeta } from '@/lib/hooks';
import { RANGE_META, endOfDayMs, seriesToPoints, type RangeKey } from '@/lib/history';

// สีตามแถว (row_no) แยกให้ดูออกว่าแถวไหน — แถว 1 = โทนส้ม/อำพัน, แถว 2 = โทนฟ้า/น้ำเงิน
// ความเข้ม (shade) ต่างกันตามตำแหน่งในแถว (หัว/กลาง/ท้าย)
const ROW_COLORS: Record<number, [string, string, string]> = {
  1: ['#f59e0b', '#f97316', '#ea580c'],
  2: ['#0ea5e9', '#0284c7', '#0369a1'],
};
const TIER_ORDER = ['top', 'mid', 'bottom'];
const TIER_LABEL: Record<string, string> = { top: 'หัว', mid: 'กลาง', bottom: 'ท้าย' };

// ชุดที่ 1 — อุณหภูมิในกอง 6 เส้น (2 แถว x หัว/กลาง/ท้าย)
export function BedTempHistoryCard({ houseId }: { houseId: string }) {
  const [range, setRange] = useState<RangeKey>('24h');
  const [dateStr, setDateStr] = useState('');
  const now = useNow();

  const endMs = dateStr ? endOfDayMs(dateStr) : null;
  const domainMax = endMs ?? now;
  const domainMin = domainMax - RANGE_META[range].spanMs;

  const meta = useSensorMeta(houseId, 'bed_temp');
  const { rows, loading, error } = useSensorHistory(houseId, 'bed_temp', range, endMs);

  const series: ChartSeries[] = meta
    .filter((m) => m.rowNo != null && m.tier != null)
    .sort((a, b) => (a.rowNo! - b.rowNo!) || (TIER_ORDER.indexOf(a.tier!) - TIER_ORDER.indexOf(b.tier!)))
    .map((m) => ({
      key: `${m.rowNo}-${m.tier}`,
      label: `แถว ${m.rowNo} · ${TIER_LABEL[m.tier!] ?? m.tier}`,
      color: ROW_COLORS[m.rowNo as number]?.[TIER_ORDER.indexOf(m.tier!)] ?? '#9ca3af',
      points: seriesToPoints(rows, m.id, 'temp', 'max'),
    }));

  return (
    <Card title="🌾 อุณหภูมิในกอง (6 จุด)">
      <RangeControls
        range={range}
        onRangeChange={setRange}
        dateStr={dateStr}
        onDateChange={setDateStr}
        todayStr={now ? new Date(now).toISOString().slice(0, 10) : undefined}
      />
      {now === 0 || loading ? (
        <div className="flex h-[150px] items-center justify-center text-xs text-gray-400">กำลังโหลด…</div>
      ) : error ? (
        <div className="rounded-xl2 bg-danger/10 p-3 text-xs text-danger">โหลดกราฟไม่สำเร็จ</div>
      ) : (
        <MultiLineChart series={series} domainMin={domainMin} domainMax={domainMax} primaryUnit="°C" primaryDigits={1} />
      )}
    </Card>
  );
}
