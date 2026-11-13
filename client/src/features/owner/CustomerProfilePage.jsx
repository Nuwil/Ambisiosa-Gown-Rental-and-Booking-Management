import { useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { TransactionDetail, TransactionFilters, TransactionsTable } from '../../components/TransactionViews.jsx';
import { Button, ConfirmDialog } from '../../components/ui/Controls.jsx';
import { Badge, PageHeader, Section, StatCard, StatGrid } from '../../components/ui/Display.jsx';
import DocumentCard from '../../components/ui/DocumentCard.jsx';
import { Async } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { fmtDate, peso } from '../../lib/format.js';
import { useDebounced, useFetch } from '../../lib/useFetch.js';
import CustomerForm from './CustomerForm.jsx';

export default function CustomerProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isOwner = useAuth().user.role === 'owner';
  const toast = useToast();
  const customer = useFetch(`/customers/${id}`);
  const categories = useFetch('/inventory/manage/categories');
  const [filters, setFilters] = useState({ page: 1 });
  const q = useDebounced(filters.q);
  const history = useFetch(`/customers/${id}/transactions`, { ...filters, q });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [openTx, setOpenTx] = useState(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try { await api.del(`/customers/${id}`); toast.success('Customer deleted'); navigate('/owner/customers'); }
    catch (e) { toast.error(e.message); setDeleting(false); } finally { setBusy(false); }
  };
  const refresh = () => { customer.reload(); history.reload(); };

  return (
    <Async state={customer}>
      {(c) => (
        <>
          <p className="mb-4 text-sm"><Link to="/owner/customers" className="group inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-900 dark:hover:text-white"><Icon name="arrow-left" className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />Customers</Link></p>
          <PageHeader title={c.name} subtitle={`Customer since ${fmtDate(c.created_at)}`}
            actions={<><Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>{isOwner && <Button variant="secondary" className="text-red-600" onClick={() => setDeleting(true)}>Delete</Button>}</>} />
          <StatGrid className="mb-5 !grid-cols-1 sm:!grid-cols-3">
            <StatCard label="Transactions" value={c.total_transactions} />
            <StatCard label="Total paid" value={peso(c.total_paid)} />
            <StatCard label="Overdue" value={c.overdue_count} tone={c.overdue_count ? 'danger' : undefined} />
          </StatGrid>
          {/* 1 column on phones, info full-width + two documents side by side on lg, three equal columns on xl. */}
          <div className="mb-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <Section title="Personal information" className="lg:col-span-2 xl:col-span-1">
              <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">
                {[['Full name', c.name], ['Contact number', c.phone || '—'], ['Email', c.email || '—'], ['Address', c.address || '—'], ['Registered', fmtDate(c.created_at)]].map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-slate-500">{k}</dt><dd className="break-words font-medium">{v}</dd></div>)}
                <div><dt className="text-xs text-slate-500">Account type</dt><dd><Badge tone={c.user_id ? 'violet' : 'gray'}>{c.user_id ? 'Linked renter account' : 'Walk-in customer'}</Badge></dd></div>
                {c.notes && <div className="sm:col-span-2 lg:col-span-3 xl:col-span-1"><dt className="text-xs text-slate-500">Notes</dt><dd className="whitespace-pre-line">{c.notes}</dd></div>}
              </dl>
            </Section>
            <DocumentCard title="Valid ID" icon="id-card" url={c.valid_id_url} emptyHint="No Valid ID has been uploaded for this customer." />
            <DocumentCard title="Signed contract" icon="contract" url={c.signed_contract_url} emptyHint="No signed contract has been uploaded yet." />
          </div>
          <Section title="Rental & purchase history" flush>
            <TransactionFilters value={filters} onChange={setFilters} categories={categories.data} />
            <TransactionsTable result={history.data} loading={history.loading} mode="owner" onPage={(page) => setFilters({ ...filters, page })} onRowClick={(t) => setOpenTx(t.id)}
              empty={{ title: 'No transactions yet', hint: 'Rentals and purchases for this customer will be listed here.' }} />
          </Section>
          <TransactionDetail id={openTx} role="owner" onClose={() => setOpenTx(null)} onChanged={refresh} />
          {editing && <CustomerForm customer={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); customer.reload(); }} />}
          <ConfirmDialog open={deleting} danger loading={busy} title="Delete customer" confirmLabel="Delete" onCancel={() => setDeleting(false)} onConfirm={remove}
            message={`Delete ${c.name}? Customers with transaction history cannot be deleted.`} />
        </>
      )}
    </Async>
  );
}
