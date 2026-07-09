import { seriesBounds, type Point } from '@/lib/history';
import { fmtNum } from '@/lib/format';

// กราฟเส้นแบบ inline SVG (ไม่พึ่ง library) — responsive ด้วย viewBox + non-scaling-stroke
const W = 320;
const H = 110;
const PAD_T = 8;
const PAD_B = 16;

function fmtTime(ms: number, span: number): string {
  const d = new Date(ms);
  if (span <= 36 * 60 * 60 * 1000) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function HistoryChart({
  points,
  domainMin,
  domainMax,
  color,
  unit,
  digits = 1,
}: {
  points: Point[];
  domainMin: number;
  domainMax: number;
  color: string;
  unit: string;
  digits?: number;
}) {
  const bounds = seriesBounds(points, unit === '%' ? 2 : 0.5);
  if (!bounds || points.length < 2) {
    return (
      <div className="flex h-[110px] items-center justify-center rounded-xl2 bg-bg text-xs text-gray-400">
        ยังไม่มีข้อมูลพอสำหรับกราฟช่วงนี้
      </div>
    );
  }

  const span = Math.max(1, domainMax - domainMin);
  const yspan = Math.max(0.001, bounds.max - bounds.min);
  const x = (t: number) => ((t - domainMin) / span) * W;
  const y = (v: number) => PAD_T + (1 - (v - bounds.min) / yspan) * (H - PAD_T - PAD_B);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points[points.length - 1].t).toFixed(1)},${H - PAD_B} L${x(points[0].t).toFixed(1)},${H - PAD_B} Z`;
  const last = points[points.length - 1];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img">
        <path d={area} fill={color} opacity={0.12} />
        <path d={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke"
          strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last.t)} cy={y(last.v)} r={2.5} fill={color} />
      </svg>
      {/* แกน y (min/max) + ค่าล่าสุด + แกนเวลา (ซ้าย/ขวา) ซ้อนทับ SVG */}
      <span className="pointer-events-none absolute right-1 top-0 text-[10px] font-medium text-gray-500">
        {fmtNum(bounds.max, digits)}{unit}
      </span>
      <span className="pointer-events-none absolute bottom-4 right-1 text-[10px] font-medium text-gray-400">
        {fmtNum(bounds.min, digits)}{unit}
      </span>
      <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 rounded bg-white/70 px-1 text-[11px] font-bold"
        style={{ color }}>
        {fmtNum(last.v, digits)}{unit}
      </span>
      <span className="pointer-events-none absolute bottom-0 left-1 text-[10px] text-gray-400">{fmtTime(domainMin, span)}</span>
      <span className="pointer-events-none absolute bottom-0 right-1 text-[10px] text-gray-400">{fmtTime(domainMax, span)}</span>
    </div>
  );
}
