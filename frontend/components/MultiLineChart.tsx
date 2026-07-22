import { seriesBounds, type Point } from '@/lib/history';
import { fmtNum } from '@/lib/format';

// กราฟเส้นหลายชุดแบบ inline SVG (ไม่พึ่ง library) — responsive ด้วย viewBox
// รองรับ 2 แกน y (primary/secondary หน่วยต่างกัน เช่น °C กับ %) และเส้นประ (dashed)
const W = 320;
const H = 150;
const PAD_T = 10;
const PAD_B = 18;

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  axis?: 'primary' | 'secondary';
  points: Point[];
}

function fmtTime(ms: number, spanMs: number): string {
  const d = new Date(ms);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const ddmm = `${d.getDate()}/${d.getMonth() + 1}`;
  if (spanMs <= 36 * 60 * 60 * 1000) return hhmm; // <=36 ชม. โชว์เวลา
  if (spanMs <= 60 * 24 * 60 * 60 * 1000) return ddmm; // <=60 วัน โชว์วันที่/เดือน
  return `${ddmm}/${d.getFullYear() % 100}`; // ยาวกว่านั้น (เดือน/ปี) โชว์ปีด้วย
}

export function MultiLineChart({
  series,
  domainMin,
  domainMax,
  primaryUnit,
  primaryDigits = 1,
  secondaryUnit,
  secondaryDigits = 0,
  height = H,
}: {
  series: ChartSeries[];
  domainMin: number;
  domainMax: number;
  primaryUnit: string;
  primaryDigits?: number;
  secondaryUnit?: string;
  secondaryDigits?: number;
  height?: number;
}) {
  const primary = series.filter((s) => (s.axis ?? 'primary') === 'primary');
  const secondary = series.filter((s) => s.axis === 'secondary');
  const primaryBounds = seriesBounds(primary.flatMap((s) => s.points), primaryUnit === '%' ? 2 : 0.5);
  const secondaryBounds = seriesBounds(secondary.flatMap((s) => s.points), secondaryUnit === '%' ? 2 : 0.5);
  const hasData = series.some((s) => s.points.length >= 2);

  if (!hasData || !primaryBounds) {
    return (
      <div
        className="flex items-center justify-center rounded-xl2 bg-bg text-xs text-gray-400"
        style={{ height: Math.max(110, height - 40) }}
      >
        ยังไม่มีข้อมูล
      </div>
    );
  }

  const span = Math.max(1, domainMax - domainMin);
  const x = (t: number) => ((t - domainMin) / span) * W;
  const yFor = (bounds: { min: number; max: number }) => {
    const yspan = Math.max(0.001, bounds.max - bounds.min);
    return (v: number) => PAD_T + (1 - (v - bounds.min) / yspan) * (height - PAD_T - PAD_B);
  };
  const yPrimary = yFor(primaryBounds);
  const ySecondary = secondaryBounds ? yFor(secondaryBounds) : null;

  function pathFor(pts: Point[], y: (v: number) => number): string | null {
    if (pts.length < 2) return null;
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  }

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img">
          {series.map((s) => {
            const y = s.axis === 'secondary' && ySecondary ? ySecondary : yPrimary;
            const d = pathFor(s.points, y);
            if (!d) return null;
            return (
              <path
                key={s.key}
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.dashed ? '4 3' : undefined}
              />
            );
          })}
        </svg>
        <span className="pointer-events-none absolute left-1 top-0 text-[10px] font-medium text-gray-500 lg:text-xs">
          {fmtNum(primaryBounds.max, primaryDigits)}{primaryUnit}
        </span>
        <span className="pointer-events-none absolute bottom-4 left-1 text-[10px] font-medium text-gray-400 lg:text-xs">
          {fmtNum(primaryBounds.min, primaryDigits)}{primaryUnit}
        </span>
        {secondaryBounds && secondaryUnit && (
          <>
            <span className="pointer-events-none absolute right-1 top-0 text-[10px] font-medium text-sky-500 lg:text-xs">
              {fmtNum(secondaryBounds.max, secondaryDigits)}{secondaryUnit}
            </span>
            <span className="pointer-events-none absolute bottom-4 right-1 text-[10px] font-medium text-sky-400 lg:text-xs">
              {fmtNum(secondaryBounds.min, secondaryDigits)}{secondaryUnit}
            </span>
          </>
        )}
        <span className="pointer-events-none absolute bottom-0 left-1 text-[10px] text-gray-400 lg:text-xs">
          {fmtTime(domainMin, span)}
        </span>
        <span className="pointer-events-none absolute bottom-0 right-1 text-[10px] text-gray-400 lg:text-xs">
          {fmtTime(domainMax, span)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 lg:gap-x-5">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1 text-[10px] text-gray-500 lg:text-xs">
            <span
              className="inline-block h-0 w-3 border-t-2"
              style={{ borderColor: s.color, borderStyle: s.dashed ? 'dashed' : 'solid' }}
            />
            {s.label}
            {s.points.length > 0 && (
              <span className="font-medium" style={{ color: s.color }}>
                {fmtNum(s.points[s.points.length - 1].v, s.axis === 'secondary' ? secondaryDigits : primaryDigits)}
                {s.axis === 'secondary' ? secondaryUnit : primaryUnit}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
