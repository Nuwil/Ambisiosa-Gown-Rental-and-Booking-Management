import { useState } from 'react';
import { TransactionDetail, TransactionFilters, TransactionsTable, ItemThumb } from '../../components/TransactionViews.jsx';
import { Input } from '../../components/ui/Controls.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { Badge, PageHeader, Section, StatusBadge } from '../../components/ui/Display.jsx';
import { ErrorState } from '../../components/ui/Feedback.jsx';
import { fmtDate, peso } from '../../lib/format.js';
import { useDebounced, useFetch } from '../../lib/useFetch.js';

const TABS = [['transactions', 'Transactions'], ['inventory', 'Inventory'], ['customers', 'Customers']];

function Transactions() {
  const [filters, setFilters] = useState({ page: 1 });
  const q = useDebounced(filters.q);
  const list = useFetch('/transactions', { ...filters, q });
  const [open, setOpen] = useState(null);
  return (
    <>
      <TransactionFilters value={filters} onChange={setFilters} />
      {list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <TransactionsTable result={list.data} loading={list.loading} mode="admin" onPage={(page) => setFilters({ ...filters, page })} onRowClick={(t) => setOpen(t.id)} />
      )}
      <TransactionDetail id={open} role="admin" onClose={() => setOpen(null)} />
    </>
  );
}

function Inventory() {
  const [filters, setFilters] = useState({ q: '', page: 1 });
  const q = useDebounced(filters.q);
  const list = useFetch('/inventory/admin/items', { ...filters, q });
  const columns = [
    { header: 'Item', cell: (i) => <div className="flex items-center gap-3"><ItemThumb url={i.images?.[0]?.url} name={i.name} className="h-10 w-10 shrink-0" /><div className="min-w-0"><p className="truncate font-medium">{i.name}</p><p className="text-xs text-slate-500">#{i.id} · {i.category}</p></div></div> },
    { header: 'Shop', cell: (i) => i.shop_name || i.owner_name, hideBelow: 'md' },
    { header: 'Stock', cell: (i) => <span className="tabular-nums">{i.available_quantity} / {i.total_quantity}</span> },
    { header: 'Rent / day', cell: (i) => <span className="tabular-nums">{peso(i.rental_price)}</span>, hideBelow: 'md' },
    { header: 'Added', cell: (i) => fmtDate(i.created_at), hideBelow: 'lg' },
    { header: 'Status', cell: (i) => <StatusBadge status={i.availability_status} /> },
  ];
  return (
    <>
      <div className="border-b border-slate-200 p-4 dark:border-slate-800"><Input className="max-w-sm" label="Search" placeholder="Item or shop" value={filters.q} onChange={(e) => setFilters({ q: e.target.value, page: 1 })} /></div>
      {list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : <DataTable columns={columns} result={list.data} loading={list.loading} onPage={(page) => setFilters({ ...filters, page })} />}
    </>
  );
}

function Customers() {
  const [filters, setFilters] = useState({ q: '', page: 1 });
  const q = useDebounced(filters.q);
  const list = useFetch('/customers', { ...filters, q });
  const columns = [
    { header: 'Customer', cell: (c) => <div><p className="font-medium">{c.name}</p><p className="text-xs text-slate-500">{c.email || 'No email'}</p></div> },
    { header: 'Shop', cell: (c) => c.shop_name, hideBelow: 'md' },
    { header: 'Source', cell: (c) => <Badge tone={c.user_id ? 'violet' : 'gray'}>{c.user_id ? 'Renter account' : 'Walk-in'}</Badge>, hideBelow: 'lg' },
    { header: 'Transactions', cell: (c) => <span className="tabular-nums">{c.total_transactions}</span> },
    { header: 'Total paid', cell: (c) => <span className="tabular-nums">{peso(c.total_paid)}</span>, hideBelow: 'md' },
    { header: 'Registered', cell: (c) => fmtDate(c.created_at), hideBelow: 'lg' },
  ];
  return (
    <>
      <div className="border-b border-slate-200 p-4 dark:border-slate-800"><Input className="max-w-sm" label="Search" placeholder="Name, email or phone" value={filters.q} onChange={(e) => setFilters({ q: e.target.value, page: 1 })} /></div>
      {list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : <DataTable columns={columns} result={list.data} loading={list.loading} onPage={(page) => setFilters({ ...filters, page })} />}
    </>
  );
}

export default function OversightPage() {
  const [tab, setTab] = useState('transactions');
  return (
    <>
      <PageHeader title="System oversight" subtitle="Read-only view of every shop's transactions, inventory and customers." />
      <div className="mb-4 flex gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist">
        {TABS.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === v ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>{l}</button>
        ))}
      </div>
      <Section flush>{tab === 'transactions' ? <Transactions /> : tab === 'inventory' ? <Inventory /> : <Customers />}</Section>
    </>
  );
}
