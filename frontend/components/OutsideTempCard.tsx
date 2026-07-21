import { Card } from './Card';
import { fmtNum } from '@/lib/format';
import type { SensorPoint } from '@/lib/derive';

// นอกโรง 1 จุด (เฉพาะอุณหภูมิ — DS18B20 ไม่มี RH)
export function OutsideTempCard({ outside }: { outside: SensorPoint[] }) {
  const pt = outside[0] ?? null;
  return (
    <Card title="🌤️ นอกโรง · อุณหภูมิภายนอก">
      <p className="text-3xl font-bold text-gray-800">
        {fmtNum(pt?.temp ?? null)}
        <span className="text-base font-normal text-gray-400">°C</span>
      </p>
    </Card>
  );
}
