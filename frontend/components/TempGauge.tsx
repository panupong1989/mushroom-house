import { GAUGE_MAX, GAUGE_MIN } from '@/lib/constants';

interface TempGaugeProps {
  value: number | null;
  goldMin: number;
  goldMax: number;
  coldLimit: number;
  dangerHot: number;
}

const CX = 100;
const CY = 100;
const R_OUTER = 82;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// สูตรมาตรฐาน gauge ครึ่งวงกลม: angle 0deg = บนสุด(12 นาฬิกา), -90=ซ้าย, 90=ขวา
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function valueToAngle(value: number, min: number, max: number) {
  const t = clamp((value - min) / (max - min), 0, 1);
  return -90 + t * 180;
}

function zoneColor(value: number, goldMin: number, goldMax: number, coldLimit: number, dangerHot: number) {
  if (value < coldLimit) return '#3B82C4'; // หนาว
  if (value >= dangerHot) return '#E4573B'; // อันตราย (danger)
  if (value >= goldMin && value <= goldMax) return '#2FA96A'; // โซนทอง = leaf green (สบายที่สุด)
  return '#E3A73A'; // gold — ใกล้โซนทองแต่ยังไม่เข้า / เลยไปทางร้อน
}

export function TempGauge({ value, goldMin, goldMax, coldLimit, dangerHot }: TempGaugeProps) {
  const min = GAUGE_MIN;
  const max = GAUGE_MAX;
  const trackPath = describeArc(CX, CY, R_OUTER, -90, 90);
  const goldStart = valueToAngle(goldMin, min, max);
  const goldEnd = valueToAngle(goldMax, min, max);
  const goldBandPath = describeArc(CX, CY, R_OUTER, goldStart, goldEnd);

  const hasValue = value !== null && !Number.isNaN(value);
  const valueAngle = hasValue ? valueToAngle(value as number, min, max) : -90;
  const progressPath = describeArc(CX, CY, R_OUTER, -90, valueAngle);
  const color = hasValue ? zoneColor(value as number, goldMin, goldMax, coldLimit, dangerHot) : '#9CA3AF';

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 118" className="w-full max-w-[280px]">
        <path d={trackPath} fill="none" stroke="#E7EEE6" strokeWidth={14} strokeLinecap="round" />
        <path d={goldBandPath} fill="none" stroke="#E3A73A" strokeOpacity={0.35} strokeWidth={14} strokeLinecap="round" />
        {hasValue && (
          <path d={progressPath} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />
        )}
        <text x={CX} y={92} textAnchor="middle" className="fill-gray-800" style={{ fontSize: 34, fontWeight: 700 }}>
          {hasValue ? (value as number).toFixed(1) : '—'}
        </text>
        <text x={CX} y={110} textAnchor="middle" className="fill-gray-500" style={{ fontSize: 12 }}>
          °C · โซนทอง {goldMin}-{goldMax}°
        </text>
      </svg>
      <p className="mt-1 text-xs text-gray-500">ค่าที่ใช้คุม = สูงสุดจาก 3 จุด (หัว/กลาง/ท้าย)</p>
    </div>
  );
}
