'use client';

import { useState } from 'react';
import { Card } from './Card';
import { RangeControls } from './RangeControls';
import { MultiLineChart, type ChartSeries } from './MultiLineChart';
import { useNow, useSensorHistory, useSensorMeta } from '@/lib/hooks';
import { RANGE_META, endOfDayMs, seriesToPoints, type RangeKey } from '@/lib/history';
import { MOCK_SENSOR_META, buildDemoSensorSeries } from '@/lib/mock';

// สีตามแถว (row_no) แยกให้ดูออกว่าแถวไหน — แถว 1 = โทนส้ม/อำพัน, แถว 2 = โทนฟ้า/น้ำเงิน
// ความเข้ม (shade) ต่างกันตามตำแหน่งในแถว (หัว/กลาง/ท้าย)
const ROW_COLORS: Record<number, [string, string, string]> = {
  1: ['#f59e0b', '#f97316', '#ea580c'],
  2: ['#0ea5e9', '#0284c7', '#0369a1'],
};
const TIER_ORDER = ['top', 'mid', 'bottom'];
const TIER_LABEL: Record<string, string> = { top: 'หัว', mid: 'กลาง', bottom: 'ท้าย' };

// ชุดที่ 1 — อุณหภูมิในกอง 6 เส้น (2 แถว x หัว/กลาง/ท้าย)
export function BedTempHistoryCard({ houseId, demoMode = false }: { houseId: string; demoMode?: boolean }) {
  const [range, setRange] = useState<RangeKey>('24h');
  const [dateStr, setDateStr] = useState('');
  const now = useNow();

  // เลือกวัน = แสดงทั้งวันนั้น 00:00–23:59 เสมอ ไม่ผูกกับ span ของปุ่มช่วงที่เคยเลือกไว้ (ดู issue #38)
  const effRange: RangeKey = dateStr ? '24h' : range;
  const endMs = dateStr ? endOfDayMs(dateStr) : null;
  const domainMax = endMs ?? now;
  const domainMin = domainMax - RANGE_META[effRange].spanMs;

  const liveMeta = useSensorMeta(houseId, 'bed_temp');
  const live = useSensorHistory(houseId, 'bed_temp', effRange, endMs);

  // โหมดตัวอย่าง: ใช้ meta/ข้อมูลจำลองในหน่วยความจำแทน ไม่แตะ hook fetch จริงด้านบน (ยังทำงานเบื้องหลัง)
  const meta = demoMode ? MOCK_SENSOR_META.filter((m) => m.kind === 'bed_temp') : liveMeta;
  const rows = demoMode ? buildDemoSensorSeries('bed_temp', domainMin, domainMax) : live.rows;
  const loading = demoMode ? false : live.loading;
  const error = demoMode ? false : live.error;

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
        domainMin={domainMin}
        domainMax={domainMax}
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
