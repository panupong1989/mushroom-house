import { Card } from './Card';
import { LOCATION_LABELS } from '@/lib/constants';
import { fmtNum } from '@/lib/format';
import type { LocationReading } from '@/lib/derive';

const ORDER = ['head', 'mid', 'tail'];

export function BedTempCard({ bed, bedDanger }: { bed: Record<string, LocationReading>; bedDanger: number }) {
  return (
    <Card title="🌾 ในกอง (ทะลายปาล์ม) · โพรบ DS18B20">
      <div className="grid grid-cols-3 gap-2">
        {ORDER.map((loc) => {
          const temp = bed[loc]?.temp ?? null;
          const danger = temp !== null && temp >= bedDanger;
          return (
            <div key={loc} className={`rounded-xl2 p-3 text-center ${danger ? 'bg-danger/10' : 'bg-amber-50'}`}>
              <p className="text-xs text-gray-500">{LOCATION_LABELS[loc]}</p>
              <p className={`text-xl font-bold ${danger ? 'text-danger' : 'text-amber-800'}`}>{fmtNum(temp)}°</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
