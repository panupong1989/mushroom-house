import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries: Array<{ text: string; params: unknown[] }> = [];
vi.mock('../db/pool.js', () => ({
  q: vi.fn((text: string, params: unknown[] = []) => {
    queries.push({ text, params });
    return Promise.resolve({ rows: [], rowCount: 0 });
  }),
}));

const { ingestTelemetry } = await import('./ingest.js');

beforeEach(() => {
  queries.length = 0;
});

describe('ingestTelemetry — bed temp', () => {
  it('เก็บ bed temp ทั้ง 3 ตัว จับคู่ตาม address', async () => {
    await ingestTelemetry('house-01', {
      bed: [
        { addr: '28-0000-01', temp: 32 },
        { addr: '28-0000-02', temp: 33 },
        { addr: '28-0000-03', temp: 34 },
      ],
    });
    const bedQueries = queries.filter(q => q.text.includes("kind='bed_temp'"));
    expect(bedQueries).toHaveLength(3);
    expect(bedQueries.map(q => q.params)).toEqual([
      ['house-01', '28-0000-01', 32],
      ['house-01', '28-0000-02', 33],
      ['house-01', '28-0000-03', 34],
    ]);
  });

  it('ข้าม bed reading ที่ ok=false', async () => {
    await ingestTelemetry('house-01', {
      bed: [{ addr: '28-0000-01', temp: 32, ok: false }],
    });
    expect(queries.filter(q => q.text.includes("kind='bed_temp'"))).toHaveLength(0);
  });
});

describe('ingestTelemetry — water level', () => {
  it('water_ok=true เก็บเป็น 1', async () => {
    await ingestTelemetry('house-01', { water_ok: true });
    const waterQ = queries.find(q => q.text.includes("kind='water_level'"));
    expect(waterQ?.params).toEqual(['house-01', 1]);
  });

  it('water_ok=false เก็บเป็น 0', async () => {
    await ingestTelemetry('house-01', { water_ok: false });
    const waterQ = queries.find(q => q.text.includes("kind='water_level'"));
    expect(waterQ?.params).toEqual(['house-01', 0]);
  });

  it('ไม่มี water_ok ในเพย์โหลด -> ไม่เขียนลง DB', async () => {
    await ingestTelemetry('house-01', {});
    expect(queries.find(q => q.text.includes("kind='water_level'"))).toBeUndefined();
  });
});

describe('ingestTelemetry — mode ล่าสุดของ house', () => {
  it('mode เป็น number (enum จาก firmware) -> แปลงเป็นชื่อ mode', async () => {
    await ingestTelemetry('house-01', { mode: 3 }); // M_FRUITING
    const modeQ = queries.find(q => q.text.includes('UPDATE houses'));
    expect(modeQ?.params).toEqual(['house-01', 'FRUITING']);
  });

  it('mode เป็น string -> uppercase แล้วเก็บตรงๆ', async () => {
    await ingestTelemetry('house-01', { mode: 'safe_hold' });
    const modeQ = queries.find(q => q.text.includes('UPDATE houses'));
    expect(modeQ?.params).toEqual(['house-01', 'SAFE_HOLD']);
  });

  it('ไม่มี mode ในเพย์โหลด -> ไม่ update houses', async () => {
    await ingestTelemetry('house-01', {});
    expect(queries.find(q => q.text.includes('UPDATE houses'))).toBeUndefined();
  });
});

describe('ingestTelemetry — air (regression, พฤติกรรมเดิม)', () => {
  it('เก็บเฉพาะ air reading ที่ ok=true', async () => {
    await ingestTelemetry('house-01', {
      air: [
        { addr: 1, t: 30, rh: 85, ok: true },
        { addr: 2, t: 31, rh: 86, ok: false },
      ],
    });
    const airQueries = queries.filter(q => q.text.includes("kind='air_th'"));
    expect(airQueries).toHaveLength(2);
    expect(airQueries.every(q => q.params[1] === '1')).toBe(true);
  });
});
