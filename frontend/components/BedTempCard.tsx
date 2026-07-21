import { Card } from './Card';
import { sensorPointLabel } from '@/lib/constants';
import { fmtNum } from '@/lib/format';
import type { SensorPoint } from '@/lib/derive';

function BedCell({ pt, danger }: { pt: SensorPoint; danger: boolean }) {
  return (
    <div className={`rounded-xl2 p-3 text-center ${danger ? 'bg-danger/10' : 'bg-amber-50'}`}>
      <p className="text-xs text-gray-500">{sensorPointLabel(pt.location, pt.sensorId)}</p>
      <p className={`text-xl font-bold ${danger ? 'text-danger' : 'text-amber-800'}`}>{fmtNum(pt.temp)}°</p>
    </div>
  );
}

// ในกอง 6 จุด: 2 แถว x 3 ตำแหน่ง (หัว/กลาง/ท้าย) — จัดกลุ่มด้วย rowNo (lib/derive.ts orderBedPoints
// เรียงมาให้แล้ว) เซนเซอร์ legacy ที่ไม่มี rowNo (null) แสดงเป็นแถวเดี่ยวไม่จัดกลุ่ม
export function BedTempCard({ bed, bedDanger }: { bed: SensorPoint[]; bedDanger: number }) {
  const rows = new Map<number, SensorPoint[]>();
  const flat: SensorPoint[] = [];
  for (const pt of bed) {
    if (pt.rowNo != null) {
      const list = rows.get(pt.rowNo) ?? [];
      list.push(pt);
      rows.set(pt.rowNo, list);
    } else {
      flat.push(pt);
    }
  }
  const rowNos = Array.from(rows.keys()).sort((a, b) => a - b);

  return (
    <Card title="🌾 ในกอง (ทะลายปาล์ม) · โพรบ DS18B20">
      <div className="flex flex-col gap-3">
        {rowNos.map((rowNo) => (
          <div key={rowNo}>
            <p className="mb-1 text-[11px] font-medium text-gray-400">แถวที่ {rowNo}</p>
            <div className="grid grid-cols-3 gap-2">
              {rows.get(rowNo)!.map((pt) => (
                <BedCell
                  key={pt.sensorId ?? `${rowNo}-${pt.location}`}
                  pt={pt}
                  danger={pt.temp !== null && pt.temp >= bedDanger}
                />
              ))}
            </div>
          </div>
        ))}
        {flat.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {flat.map((pt) => (
              <BedCell key={pt.sensorId ?? pt.location} pt={pt} danger={pt.temp !== null && pt.temp >= bedDanger} />
            ))}
          </div>
        )}
        {bed.length === 0 && <p className="text-xs text-gray-400">ไม่มีข้อมูล</p>}
      </div>
    </Card>
  );
}
