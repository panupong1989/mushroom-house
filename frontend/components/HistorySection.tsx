'use client';

import { useState } from 'react';
import { BedTempHistoryCard } from './BedTempHistoryCard';
import { InOutHistoryCard } from './InOutHistoryCard';

// หน้ากราฟย้อนหลัง 2 ชุด (เลื่อนดูทีละชุด) — ชุดที่ 1 อุณหภูมิในกอง (6 จุด), ชุดที่ 2 ในโรง+นอกโรง
// แต่ละชุดมีปุ่มเลือกช่วง + date picker อิสระของตัวเอง (ดู issue #34) อ่านจาก RPC sensor_history[_range]
// (supabase/migrations/005_real_sensors.sql) raw สำหรับช่วงสั้น (<=24h), rollup สำหรับช่วงยาว (week+)
//
// ปุ่ม "ดูตัวอย่างกราฟ" (ดู issue #38) — สลับทั้ง 2 ชุดกราฟไปแสดงข้อมูลจำลองในหน่วยความจำพร้อมกัน
// (buildDemoSensorSeries ใน lib/mock.ts) ไม่เขียน/อ่าน Supabase เลยตอนเปิดโหมดนี้ ให้ดูหน้าตากราฟได้
// ก่อนมีเซนเซอร์จริง กดลบตัวอย่างแล้วกลับมาแสดงข้อมูลจริงทันที (state อยู่แค่ในเบราว์เซอร์ ไม่ persist)
export function HistorySection({ houseId }: { houseId: string }) {
  const [demoMode, setDemoMode] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setDemoMode((v) => !v)}
          className={`rounded-xl2 px-3 py-1.5 text-xs font-semibold ${
            demoMode ? 'bg-gray-800 text-white' : 'bg-leaf text-white'
          }`}
        >
          {demoMode ? 'ลบตัวอย่าง' : 'ดูตัวอย่างกราฟ'}
        </button>
        {demoMode && (
          <span className="rounded-xl2 bg-warn/15 px-3 py-1.5 text-xs font-medium text-warn">
            ⚠️ กำลังแสดงข้อมูลตัวอย่าง ไม่ใช่ค่าจริง
          </span>
        )}
      </div>
      <BedTempHistoryCard houseId={houseId} demoMode={demoMode} />
      <InOutHistoryCard houseId={houseId} demoMode={demoMode} />
    </div>
  );
}
