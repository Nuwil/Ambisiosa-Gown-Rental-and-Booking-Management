import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Button } from '../../components/ui/Controls.jsx';
import { PageHeader } from '../../components/ui/Display.jsx';
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { cx } from '../../lib/format.js';
import { announceNotificationsChanged, describeNotification, NOTIFICATION_GROUPS, notificationTarget, shortStamp } from '../../lib/notifications.js';
import { useFetch } from '../../lib/useFetch.js';

const TABS = [['all', 'All'], ['unread', 'Unread'], ...NOTIFICATION_GROUPS];
const iconBtn = 'rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/60 dark:hover:text-white';

/** Gmail-style inbox of the signed-in user's notifications: dense rows, tabs, bulk actions, click to open the record. */
export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const list = useFetch('/notifications', { limit: 200 });
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => (list.data?.data ?? []).map((n) => ({ ...n, ...describeNotification(n), unread: !n.read_at })), [list.data]);
  const visible = useMemo(() => rows.filter((n) => (tab === 'all' ? true : tab === 'unread' ? n.unread : n.group === tab)), [rows, tab]);
  const unreadTotal = rows.filter((n) => n.unread).length;
  const chosen = visible.filter((n) => selected.has(n.id));
  const allChosen = visible.length > 0 && chosen.length === visible.length;

  const toggle = (id) => setSelected((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(visible.map((n) => n.id)));

  const act = async (path, ids, message) => {
    if (!ids.length || busy) return;
    setBusy(true);
    try {
      await api.post(`/notifications/${path}`, { ids });
      setSelected(new Set());
      await list.reload(); announceNotificationsChanged();
      if (message) toast.success(message);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const markAllRead = async () => {
    setBusy(true);
    try { await api.post('/notifications/read', {}); await list.reload(); announceNotificationsChanged(); toast.success('All notifications marked as read'); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const open = (n) => {
    if (n.unread) api.post('/notifications/read', { ids: [n.id] }).then(() => { list.reload(); announceNotificationsChanged(); }).catch(() => {}); // best effort, never blocks navigation
    const to = notificationTarget(n, user?.role);
    if (to) navigate(to);
  };

  const ids = chosen.map((n) => n.id);
  return (
    <>
      <PageHeader title="Notifications" subtitle="Requests, rental updates and reminders in one place." />
      <div className="card overflow-hidden">
        <div role="tablist" aria-label="Filter notifications" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2 dark:border-slate-800">
          {TABS.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setSelected(new Set()); }}
              className={cx('relative shrink-0 px-3 py-3 text-sm transition-colors', tab === key ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white')}>
              {label}{key === 'unread' && unreadTotal > 0 && <span className="ml-1.5 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-medium text-white">{unreadTotal}</span>}
              {tab === key && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-brand-600" />}
            </button>
          ))}
        </div>

        <div className="flex min-h-12 flex-wrap items-center gap-1.5 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
          <input type="checkbox" aria-label="Select all" checked={allChosen} onChange={toggleAll} disabled={!visible.length} className="mr-2 h-4 w-4 accent-slate-900 dark:accent-slate-200" />
          {chosen.length ? (
            <>
              <span className="mr-2 text-xs text-slate-500">{chosen.length} selected</span>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => act('read', ids, 'Marked as read')}><Icon name="check" className="h-4 w-4" />Mark read</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => act('unread', ids, 'Marked as unread')}><Icon name="mail" className="h-4 w-4" />Mark unread</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => act('delete', ids, `Deleted ${ids.length} notification${ids.length === 1 ? '' : 's'}`)}><Icon name="trash" className="h-4 w-4" />Delete</Button>
            </>
          ) : (
            <>
              <span className="text-xs text-slate-500">{visible.length} notification{visible.length === 1 ? '' : 's'}{unreadTotal > 0 && ` · ${unreadTotal} unread`}</span>
              <div className="flex-1" />
              {unreadTotal > 0 && <Button size="sm" variant="secondary" disabled={busy} onClick={markAllRead}><Icon name="check" className="h-4 w-4" />Mark all as read</Button>}
            </>
          )}
          {list.loading && <Spinner className="ml-2 h-4 w-4" />}
        </div>

        {list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : !visible.length && !list.loading ? (
          <EmptyState title={tab === 'unread' ? "You're all caught up" : 'No notifications here'} hint={tab === 'all' ? 'New requests, status changes and reminders will show up here.' : 'Try another tab.'} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {visible.map((n) => (
              <li key={n.id}>
                <div role="link" tabIndex={0} onClick={() => open(n)} onKeyDown={(e) => { if (e.key === 'Enter') open(n); }}
                  className={cx('group flex cursor-pointer items-center gap-3 px-4 py-2 text-sm outline-none transition-colors focus-visible:bg-slate-100 hover:bg-slate-100/70 dark:focus-visible:bg-slate-800/60 dark:hover:bg-slate-800/50',
                    n.unread ? 'bg-brand-50/50 font-semibold dark:bg-brand-800/10' : 'text-slate-600 dark:text-slate-400')}>
                  <input type="checkbox" aria-label={`Select: ${n.title}`} checked={selected.has(n.id)} onChange={() => toggle(n.id)} onClick={(e) => e.stopPropagation()} className="h-4 w-4 shrink-0 accent-slate-900 dark:accent-slate-200" />
                  <span aria-hidden="true" className={cx('h-2 w-2 shrink-0 rounded-full', n.unread ? 'bg-brand-600' : 'bg-transparent')} />
                  <span className={cx('hidden w-28 shrink-0 truncate text-xs sm:block', n.urgent ? 'text-red-700 dark:text-red-400' : n.unread ? 'text-slate-900 dark:text-white' : 'text-slate-500')}>{n.label}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className={n.unread ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}>{n.title}</span>
                    <span className="font-normal text-slate-500"> — {n.message}</span>
                  </span>
                  <span className="relative flex h-7 w-24 shrink-0 items-center justify-end">
                    <span className={cx('whitespace-nowrap text-xs tabular-nums group-hover:invisible group-focus-within:invisible', n.unread ? 'font-semibold text-slate-900 dark:text-white' : 'font-normal text-slate-500')}>{shortStamp(n.created_at)}</span>
                    <span className="absolute inset-y-0 right-0 hidden items-center gap-0.5 group-hover:flex group-focus-within:flex" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className={iconBtn} aria-label={n.unread ? 'Mark as read' : 'Mark as unread'} title={n.unread ? 'Mark as read' : 'Mark as unread'} onClick={() => act(n.unread ? 'read' : 'unread', [n.id])}><Icon name={n.unread ? 'check' : 'mail'} className="h-4 w-4" /></button>
                      <button type="button" className={iconBtn} aria-label="Delete" title="Delete" onClick={() => act('delete', [n.id], 'Notification deleted')}><Icon name="trash" className="h-4 w-4" /></button>
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
