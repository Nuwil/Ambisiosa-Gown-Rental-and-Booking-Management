import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useFetch } from '../lib/useFetch.js';
import { fmtDateTime } from '../lib/format.js';
import Icon from '../components/ui/Icon.jsx';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { data, reload } = useFetch('/notifications');

  // light polling keeps the badge fresh without websockets
  useEffect(() => { const t = setInterval(reload, 60000); return () => clearInterval(t); }, [reload]);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const toggle = () => { setOpen((o) => !o); if (!open) reload(); };
  const markAll = async () => { await api.post('/notifications/read', {}); reload(); };
  const unread = data?.unread ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
        <Icon name="bell" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-medium text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="card page-enter absolute right-0 z-40 mt-2 w-[min(22rem,90vw)] overflow-hidden shadow-xl shadow-slate-900/5">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
            <span className="eyebrow">Notifications</span>
            {unread > 0 && <button onClick={markAll} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">Mark all read</button>}
          </div>
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {!data?.data?.length && <li className="px-4 py-6 text-center text-sm text-slate-500">You're all caught up.</li>}
            {data?.data?.map((n) => (
              <li key={n.id} className={`px-4 py-2.5 text-sm ${n.read_at ? 'opacity-60' : ''}`}>
                <p>{n.message}</p>
                <p className="mt-0.5 text-xs text-slate-500">{fmtDateTime(n.created_at)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
