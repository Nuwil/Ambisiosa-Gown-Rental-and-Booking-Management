import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cx } from '../../lib/format.js';

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const remove = useCallback((id) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((type, message) => {
    const id = crypto.randomUUID();
    setItems((l) => [...l.slice(-3), { id, type, message }]);
    setTimeout(() => remove(id), type === 'error' ? 6000 : 3500);
  }, [remove]);
  const api = useMemo(() => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }), [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'}
            className={cx('pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg',
              t.type === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
              t.type === 'error' && 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
              t.type === 'info' && 'border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100')}>
            <span className="flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="text-lg leading-none opacity-60 hover:opacity-100" aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
