import { LONG_RANGE_OPTIONS, QUICK_RANGE_OPTIONS, rangeDescription, type RangeKey } from '@/lib/history';

// ปุ่มเลือกช่วง แยก 2 กลุ่มมีป้ายกำกับ (ดู issue #38): "ย้อนหลังจากตอนนี้" (1/4/12/24 ชม. + date picker)
// กับ "ระยะยาว" (สัปดาห์/เดือน/ปี) — active ได้ทีละอัน, เลือกวันจะ "ชนะ" ปุ่มช่วงทั้งหมด (ดูทั้งวันนั้น 00:00–23:59)
// ใช้ร่วมกันทั้ง 2 ชุดกราฟ; domainMin/domainMax ใช้แสดงข้อความช่วงที่กำลังดูจริงใต้ปุ่ม
export function RangeControls({
  range,
  onRangeChange,
  dateStr,
  onDateChange,
  todayStr,
  domainMin,
  domainMax,
}: {
  range: RangeKey;
  onRangeChange: (r: RangeKey) => void;
  dateStr: string;
  onDateChange: (d: string) => void;
  todayStr?: string;
  domainMin: number;
  domainMax: number;
}) {
  const dateActive = !!dateStr;

  function pickRange(r: RangeKey) {
    if (dateActive) onDateChange('');
    onRangeChange(r);
  }

  function activeClass(isActive: boolean): string {
    return isActive ? 'bg-gray-800 text-white' : 'bg-bg text-gray-500';
  }

  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] font-medium text-gray-400">ย้อนหลังจากตอนนี้</span>
          {QUICK_RANGE_OPTIONS.map((r) => (
            <button
              key={r.key}
              onClick={() => pickRange(r.key)}
              className={`rounded-xl2 px-2.5 py-1 text-xs font-medium ${activeClass(range === r.key && !dateActive)}`}
            >
              {r.label}
            </button>
          ))}
          <input
            type="date"
            value={dateStr}
            max={todayStr}
            onChange={(e) => onDateChange(e.target.value)}
            className={`rounded-xl2 border px-2 py-1 text-xs ${
              dateActive ? 'border-transparent bg-gray-800 text-white' : 'border-white/70 bg-bg text-gray-600'
            }`}
            aria-label="เลือกวัน"
          />
          {dateActive && (
            <button onClick={() => onDateChange('')} className="text-xs font-medium text-leaf-dark underline">
              ล่าสุด
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] font-medium text-gray-400">ระยะยาว</span>
          {LONG_RANGE_OPTIONS.map((r) => (
            <button
              key={r.key}
              onClick={() => pickRange(r.key)}
              className={`rounded-xl2 px-2.5 py-1 text-xs font-medium ${activeClass(range === r.key && !dateActive)}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-gray-400">{rangeDescription(range, dateStr, domainMin, domainMax)}</p>
    </div>
  );
}
