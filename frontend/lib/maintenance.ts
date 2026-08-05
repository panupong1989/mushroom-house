// Logic หน้า Maintenance (จับคู่ ROM ↔ ตำแหน่ง) — pure helper แยกไว้เพื่อเขียน unit test ได้
// ตำแหน่ง 7 จุด = address key คงที่ใน sensors (supabase/migrations/005_real_sensors.sql)

export interface BedPosition {
  address: string; // key คงที่ใน sensors.address — ผูก rom_id เข้ากับ record นี้
  label: string;
}

// 6 จุดในกอง (2 แถว × หัว/กลาง/ท้าย) + 1 นอกโรง — ตรงกับ seed 005 (bed_temp ×6 + outside_temp ×1)
export const BED_POSITIONS: BedPosition[] = [
  { address: 'row1_head_top', label: 'แถว1-หัว' },
  { address: 'row1_mid_mid', label: 'แถว1-กลาง' },
  { address: 'row1_tail_bottom', label: 'แถว1-ท้าย' },
  { address: 'row2_head_top', label: 'แถว2-หัว' },
  { address: 'row2_mid_mid', label: 'แถว2-กลาง' },
  { address: 'row2_tail_bottom', label: 'แถว2-ท้าย' },
  { address: 'outside', label: 'นอกโรง' },
];

const LABEL_BY_ADDRESS = new Map(BED_POSITIONS.map((p) => [p.address, p.label]));

// label ของตำแหน่ง (address ว่าง/ไม่รู้จัก → 'ว่าง')
export function positionLabel(address: string | null | undefined): string {
  if (!address) return 'ว่าง';
  return LABEL_BY_ADDRESS.get(address) ?? address;
}

// address ที่ถูกเลือกซ้ำ (มี rom มากกว่า 1 ตัวชี้ตำแหน่งเดียวกัน) — ไม่นับ 'ว่าง' ('')
// ใช้กันผู้ใช้บันทึกทับกันเอง (1 ตำแหน่งมีได้ตัวเดียว)
export function duplicatePositions(draft: Record<string, string>): string[] {
  const count = new Map<string, number>();
  for (const address of Object.values(draft)) {
    if (!address) continue;
    count.set(address, (count.get(address) ?? 0) + 1);
  }
  return [...count.entries()].filter(([, n]) => n > 1).map(([a]) => a);
}

// รายการที่ต้องบันทึก (draft ต่างจากค่าปัจจุบัน) — คืน {rom, address} ต่อ rom ที่เปลี่ยน
// address '' = ปลดเป็นว่าง (ส่ง p_address='' ให้ RPC เคลียร์)
export function pendingChanges(
  draft: Record<string, string>,
  current: Record<string, string>
): { rom: string; address: string }[] {
  const out: { rom: string; address: string }[] = [];
  for (const [rom, address] of Object.entries(draft)) {
    if ((current[rom] ?? '') !== address) out.push({ rom, address });
  }
  return out;
}

// ROM ย่อให้อ่านง่าย (28XXXXXX…XX) — ROM DS18B20 ยาว 16 hex, กลางไม่ค่อยต่างกัน
export function shortRom(rom: string): string {
  if (rom.length <= 10) return rom;
  return `${rom.slice(0, 6)}…${rom.slice(-4)}`;
}
