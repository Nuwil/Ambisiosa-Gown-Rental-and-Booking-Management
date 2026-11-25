import { useState } from 'react';
import { api } from '../api/client.js';
import { useToast } from './ui/Toast.jsx';
import { Button, ConfirmDialog, Input, Modal, Select } from './ui/Controls.jsx';
import { Badge, StatusBadge, TypeBadge } from './ui/Display.jsx';
import DataTable from './ui/DataTable.jsx';
import Icon from './ui/Icon.jsx';
import { cx, fmtDate, peso, todayISO } from '../lib/format.js';
import { dueInfo } from '../lib/due.js';

export const ItemThumb = ({ url, name, className = 'h-12 w-12' }) => (
  url ? <img src={url} alt={name} loading="lazy" className={`${className} rounded-lg object-cover`} />
    : <div className={`${className} flex items-center justify-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-600 dark:bg-brand-800/30`} aria-hidden="true">{(name || '?').slice(0, 2).toUpperCase()}</div>
);

const STATUS_CHIPS = [['', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['active', 'Active'], ['overdue', 'Overdue'], ['completed', 'Completed'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled']];

/** Reusable filter bar bound to a params object: search + status chips up front, the rest behind "Filters". */
export function TransactionFilters({ value, onChange, categories, showSearch = true }) {
  const [open, setOpen] = useState(false);
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value, page: 1 });
  const extra = ['type', 'category_id', 'from', 'to'].filter((k) => value[k]).length;
  const clearable = extra > 0 || value.status || value.q;
  return (
    <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-end gap-2">
        {showSearch && <Input className="min-w-[12rem] flex-1" label="Search" placeholder="Item, customer or #ID" value={value.q || ''} onChange={set('q')} />}
        <Button type="button" variant="secondary" aria-expanded={open} aria-controls="tx-more-filters" onClick={() => setOpen((o) => !o)}>
          <Icon name="filter" className="h-4 w-4" />Filters{extra > 0 && <span className="ml-0.5 rounded-full bg-brand-600 px-1.5 text-[10px] font-medium text-white">{extra}</span>}
          <Icon name="chevron-down" className={cx('h-4 w-4 transition-transform duration-300', open && 'rotate-180')} />
        </Button>
      </div>
      <div role="group" aria-label="Status" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {STATUS_CHIPS.map(([v, label]) => {
          const on = (value.status || '') === v;
          return (
            <button key={v} type="button" aria-pressed={on} onClick={() => onChange({ ...value, status: v, page: 1 })}
              className={cx('shrink-0 rounded-md border px-3 py-1 text-xs font-medium transition-colors',
                on ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                  : cx('border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300', v === 'overdue' && 'text-red-700 dark:text-red-400'))}>
              {label}
            </button>
          );
        })}
        {clearable && <button type="button" onClick={() => onChange({ page: 1 })} className="ml-1 shrink-0 px-2 text-xs text-slate-500 underline-offset-2 hover:underline">Clear</button>}
      </div>
      <div id="tx-more-filters" inert={!open} className={cx('grid transition-[grid-template-rows,opacity] duration-300 ease-out', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="overflow-hidden">
          <div className="grid gap-3 pb-1 pt-1 sm:grid-cols-2 lg:grid-cols-4">
            <Select label="Type" value={value.type || ''} onChange={set('type')}><option value="">All types</option><option value="rental">Rental</option><option value="purchase">Purchase</option></Select>
            {categories && <Select label="Category" value={value.category_id || ''} onChange={set('category_id')}><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
            <Input label="From" type="date" value={value.from || ''} onChange={set('from')} />
            <Input label="To" type="date" value={value.to || ''} onChange={set('to')} />
          </div>
        </div>
      </div>
    </div>
  );
}

const DUE_ROW = { overdue: 'bg-red-50/60 dark:bg-red-950/20', soon: 'bg-amber-50/60 dark:bg-amber-950/15' };
const PAY_TEXT = { unpaid: 'text-red-700 dark:text-red-400', partial: 'text-amber-700 dark:text-amber-400', paid: 'text-emerald-700 dark:text-emerald-400', refunded: 'text-slate-500' };

const itemCell = (t) => (
  <div className="flex items-center gap-3">
    <ItemThumb url={t.image_url} name={t.item_name} className="h-10 w-10 shrink-0" />
    <div className="min-w-0">
      <p className="truncate font-medium">{t.item_name}</p>
      <p className="truncate text-xs text-slate-500"><span className="tabular-nums">#{t.id}</span> · {t.type === 'rental' ? 'Rental' : 'Purchase'} · {t.size} × {t.quantity}</p>
    </div>
  </div>
);

const periodCell = (t) => {
  if (t.type !== 'rental') return <span className="text-slate-400">—</span>;
  const due = dueInfo(t);
  return (
    <div className="space-y-1">
      <p className="whitespace-nowrap">{fmtDate(t.start_date)} → <span className={cx(due && 'font-medium', due?.tone === 'red' && 'text-red-700 dark:text-red-400', due?.tone === 'amber' && 'text-amber-700 dark:text-amber-400')}>{fmtDate(t.expected_return)}</span></p>
      {due ? <Badge tone={due.tone}>{due.label}</Badge> : <p className="text-xs text-slate-500">{t.duration_days} day{t.duration_days === 1 ? '' : 's'}</p>}
    </div>
  );
};

export function TransactionsTable({ result, loading, onPage, onRowClick, mode = 'owner', empty }) {
  const cols = [
    { header: 'Item', cell: itemCell },
    mode !== 'renter' && { header: 'Customer', cell: (t) => t.customer_name },
    (mode === 'renter' || mode === 'admin') && { header: 'Shop', cell: (t) => t.shop_name, hideBelow: 'lg' },
    { header: 'Rental period', cell: periodCell },
    { header: 'Amount', cell: (t) => <><span className="tabular-nums">{peso(t.amount)}</span><span className={cx('block text-xs capitalize', PAY_TEXT[t.payment_status])}>{t.payment_status}</span></> },
    { header: 'Status', cell: (t) => <StatusBadge status={t.display_status} /> },
  ].filter(Boolean);
  return <DataTable columns={cols} result={result} loading={loading} onPage={onPage} onRowClick={onRowClick} rowClassName={(t) => DUE_ROW[dueInfo(t)?.level]} empty={empty || { title: 'No transactions found', hint: 'Try changing the filters.' }} />;
}

/**
 * Detail dialog. Owners get lifecycle actions; renters can cancel their own pending requests.
 * Every action is re-validated server-side — these buttons only reflect what is currently allowed.
 */
export function TransactionDetail({ id, role, onClose, onChanged }) {
  const toast = useToast();
  const [tx, setTx] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [pay, setPay] = useState({ amount: '', method: 'cash' });
  const [returnDate, setReturnDate] = useState(todayISO());
  const [loadedId, setLoadedId] = useState(null);

  if (id && loadedId !== id) {
    setLoadedId(id);
    api.get(`/transactions/${id}`).then(setTx).catch((e) => { toast.error(e.message); onClose(); });
  }
  const close = () => { setTx(null); setLoadedId(null); setConfirm(null); onClose(); };

  const run = async (body) => {
    setBusy(true);
    try {
      const next = await api.post(`/transactions/${tx.id}/action`, body);
      setTx((p) => ({ ...p, ...next })); toast.success('Transaction updated'); setConfirm(null); onChanged?.();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const addPayment = async () => {
    setBusy(true);
    try { const next = await api.post(`/transactions/${tx.id}/payments`, { amount: Number(pay.amount), method: pay.method }); setTx(next); setPay({ amount: '', method: 'cash' }); toast.success('Payment recorded'); onChanged?.(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  if (!id) return null;
  const balance = tx ? Number(tx.amount) - Number(tx.amount_paid) : 0;
  const actions = [];
  if (tx && role === 'owner') {
    if (tx.status === 'pending') actions.push(['approve', 'Approve', 'primary'], ['reject', 'Reject', 'danger']);
    if (tx.status === 'approved' && tx.type === 'rental') actions.push(['release', 'Release to renter', 'primary']);
    if (tx.status === 'active') actions.push(['return', 'Record return', 'primary']);
    if (tx.status === 'approved' && tx.type === 'purchase') actions.push(['finalize', 'Finalize purchase', 'primary']);
    if (['pending', 'approved'].includes(tx.status)) actions.push(['cancel', 'Cancel', 'secondary']);
  }
  if (tx && role === 'renter' && tx.status === 'pending') actions.push(['cancel', 'Cancel request', 'danger']);

  const CONFIRM_COPY = {
    approve: 'Approve this request? Stock will be reserved for the requested period.',
    reject: 'Reject this request? The renter will be notified.',
    release: 'Confirm the item has been handed to the renter. The rental will become active.',
    cancel: 'Cancel this transaction? Reserved stock (if any) is released.',
    finalize: 'Finalize the purchase? Stock will be permanently deducted.',
  };

  return (
    <>
      <Modal open title={tx ? `Transaction #${tx.id}` : 'Loading…'} onClose={close} size="lg"
        footer={tx && actions.map(([a, label, v]) => <Button key={a} variant={v} loading={busy} onClick={() => setConfirm(a)}>{label}</Button>)}>
        {!tx ? <p className="py-8 text-center text-sm text-slate-500">Loading…</p> : (
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <ItemThumb url={tx.image_url} name={tx.item_name} className="h-20 w-20 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold">{tx.item_name}</p>
                <p className="text-sm text-slate-500">{tx.category} · Size {tx.size} · Qty {tx.quantity}</p>
                <div className="mt-2 flex flex-wrap gap-2"><TypeBadge type={tx.type} /><StatusBadge status={tx.display_status} /><StatusBadge status={tx.payment_status} /></div>
              </div>
            </div>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {[
                ['Customer', tx.customer_name], ['Shop', tx.shop_name],
                ...(tx.type === 'rental' ? [['Rental date', fmtDate(tx.start_date)], ['Expected return', fmtDate(tx.expected_return)], ['Actual return', fmtDate(tx.actual_return)], ['Duration', `${tx.duration_days} day(s)`]] : []),
                ['Amount', peso(tx.amount)], ['Paid / balance', `${peso(tx.amount_paid)} / ${peso(balance)}`], ['Requested', fmtDate(tx.created_at)],
              ].map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>)}
            </dl>
            {tx.notes && <div><p className="text-xs text-slate-500">Notes</p><p className="whitespace-pre-line text-sm">{tx.notes}</p></div>}
            {tx.payments?.length > 0 && (
              <div><p className="mb-1 text-xs text-slate-500">Payments</p>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
                  {tx.payments.map((p) => <li key={p.id} className="flex justify-between px-3 py-2"><span>{fmtDate(p.paid_at)} · {p.method || '—'}</span><span className="tabular-nums">{peso(p.amount)}</span></li>)}
                </ul></div>
            )}
            {role === 'owner' && !['rejected', 'cancelled'].includes(tx.status) && balance > 0 && (
              <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                <Input label="Record payment" type="number" min="0" step="0.01" placeholder={`Balance ${peso(balance)}`} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className="w-40" />
                <Select label="Method" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="cash">Cash</option><option value="gcash">GCash</option><option value="bank">Bank transfer</option><option value="card">Card</option></Select>
                <Button variant="secondary" loading={busy} disabled={!(Number(pay.amount) > 0)} onClick={addPayment}>Add payment</Button>
              </div>
            )}
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!confirm} loading={busy} danger={['reject', 'cancel'].includes(confirm)} title={confirm === 'return' ? 'Record return' : 'Please confirm'}
        message={confirm !== 'return' ? CONFIRM_COPY[confirm] : 'Choose the date the item was actually returned.'}
        confirmLabel={confirm ? confirm[0].toUpperCase() + confirm.slice(1) : 'Confirm'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run({ action: confirm, ...(confirm === 'return' ? { actual_return: returnDate } : {}), ...(confirm === 'finalize' && balance > 0 ? { mark_paid: false } : {}) })}>
        {confirm === 'return' && <Input className="mt-3" label="Return date" type="date" max={todayISO()} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />}
      </ConfirmDialog>
    </>
  );
}
