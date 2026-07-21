'use client';

export type TabKey = 'monitor' | 'history' | 'alerts' | 'settings';

export const TABS: { key: TabKey; label: string }[] = [
  { key: 'monitor', label: 'Monitor' },
  { key: 'history', label: 'กราฟ' },
  { key: 'alerts', label: 'แจ้งเตือน' },
  { key: 'settings', label: 'ตั้งค่า' },
];

// แถบแท็บบนสุด — สลับหน้าด้วยการคลิก ไม่ scroll รวมหน้าเดียว (ดู app/page.tsx)
export function TabNav({ active, onChange }: { active: TabKey; onChange: (key: TabKey) => void }) {
  return (
    <nav className="flex gap-1 rounded-full bg-card p-1 shadow-soft">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          aria-current={active === t.key ? 'page' : undefined}
          className={`flex-1 rounded-full px-2 py-2 text-sm font-semibold transition sm:px-4 ${
            active === t.key ? 'bg-leaf text-white shadow-soft' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
