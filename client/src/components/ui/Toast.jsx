import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cx } from '../../lib/format.js';
import Icon from './Icon.jsx';

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

const ICON = { success: ['check', 'text-emerald-700 dark:text-emerald-400'], error: ['alert', 'text-red-700 dark:text-red-400'], info: ['info', 'text-slate-500'] };

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
        {items.map((t) => {
          const [icon, tone] = ICON[t.type];
          return (
            <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'}
              className={cx('page-enter pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm text-slate-800 shadow-lg shadow-slate-900/5 dark:bg-slate-900 dark:text-slate-100',
                t.type === 'error' ? 'border-red-300 dark:border-red-900' : 'border-slate-200 dark:border-slate-700')}>
              <Icon name={icon} className={cx('mt-0.5 h-4 w-4 shrink-0', tone)} strokeWidth={2} />
              <span className="flex-1">{t.message}</span>
              <button onClick={() => remove(t.id)} className="text-slate-400 transition-colors hover:text-slate-900 dark:hover:text-white" aria-label="Dismiss"><Icon name="close" className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
