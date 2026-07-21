import { RANGE_OPTIONS, type RangeKey } from '@/lib/history';

// ปุ่มเลือกช่วง (1ชม/4ชม/12ชม/24ชม/สัปดาห์/เดือน/ปี) + date picker เลือกวัน — ใช้ร่วมกันทั้ง 2 ชุดกราฟ
// dateStr = '' หมายถึง "ล่าสุด" (live, อิงเวลาปัจจุบัน); ระบุวันที่ = ดูย้อนหลังสิ้นสุดที่วันนั้น
export function RangeControls({
  range,
  onRangeChange,
  dateStr,
  onDateChange,
  todayStr,
}: {
  range: RangeKey;
  onRangeChange: (r: RangeKey) => void;
  dateStr: string;
  onDateChange: (d: string) => void;
  todayStr?: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5">
        {RANGE_OPTIONS.map((r) => (
          <button
            key={r.key}
            onClick={() => onRangeChange(r.key)}
            className={`rounded-xl2 px-2.5 py-1 text-xs font-medium ${
              range === r.key ? 'bg-gray-800 text-white' : 'bg-bg text-gray-500'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <input
        type="date"
        value={dateStr}
        max={todayStr}
        onChange={(e) => onDateChange(e.target.value)}
        className="rounded-xl2 border border-white/70 bg-bg px-2 py-1 text-xs text-gray-600"
        aria-label="เลือกวัน"
      />
      {dateStr && (
        <button onClick={() => onDateChange('')} className="text-xs font-medium text-leaf-dark underline">
          ล่าสุด
        </button>
      )}
    </div>
  );
}
