import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Button, ConfirmDialog, Input, Select } from '../../components/ui/Controls.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { Badge, PageHeader, Section, StatusBadge } from '../../components/ui/Display.jsx';
import { ErrorState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { fmtDate, peso } from '../../lib/format.js';
import { useDebounced, useFetch } from '../../lib/useFetch.js';
import CustomerForm from './CustomerForm.jsx';

/** Read-only directory of registered renter accounts. Suspending accounts stays with the system admin. */
function RenterDirectory() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ q: '', status: '', page: 1 });
  const q = useDebounced(filters.q);
  const list = useFetch('/customers/renters', { ...filters, q });
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value, page: 1 });
  const columns = [
    { header: 'Renter', cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.email}</p></div> },
    { header: 'Contact', cell: (r) => r.phone || '—', hideBelow: 'md' },
    { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    { header: 'With your shop', cell: (r) => r.customer_id ? <span className="tabular-nums">{r.total_transactions} transaction{r.total_transactions === 1 ? '' : 's'}</span> : <span className="text-slate-400">No activity yet</span> },
    { header: 'Last activity', cell: (r) => (r.last_activity ? fmtDate(r.last_activity) : '—'), hideBelow: 'lg' },
    { header: 'Joined', cell: (r) => fmtDate(r.created_at), hideBelow: 'lg' },
  ];
  return (
    <Section flush>
      <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-800">
        <Input label="Search" placeholder="Name, email or phone" value={filters.q} onChange={set('q')} />
        <Select label="Status" value={filters.status} onChange={set('status')}><option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></Select>
      </div>
      {list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <DataTable columns={columns} result={list.data} loading={list.loading} onPage={(page) => setFilters({ ...filters, page })}
          onRowClick={(r) => r.customer_id && navigate(`/owner/customers/${r.customer_id}`)}
          empty={{ title: 'No renter accounts found', hint: 'Accounts appear here as renters sign up on the platform.' }} />
      )}
    </Section>
  );
}

export default function CustomersPage() {
  const navigate = useNavigate();
  const isOwner = useAuth().user.role === 'owner'; // staff can register and edit customers, but only the owner can delete them
  const toast = useToast();
  const [filters, setFilters] = useState({ q: '', source: '', sort: 'newest', page: 1 });
  const q = useDebounced(filters.q);
  const list = useFetch('/customers', { ...filters, q });
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value, page: 1 });
  const [tab, setTab] = useState('customers');
  const onSaved = (saved, { thenTransaction } = {}) => {
    setEditing(undefined); list.reload();
    if (thenTransaction) navigate(`/owner/transactions?new=1&customer=${saved.id}`);
  };

  const remove = async () => {
    setBusy(true);
    try { await api.del(`/customers/${deleting.id}`); toast.success('Customer deleted'); setDeleting(null); list.reload(); }
    catch (e) { toast.error(e.message); setDeleting(null); } finally { setBusy(false); }
  };

  const columns = [
    { header: 'Customer', cell: (c) => <div><p className="font-medium">{c.name}</p><p className="text-xs text-slate-500">{c.email || 'No email'}</p></div> },
    { header: 'Contact', cell: (c) => c.phone || '—', hideBelow: 'md' },
    { header: 'Source', cell: (c) => <Badge tone={c.user_id ? 'violet' : 'gray'}>{c.user_id ? 'Renter account' : 'Walk-in'}</Badge>, hideBelow: 'lg' },
    { header: 'Transactions', cell: (c) => <span className="tabular-nums">{c.total_transactions}{c.overdue_count > 0 && <Badge tone="red" className="ml-2">{c.overdue_count} overdue</Badge>}</span> },
    { header: 'Total paid', cell: (c) => <span className="tabular-nums">{peso(c.total_paid)}</span>, hideBelow: 'md' },
    { header: 'Registered', cell: (c) => fmtDate(c.created_at), hideBelow: 'lg' },
    { header: '', className: 'text-right', cell: (c) => (
      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
        {isOwner && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleting(c)}>Delete</Button>}
      </div>) },
  ];

  return (
    <>
      <PageHeader title="Customers" subtitle="Everyone who rents or buys from your shop." actions={<Button onClick={() => setEditing(null)}>Register walk-in customer</Button>} />
      <div role="tablist" className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {[['customers', 'Customers'], ['accounts', 'Renter accounts']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${tab === k ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>{l}</button>
        ))}
      </div>
      {tab === 'accounts' ? <RenterDirectory /> : <>
      <Section flush>
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3 dark:border-slate-800">
          <Input label="Search" placeholder="Name, email or phone" value={filters.q} onChange={set('q')} />
          <Select label="Source" value={filters.source} onChange={set('source')}><option value="">All customers</option><option value="account">Renter accounts</option><option value="walkin">Walk-ins</option></Select>
          <Select label="Sort by" value={filters.sort} onChange={set('sort')}><option value="newest">Newest first</option><option value="name">Name (A–Z)</option><option value="spent">Highest spend</option></Select>
        </div>
        {list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : (
          <DataTable columns={columns} result={list.data} loading={list.loading} onPage={(page) => setFilters({ ...filters, page })}
            onRowClick={(c) => navigate(`/owner/customers/${c.id}`)}
            empty={{ title: 'No customers found', hint: 'Register a walk-in customer, or customers appear automatically when a renter sends you a request.' }} />
        )}
      </Section></>}
      {editing !== undefined && <CustomerForm customer={editing} onClose={() => setEditing(undefined)} onSaved={onSaved} />}
      <ConfirmDialog open={!!deleting} danger loading={busy} title="Delete customer" confirmLabel="Delete" onCancel={() => setDeleting(null)} onConfirm={remove}
        message={deleting ? `Delete ${deleting.name}? Customers with transaction history cannot be deleted.` : ''} />
    </>
  );
}
