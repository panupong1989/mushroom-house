import type { ReactNode } from 'react';

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl2 border border-white/70 bg-card p-4 shadow-soft ${className}`}>
      {title && <h2 className="mb-2 text-[13px] font-medium text-gray-500">{title}</h2>}
      {children}
    </div>
  );
}
