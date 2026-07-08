'use client';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'rejected';
  message: string;
}

const STYLES: Record<Toast['kind'], string> = {
  success: 'bg-leaf text-white',
  error: 'bg-gray-700 text-white',
  rejected: 'bg-danger text-white',
};

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div key={t.id} className={`w-full max-w-sm rounded-xl2 px-4 py-2.5 text-sm shadow-soft ${STYLES[t.kind]}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
