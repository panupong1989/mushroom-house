import { describe, expect, it } from 'vitest';
import { BED_POSITIONS, duplicatePositions, pendingChanges, positionLabel, shortRom } from './maintenance';

describe('BED_POSITIONS', () => {
  it('มีครบ 7 ตำแหน่ง (6 ในกอง + 1 นอกโรง) address ไม่ซ้ำ', () => {
    expect(BED_POSITIONS).toHaveLength(7);
    const addrs = BED_POSITIONS.map((p) => p.address);
    expect(new Set(addrs).size).toBe(7);
    expect(addrs).toContain('outside');
  });
});

describe('positionLabel', () => {
  it('map address → label ภาษาไทย', () => {
    expect(positionLabel('row1_head_top')).toBe('แถว1-หัว');
    expect(positionLabel('outside')).toBe('นอกโรง');
  });
  it('ว่าง/null/ไม่รู้จัก', () => {
    expect(positionLabel('')).toBe('ว่าง');
    expect(positionLabel(null)).toBe('ว่าง');
    expect(positionLabel(undefined)).toBe('ว่าง');
    expect(positionLabel('unknown_key')).toBe('unknown_key');
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
});

describe('pendingChanges', () => {
  it('คืนเฉพาะ rom ที่ต่างจากค่าปัจจุบัน', () => {
    const current = { A: 'row1_head_top', B: 'row1_mid_mid' };
    const draft = { A: 'row1_head_top', B: 'outside', C: 'row2_head_top' };
    expect(pendingChanges(draft, current)).toEqual([
      { rom: 'B', address: 'outside' },
      { rom: 'C', address: 'row2_head_top' },
    ]);
  });
  it('ปลดเป็นว่าง ("") ก็นับเป็นการเปลี่ยน', () => {
    expect(pendingChanges({ A: '' }, { A: 'row1_head_top' })).toEqual([{ rom: 'A', address: '' }]);
  });
  it('ไม่เปลี่ยน (draft = current ที่ default ว่าง) → []', () => {
    expect(pendingChanges({ A: '' }, {})).toEqual([]);
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
