import { Card } from './Card';
import { sensorPointLabel } from '@/lib/constants';
import { fmtNum } from '@/lib/format';
import type { SensorPoint } from '@/lib/derive';

// ในโรง 2 จุด (หัว/ท้าย) — แต่ละจุดโชว์ทั้งอุณหภูมิ+ความชื้นคู่กัน (เซนเซอร์ air_th ตัวเดียวกัน)
export function InHouseCard({ air }: { air: SensorPoint[] }) {
  return (
    <Card title="🏠 ในโรง · อุณหภูมิ+ความชื้น">
      <div className="grid grid-cols-2 gap-2">
        {air.map((pt) => (
          <div key={pt.sensorId ?? pt.location} className="rounded-xl2 bg-bg p-3 text-center">
            <p className="text-xs text-gray-500">{sensorPointLabel(pt.location, pt.sensorId)}</p>
            <p className="text-lg font-bold text-gray-700">
              {fmtNum(pt.temp)}
              <span className="text-xs font-normal text-gray-400">°C</span>
            </p>
            <p className="text-xs text-sky-600">{fmtNum(pt.rh)}%RH</p>
          </div>
        ))}
        {air.length === 0 && <p className="col-span-2 text-xs text-gray-400">ไม่มีข้อมูล</p>}
      </div>
    </Card>
  );
}
