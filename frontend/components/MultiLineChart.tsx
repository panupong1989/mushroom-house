import { seriesBounds, timeTicks, valueTicks, type Point } from '@/lib/history';
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

  // grid + ป้ายค่า/เวลา (ดู issue: กราฟสูงขึ้นแล้วมีแค่ min/max ที่มุม อ่านค่ากลางกราฟยาก)
  // จำนวน tick ปรับตามความสูง (กราฟเดสก์ท็อป ~58vh ใส่ได้เยอะกว่ามือถือ 150px)
  const tall = height >= 300;
  const yTicks = valueTicks(primaryBounds.min, primaryBounds.max, tall ? 8 : 3);
  const xTicks = timeTicks(domainMin, domainMax, tall ? 8 : 5);
  // ป้ายเวลากลางกราฟ: ตัดตัวที่ชิดขอบ (ชนป้ายมุมซ้าย/ขวาเดิม) — มือถือแคบ ต้องเว้นขอบมากกว่า
  const edgePct = tall ? 4 : 12;
  // ค่าแกนรอง (%) ที่ระดับเดียวกับ gridline ของแกนหลัก — ให้ป้ายซ้าย/ขวาอยู่บนเส้นเดียวกัน
  const secondaryAt = (y: number): number | null => {
    if (!secondaryBounds) return null;
    const frac = 1 - (y - PAD_T) / Math.max(1, height - PAD_T - PAD_B);
    return secondaryBounds.min + frac * (secondaryBounds.max - secondaryBounds.min);
  };

  function pathFor(pts: Point[], y: (v: number) => number): string | null {
    if (pts.length < 2) return null;
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  }

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img">
          {/* grid วาดก่อนเส้นข้อมูล (อยู่ใต้เส้น) — non-scaling-stroke กันเส้นยืดตาม viewBox */}
          {xTicks.map((t) => (
            <line
              key={`gx-${t}`}
              x1={x(t)}
              x2={x(t)}
              y1={PAD_T}
              y2={height - PAD_B}
              stroke="#f3f4f6"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {yTicks.map((v) => (
            <line
              key={`gy-${v}`}
              x1={0}
              x2={W}
              y1={yPrimary(v)}
              y2={yPrimary(v)}
              stroke="#e5e7eb"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
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
        {/* ป้ายค่าแกนหลัก (ซ้าย) ที่ทุก gridline — แทนป้าย min/max ที่มุมแบบเดิม
            viewBox สูง = height px จริง เลยวางด้วย top:px ตรงๆ ได้ (แกน y ไม่ถูกยืด) */}
        {yTicks.map((v) => (
          <span
            key={`ly-${v}`}
            className="pointer-events-none absolute left-1 -translate-y-1/2 rounded bg-card/75 px-0.5 text-[10px] font-medium text-gray-400 lg:text-xs"
            style={{ top: yPrimary(v) }}
          >
            {fmtNum(v, primaryDigits)}{primaryUnit}
          </span>
        ))}
        {/* ป้ายแกนรอง (ขวา, %) ระดับเดียวกับ gridline — ค่า interpolate จากสเกลรอง */}
        {secondaryBounds && secondaryUnit &&
          yTicks.map((v) => {
            const sv = secondaryAt(yPrimary(v));
            if (sv == null) return null;
            return (
              <span
                key={`ls-${v}`}
                className="pointer-events-none absolute right-1 -translate-y-1/2 rounded bg-card/75 px-0.5 text-[10px] font-medium text-sky-400 lg:text-xs"
                style={{ top: yPrimary(v) }}
              >
                {fmtNum(sv, secondaryDigits)}{secondaryUnit}
              </span>
            );
          })}
        {/* ป้ายเวลากลางกราฟ (แกน x ถูกยืดตามความกว้าง เลยวางด้วย % + translateX(-50%)) */}
        {xTicks.map((t) => {
          const pct = ((t - domainMin) / span) * 100;
          if (pct < edgePct || pct > 100 - edgePct) return null; // กันชนป้ายมุม
          return (
            <span
              key={`lt-${t}`}
              className="pointer-events-none absolute bottom-0 -translate-x-1/2 text-[10px] text-gray-400 lg:text-xs"
              style={{ left: `${pct}%` }}
            >
              {fmtTime(t, span)}
            </span>
          );
        })}
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
