import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { TransactionDetail, TransactionFilters, TransactionsTable } from '../../components/TransactionViews.jsx';
import { Button, Input, Modal, Select, Textarea } from '../../components/ui/Controls.jsx';
import { PageHeader, Section } from '../../components/ui/Display.jsx';
import { ErrorState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { daysBetween, peso, todayISO } from '../../lib/format.js';
import { fieldErrors } from '../../lib/forms.js';
import { useDebounced, useFetch } from '../../lib/useFetch.js';

/** Owner-created transaction for a walk-in / existing customer. It starts as "approved" (stock is reserved). */
function ManualTransaction({ onClose, onCreated, customerId = '' }) {
  const toast = useToast();
  const customers = useFetch('/customers', { pageSize: 100, sort: 'name' });
  const items = useFetch('/inventory/manage/items', { pageSize: 100 });
  const [form, setForm] = useState({ type: 'rental', customer_id: customerId, item_id: '', variant_id: '', quantity: 1, start_date: todayISO(), expected_return: todayISO(), notes: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const item = useMemo(() => items.data?.data.find((i) => String(i.id) === String(form.item_id)), [items.data, form.item_id]);
  const variant = item?.variants.find((v) => String(v.id) === String(form.variant_id));
  const days = form.type === 'rental' && form.expected_return >= form.start_date ? daysBetween(form.start_date, form.expected_return) : 0;
  const estimate = !item ? 0 : form.type === 'rental' ? Number(item.rental_price) * days * form.quantity : Number(item.purchase_price || 0) * form.quantity;

  const submit = async (e) => {
    e.preventDefault(); setErrors({});
    if (!form.customer_id) return setErrors({ customer_id: 'Choose a customer' });
    if (!form.variant_id) return setErrors({ variant_id: 'Choose an item and size' });
    if (form.type === 'rental' && form.expected_return < form.start_date) return setErrors({ expected_return: 'Return date must be on or after the rental date' });
    setBusy(true);
    try {
      const base = { type: form.type, customer_id: Number(form.customer_id), variant_id: Number(form.variant_id), quantity: Number(form.quantity), notes: form.notes || null };
      await api.post('/transactions/manual', form.type === 'rental' ? { ...base, start_date: form.start_date, expected_return: form.expected_return } : base);
      toast.success('Transaction created'); onCreated();
    } catch (err) { setErrors(fieldErrors(err)); toast.error(err.message); } finally { setBusy(false); }
  };

  const purchasable = form.type === 'purchase' ? items.data?.data.filter((i) => i.purchase_price != null) : items.data?.data;
  return (
    <Modal open onClose={onClose} title="New transaction" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="manual-tx" loading={busy}>Create</Button></>}>
      <form id="manual-tx" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, item_id: '', variant_id: '' })}><option value="rental">Rental</option><option value="purchase">Purchase</option></Select>
        <Select label="Customer" value={form.customer_id} onChange={set('customer_id')} error={errors.customer_id}>
          <option value="">Select customer…</option>{customers.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select label="Item" value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value, variant_id: '' })}>
          <option value="">Select item…</option>{purchasable?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </Select>
        <Select label="Size" value={form.variant_id} onChange={set('variant_id')} error={errors.variant_id} disabled={!item}>
          <option value="">Select size…</option>{item?.variants.map((v) => <option key={v.id} value={v.id}>{v.size} ({v.available} available today)</option>)}
        </Select>
        <Input label="Quantity" type="number" min="1" max={variant?.total_quantity || undefined} value={form.quantity} onChange={set('quantity')} error={errors.quantity} />
        <div className="hidden sm:block" />
        {form.type === 'rental' && (
          <>
            <Input label="Rental date" type="date" value={form.start_date} onChange={set('start_date')} error={errors.start_date} />
            <Input label="Expected return" type="date" min={form.start_date} value={form.expected_return} onChange={set('expected_return')} error={errors.expected_return} />
          </>
        )}
        <Textarea className="sm:col-span-2" label="Notes" value={form.notes} onChange={set('notes')} />
        {estimate > 0 && <p className="text-sm sm:col-span-2">Estimated amount: <strong>{peso(estimate)}</strong>{days > 0 && <span className="text-slate-500"> ({days} day{days === 1 ? '' : 's'})</span>}</p>}
      </form>
    </Modal>
  );
}

export default function OwnerTransactionsPage() {
  const [filters, setFilters] = useState({ page: 1 });
  const q = useDebounced(filters.q);
  const list = useFetch('/transactions', { ...filters, q });
  const categories = useFetch('/inventory/manage/categories');
  const [openTx, setOpenTx] = useState(null);
  const [params, setParams] = useSearchParams();
  const presetCustomer = params.get('customer') || '';
  const [creating, setCreating] = useState(params.get('new') === '1'); // arrives from "Register & start transaction"
  const closeCreate = () => { setCreating(false); if (params.has('new')) setParams({}, { replace: true }); };

  return (
    <>
      <PageHeader title="Transactions" subtitle="Review requests, release items, record returns and payments." actions={<Button onClick={() => setCreating(true)}>New transaction</Button>} />
      <Section flush>
        <TransactionFilters value={filters} onChange={setFilters} categories={categories.data} />
        {list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : (
          <TransactionsTable result={list.data} loading={list.loading} mode="owner" onPage={(page) => setFilters({ ...filters, page })} onRowClick={(t) => setOpenTx(t.id)} />
        )}
      </Section>
      <TransactionDetail id={openTx} role="owner" onClose={() => setOpenTx(null)} onChanged={list.reload} />
      {creating && <ManualTransaction customerId={presetCustomer} onClose={closeCreate} onCreated={() => { closeCreate(); list.reload(); }} />}
    </>
  );
}
