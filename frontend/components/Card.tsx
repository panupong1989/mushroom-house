import type { ReactNode } from 'react';

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl2 bg-card p-4 shadow-soft ${className}`}>
      {title && <h2 className="mb-2 text-sm font-semibold text-gray-500">{title}</h2>}
      {children}
    </div>
  );
}
