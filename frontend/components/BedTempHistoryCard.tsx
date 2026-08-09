'use client';

import { useState } from 'react';
import { Card } from './Card';
import { RangeControls } from './RangeControls';
import { MultiLineChart, type ChartSeries } from './MultiLineChart';
import { useChartHeight, useNow, useSensorHistory, useSensorMeta } from '@/lib/hooks';
import { RANGE_META, endOfDayMs, seriesToPoints, type RangeKey } from '@/lib/history';
import { TIER_LABELS } from '@/lib/maintenance';
import { MOCK_SENSOR_META, buildDemoSensorSeries } from '@/lib/mock';

// สีต่อจุด — เดิมใช้เฉดใกล้กันในแถวเดียวกัน (ส้ม 3 เฉด) แยกเส้นไม่ออกเวลาค่าใกล้กัน
// เปลี่ยนเป็น "คนละสีชัดๆ" ต่อจุด แต่ยังจับกลุ่มได้: แถว 1 = โทนอุ่น, แถว 2 = โทนเย็น
const ROW_COLORS: Record<number, [string, string, string]> = {
  1: ['#e11d48', '#f59e0b', '#65a30d'], // บน=แดงชมพู · กลาง=เหลืองอำพัน · ล่าง=เขียวมะนาว
  2: ['#2563eb', '#9333ea', '#0d9488'], // บน=น้ำเงิน · กลาง=ม่วง · ล่าง=เขียวน้ำทะเล
};
const TIER_ORDER = ['top', 'mid', 'bottom'];

// ชุดที่ 1 — อุณหภูมิในกอง เส้นละจุด (เฉพาะจุดที่จับคู่โพรบไว้จริง — useSensorMeta กรองให้แล้ว)
export function BedTempHistoryCard({ houseId, demoMode = false }: { houseId: string; demoMode?: boolean }) {
  const [range, setRange] = useState<RangeKey>('24h');
  const [dateStr, setDateStr] = useState('');
  const now = useNow();
  const chartHeight = useChartHeight(); // เดสก์ท็อปสูง ~58vh, มือถือ 150px

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

  const bedMeta = meta
    .filter((m) => m.rowNo != null && m.tier != null)
    .sort((a, b) => (a.rowNo! - b.rowNo!) || (TIER_ORDER.indexOf(a.tier!) - TIER_ORDER.indexOf(b.tier!)));

  const series: ChartSeries[] = bedMeta
    .map((m) => ({
      key: `${m.rowNo}-${m.tier}`,
      label: `แถว ${m.rowNo} · ${TIER_LABELS[m.tier!] ?? m.tier}`,
      color: ROW_COLORS[m.rowNo as number]?.[TIER_ORDER.indexOf(m.tier!)] ?? '#9ca3af',
      points: seriesToPoints(rows, m.id, 'temp', 'max'),
    }));

  return (
    <Card title={`🌾 อุณหภูมิในกอง (${bedMeta.length} จุด)`}>
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
        <div className="flex items-center justify-center text-xs text-gray-400" style={{ height: chartHeight }}>
          กำลังโหลด…
        </div>
      ) : error ? (
        <div className="rounded-xl2 bg-danger/10 p-3 text-xs text-danger">โหลดกราฟไม่สำเร็จ</div>
      ) : (
        <MultiLineChart
          series={series}
          domainMin={domainMin}
          domainMax={domainMax}
          primaryUnit="°C"
          primaryDigits={1}
          height={chartHeight}
        />
      )}
    </Card>
  );
}
