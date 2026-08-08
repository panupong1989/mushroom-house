// Logic หน้า Maintenance (จับคู่ ROM ↔ ตำแหน่ง) — pure helper แยกไว้เพื่อเขียน unit test ได้
// ตำแหน่ง 7 จุด = address key คงที่ใน sensors (supabase/migrations/005_real_sensors.sql)

export interface BedPosition {
  address: string; // key คงที่ใน sensors.address — ผูก rom_id เข้ากับ record นี้
  label: string;
}

// 6 จุดในกอง (2 แถว × ชั้นบน/กลาง/ล่าง) + 1 นอกโรง — ตรงกับ seed 005 (bed_temp ×6 + outside_temp ×1)
// ชื่อจุดสื่อ "ชั้น" (tier: top/mid/bottom) ตามที่ปักโพรบจริงในกอง ไม่ใช่หัว/ท้ายตามยาวโรง
// (หัวโรง/ท้ายโรง สงวนไว้ให้เซนเซอร์อากาศ RS485 ที่วัดตามความยาวโรง — ดู LOCATION_LABELS)
export const BED_POSITIONS: BedPosition[] = [
  { address: 'row1_head_top', label: 'แถว 1 บน' },
  { address: 'row1_mid_mid', label: 'แถว 1 กลาง' },
  { address: 'row1_tail_bottom', label: 'แถว 1 ล่าง' },
  { address: 'row2_head_top', label: 'แถว 2 บน' },
  { address: 'row2_mid_mid', label: 'แถว 2 กลาง' },
  { address: 'row2_tail_bottom', label: 'แถว 2 ล่าง' },
  { address: 'outside', label: 'นอกโรง' },
];

// ค่าพิเศษใน dropdown จับคู่ — ไม่ใช่ address จริง ไม่เคยส่งเข้า assign_sensor_rom
// (บันทึกเป็น bed_scan.ignored ผ่าน RPC set_rom_ignored แทน — supabase/migrations/010)
export const IGNORED_VALUE = '__ignored__';

const LABEL_BY_ADDRESS = new Map(BED_POSITIONS.map((p) => [p.address, p.label]));

// label ของตำแหน่ง (address ว่าง/ไม่รู้จัก → 'ว่าง')
export function positionLabel(address: string | null | undefined): string {
  if (!address) return 'ว่าง';
  if (address === IGNORED_VALUE) return 'ไม่ใช้';
  return LABEL_BY_ADDRESS.get(address) ?? address;
}

// label ของชั้นในกอง (sensors.tier — 'top' | 'mid' | 'bottom') สำหรับการ์ดหน้าแรก
export const TIER_LABELS: Record<string, string> = { top: 'บน', mid: 'กลาง', bottom: 'ล่าง' };

// address ที่ถูกเลือกซ้ำ (มี rom มากกว่า 1 ตัวชี้ตำแหน่งเดียวกัน) — ไม่นับ 'ว่าง' ('') และ 'ไม่ใช้'
// (สองอันนั้นมีได้หลายตัว) ใช้กันผู้ใช้บันทึกทับกันเอง (1 ตำแหน่งมีได้ตัวเดียว)
export function duplicatePositions(draft: Record<string, string>): string[] {
  const count = new Map<string, number>();
  for (const address of Object.values(draft)) {
    if (!address || address === IGNORED_VALUE) continue;
    count.set(address, (count.get(address) ?? 0) + 1);
  }
  return [...count.entries()].filter(([, n]) => n > 1).map(([a]) => a);
}

// ค่าที่ dropdown ควรโชว์อยู่ตอนนี้สำหรับ rom หนึ่ง: 'ไม่ใช้' ชนะ address (RPC ปลดตำแหน่งให้อยู่แล้ว)
export function currentSelection(rom: string, byRom: Record<string, string>, ignored: Set<string>): string {
  if (ignored.has(rom)) return IGNORED_VALUE;
  return byRom[rom] ?? '';
}

export interface MappingPlan {
  assigns: { rom: string; address: string }[]; // -> RPC assign_sensor_rom (address '' = ปลดเป็นว่าง)
  ignores: { rom: string; ignored: boolean }[]; // -> RPC set_rom_ignored
}

// แปลง draft (ค่าที่เลือกใน dropdown) เป็นรายการ RPC ที่ต้องยิงจริง
// เทียบกับสถานะปัจจุบัน (byRom = ตำแหน่งที่ผูกไว้, ignoredNow = rom ที่ทำเครื่องหมายไม่ใช้)
// ลำดับสำคัญ: ปลดธง "ไม่ใช้" ก่อนค่อยผูกตำแหน่ง (set_rom_ignored(true) จะปลดตำแหน่งทิ้ง)
export function planChanges(
  draft: Record<string, string>,
  byRom: Record<string, string>,
  ignoredNow: Set<string>
): MappingPlan {
  const plan: MappingPlan = { assigns: [], ignores: [] };
  for (const [rom, next] of Object.entries(draft)) {
    const prev = currentSelection(rom, byRom, ignoredNow);
    if (prev === next) continue;

    if (next === IGNORED_VALUE) {
      plan.ignores.push({ rom, ignored: true }); // RPC ปลดตำแหน่งให้เอง ไม่ต้อง assign ซ้ำ
      continue;
    }
    if (prev === IGNORED_VALUE) plan.ignores.push({ rom, ignored: false });
    plan.assigns.push({ rom, address: next });
  }
  return plan;
}

// จำนวนรายการที่ต้องบันทึก (ใช้ enable ปุ่ม + โชว์ "แก้ไป N ตัว")
export function planSize(plan: MappingPlan): number {
  return plan.assigns.length + plan.ignores.filter((i) => i.ignored).length;
}

// ROM ย่อให้อ่านง่าย (28XXXXXX…XX) — ROM DS18B20 ยาว 16 hex, กลางไม่ค่อยต่างกัน
export function shortRom(rom: string): string {
  if (rom.length <= 10) return rom;
  return `${rom.slice(0, 6)}…${rom.slice(-4)}`;
}
