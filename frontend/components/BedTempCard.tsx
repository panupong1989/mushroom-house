import { Card } from './Card';
import { sensorPointLabel } from '@/lib/constants';
import { fmtNum } from '@/lib/format';
import type { SensorPoint } from '@/lib/derive';

export function BedTempCard({ bed, bedDanger }: { bed: SensorPoint[]; bedDanger: number }) {
  return (
    <Card title="🌾 ในกอง (ทะลายปาล์ม) · โพรบ DS18B20">
      <div className="grid grid-cols-3 gap-2">
        {bed.map((pt) => {
          const temp = pt.temp;
          const danger = temp !== null && temp >= bedDanger;
          return (
            <div
              key={pt.sensorId ?? pt.location}
              className={`rounded-xl2 p-3 text-center ${danger ? 'bg-danger/10' : 'bg-amber-50'}`}
            >
              <p className="text-xs text-gray-500">{sensorPointLabel(pt.location, pt.sensorId)}</p>
              <p className={`text-xl font-bold ${danger ? 'text-danger' : 'text-amber-800'}`}>{fmtNum(temp)}°</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
