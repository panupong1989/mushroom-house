export function timeAgoLabel(tsMs: number | null, nowMs: number): string {
  if (tsMs === null) return 'ไม่มีข้อมูล';
  const diffSec = Math.max(0, Math.round((nowMs - tsMs) / 1000));
  if (diffSec < 60) return `${diffSec} วินาทีที่แล้ว`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHr = Math.round(diffMin / 60);
  return `${diffHr} ชั่วโมงที่แล้ว`;
}

export function fmtNum(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}
