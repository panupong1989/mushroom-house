import { Card } from './Card';

export function WaterLevelCard({ waterOk }: { waterOk: boolean | null }) {
  const label = waterOk === null ? 'ไม่มีข้อมูล' : waterOk ? 'ระดับน้ำปกติ' : 'น้ำต่ำ';
  const style =
    waterOk === null ? 'bg-gray-100 text-gray-500' : waterOk ? 'bg-leaf/10 text-leaf-dark' : 'bg-danger/10 text-danger';
  return (
    <Card title="ระดับน้ำ (ถัง)">
      <span className={`inline-block rounded-full px-3 py-1.5 text-sm font-semibold ${style}`}>{label}</span>
      {waterOk === false && <p className="mt-2 text-xs text-danger">ปั๊ม/หมอกจะถูกล็อก OFF โดยอัตโนมัติ (interlock)</p>}
    </Card>
  );
}
