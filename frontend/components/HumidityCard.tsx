import { Card } from './Card';
import { fmtNum } from '@/lib/format';

export function HumidityCard({ rh, rhMin, rhMax }: { rh: number | null; rhMin: number; rhMax: number }) {
  const pct = rh === null ? 0 : Math.min(100, Math.max(0, rh));
  return (
    <Card title="ความชื้นสัมพัทธ์ (เฉลี่ย)">
      <div className="flex items-end justify-between">
        <p className="text-3xl font-bold text-gray-800">
          {fmtNum(rh)}
          <span className="text-base font-normal text-gray-400">%RH</span>
        </p>
        <p className="text-xs text-gray-500">
          เป้าหมาย {rhMin}-{rhMax}%
        </p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bg">
        <div
          className="h-full rounded-full bg-leaf transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Card>
  );
}
