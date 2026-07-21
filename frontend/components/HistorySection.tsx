import { BedTempHistoryCard } from './BedTempHistoryCard';
import { InOutHistoryCard } from './InOutHistoryCard';

// หน้ากราฟย้อนหลัง 2 ชุด (เลื่อนดูทีละชุด) — ชุดที่ 1 อุณหภูมิในกอง (6 จุด), ชุดที่ 2 ในโรง+นอกโรง
// แต่ละชุดมีปุ่มเลือกช่วง + date picker อิสระของตัวเอง (ดู issue #34) อ่านจาก RPC sensor_history[_range]
// (supabase/migrations/005_real_sensors.sql) raw สำหรับช่วงสั้น (<=24h), rollup สำหรับช่วงยาว (week+)
export function HistorySection({ houseId }: { houseId: string }) {
  return (
    <div className="flex flex-col gap-4">
      <BedTempHistoryCard houseId={houseId} />
      <InOutHistoryCard houseId={houseId} />
    </div>
  );
}
