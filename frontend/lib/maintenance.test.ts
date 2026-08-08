import { describe, expect, it } from 'vitest';
import {
  AIR_POSITIONS,
  BED_POSITIONS,
  IGNORED_VALUE,
  airPositionLabel,
  duplicateAirPositions,
  currentSelection,
  duplicatePositions,
  planChanges,
  planSize,
  positionLabel,
  shortRom,
} from './maintenance';

describe('BED_POSITIONS', () => {
  it('มีครบ 7 ตำแหน่ง (6 ในกอง + 1 นอกโรง) address ไม่ซ้ำ', () => {
    expect(BED_POSITIONS).toHaveLength(7);
    const addrs = BED_POSITIONS.map((p) => p.address);
    expect(new Set(addrs).size).toBe(7);
    expect(addrs).toContain('outside');
  });
});

describe('positionLabel', () => {
  it('ชื่อจุดในกองสื่อ "ชั้น" บน/กลาง/ล่าง (ไม่ใช่หัว/ท้ายตามยาวโรง)', () => {
    expect(positionLabel('row1_head_top')).toBe('แถว 1 บน');
    expect(positionLabel('row1_mid_mid')).toBe('แถว 1 กลาง');
    expect(positionLabel('row1_tail_bottom')).toBe('แถว 1 ล่าง');
    expect(positionLabel('row2_tail_bottom')).toBe('แถว 2 ล่าง');
    expect(positionLabel('outside')).toBe('นอกโรง');
  });
  it('ว่าง/null/ไม่รู้จัก', () => {
    expect(positionLabel('')).toBe('ว่าง');
    expect(positionLabel(null)).toBe('ว่าง');
    expect(positionLabel(undefined)).toBe('ว่าง');
    expect(positionLabel('unknown_key')).toBe('unknown_key');
  });
  it('ค่าพิเศษ "ไม่ใช้"', () => {
    expect(positionLabel(IGNORED_VALUE)).toBe('ไม่ใช้');
  });
});

describe('currentSelection', () => {
  it('rom ที่ทำเครื่องหมายไม่ใช้ → IGNORED_VALUE (ชนะ address)', () => {
    expect(currentSelection('A', { A: 'outside' }, new Set(['A']))).toBe(IGNORED_VALUE);
  });
  it('rom ปกติ → address ที่ผูกอยู่ / ว่างถ้ายังไม่ผูก', () => {
    expect(currentSelection('A', { A: 'outside' }, new Set())).toBe('outside');
    expect(currentSelection('B', { A: 'outside' }, new Set())).toBe('');
  });
});

describe('duplicatePositions', () => {
  it('คืน address ที่ถูกเลือกซ้ำ (>1 rom) ไม่นับ ว่าง', () => {
    const draft = { A: 'row1_head_top', B: 'row1_head_top', C: 'outside', D: '', E: '' };
    expect(duplicatePositions(draft)).toEqual(['row1_head_top']);
  });
  it('ไม่มีซ้ำ → []', () => {
    expect(duplicatePositions({ A: 'row1_head_top', B: 'row2_head_top', C: '' })).toEqual([]);
  });
  it('ว่างหลายตัวไม่นับว่าซ้ำ', () => {
    expect(duplicatePositions({ A: '', B: '', C: '' })).toEqual([]);
  });
  it('"ไม่ใช้" หลายตัวไม่นับว่าซ้ำ (ต่างจากตำแหน่งจริงที่มีได้ตัวเดียว)', () => {
    expect(duplicatePositions({ A: IGNORED_VALUE, B: IGNORED_VALUE, C: 'outside' })).toEqual([]);
  });
});

describe('planChanges', () => {
  const none = new Set<string>();

  it('คืนเฉพาะ rom ที่ต่างจากค่าปัจจุบัน', () => {
    const byRom = { A: 'row1_head_top', B: 'row1_mid_mid' };
    const draft = { A: 'row1_head_top', B: 'outside', C: 'row2_head_top' };
    expect(planChanges(draft, byRom, none)).toEqual({
      assigns: [
        { rom: 'B', address: 'outside' },
        { rom: 'C', address: 'row2_head_top' },
      ],
      ignores: [],
    });
  });

  it('ปลดเป็นว่าง ("") ก็นับเป็นการเปลี่ยน', () => {
    expect(planChanges({ A: '' }, { A: 'row1_head_top' }, none)).toEqual({
      assigns: [{ rom: 'A', address: '' }],
      ignores: [],
    });
  });

  it('ไม่เปลี่ยน → ว่างเปล่า', () => {
    expect(planChanges({ A: '' }, {}, none)).toEqual({ assigns: [], ignores: [] });
  });

  it('เลือก "ไม่ใช้" → set_rom_ignored อย่างเดียว (RPC ปลดตำแหน่งให้เอง ไม่ assign ซ้ำ)', () => {
    expect(planChanges({ A: IGNORED_VALUE }, { A: 'outside' }, none)).toEqual({
      assigns: [],
      ignores: [{ rom: 'A', ignored: true }],
    });
  });

  it('เอา "ไม่ใช้" ออกไปผูกตำแหน่ง → ปลดธงก่อนแล้วค่อย assign', () => {
    expect(planChanges({ A: 'outside' }, {}, new Set(['A']))).toEqual({
      assigns: [{ rom: 'A', address: 'outside' }],
      ignores: [{ rom: 'A', ignored: false }],
    });
  });

  it('ยังไม่ใช้เหมือนเดิม → ไม่มีอะไรต้องบันทึก', () => {
    expect(planChanges({ A: IGNORED_VALUE }, {}, new Set(['A']))).toEqual({ assigns: [], ignores: [] });
  });
});

describe('planSize', () => {
  it('นับ 1 ต่อ rom ที่ผู้ใช้แก้ (ปลดธง+assign ของ rom เดียวกันนับครั้งเดียว)', () => {
    expect(planSize(planChanges({ A: 'outside' }, {}, new Set(['A'])))).toBe(1);
    expect(planSize(planChanges({ A: IGNORED_VALUE }, { A: 'outside' }, new Set()))).toBe(1);
    expect(planSize(planChanges({ A: '', B: '' }, {}, new Set()))).toBe(0);
  });
});

describe('เซนเซอร์อากาศ RS485 (AIR_POSITIONS / duplicateAirPositions)', () => {
  it('3 ตำแหน่งตามความยาวโรง — คนละแกนกับชั้นในกอง', () => {
    expect(AIR_POSITIONS.map((p) => p.address)).toEqual(['head', 'mid', 'tail']);
    expect(airPositionLabel('head')).toBe('หัวโรง');
    expect(airPositionLabel('tail')).toBe('ท้ายโรง');
  });
  it('ยังไม่ระบุตำแหน่ง', () => {
    expect(airPositionLabel('')).toBe('ยังไม่ระบุ');
    expect(airPositionLabel(null)).toBe('ยังไม่ระบุ');
  });
  it('ตำแหน่งซ้ำเฉพาะตัวที่ "ใช้งาน" เท่านั้น (ตัวที่ปิดไว้ไม่กินตำแหน่ง)', () => {
    expect(
      duplicateAirPositions([
        { position: 'head', enabled: true },
        { position: 'head', enabled: true },
      ])
    ).toEqual(['head']);
    // addr ที่ปิดไว้ถือตำแหน่งเดิมค้างอยู่ ไม่ควรบล็อกการบันทึก
    expect(
      duplicateAirPositions([
        { position: 'head', enabled: true },
        { position: 'head', enabled: false },
      ])
    ).toEqual([]);
  });
  it('โรงจริง: addr1 หัวโรง + addr3 ท้ายโรง + addr2 ปิด → ไม่ซ้ำ', () => {
    expect(
      duplicateAirPositions([
        { position: 'head', enabled: true },
        { position: '', enabled: false },
        { position: 'tail', enabled: true },
      ])
    ).toEqual([]);
  });
});

describe('shortRom', () => {
  it('ย่อ ROM ยาว เก็บหัว 6 + ท้าย 4', () => {
    expect(shortRom('28C066B400000093')).toBe('28C066…0093');
  });
  it('ROM สั้นไม่ย่อ', () => {
    expect(shortRom('28C066')).toBe('28C066');
  });
});
