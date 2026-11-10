import { useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ItemThumb } from '../../components/TransactionViews.jsx';
import { Button, ConfirmDialog, Input, Modal, Select } from '../../components/ui/Controls.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { Badge, PageHeader, Section, StatusBadge } from '../../components/ui/Display.jsx';
import { ErrorState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { peso } from '../../lib/format.js';
import { useDebounced, useFetch } from '../../lib/useFetch.js';
import ItemForm from './ItemForm.jsx';

function CategoryManager({ categories, onClose, onChanged }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(null); // { id, name }
  const [busy, setBusy] = useState(false);

  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); onChanged(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const add = (e) => { e.preventDefault(); if (name.trim().length < 2) return toast.error('Category name must be at least 2 characters'); run(async () => { await api.post('/inventory/manage/categories', { name }); setName(''); }, 'Category added'); };

  return (
    <Modal open onClose={onClose} title="Manage categories">
      <form onSubmit={add} className="mb-4 flex items-end gap-2"><Input className="flex-1" label="New category" value={name} onChange={(e) => setName(e.target.value)} /><Button type="submit" loading={busy}>Add</Button></form>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            {renaming?.id === c.id ? (
              <>
                <input className="input" aria-label="Category name" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
                <Button size="sm" loading={busy} onClick={() => run(async () => { await api.put(`/inventory/manage/categories/${c.id}`, { name: renaming.name }); setRenaming(null); }, 'Category renamed')}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <span className="flex-1">{c.name} <span className="text-xs text-slate-500">· {c.item_count} item{c.item_count === 1 ? '' : 's'}</span></span>
                <Button size="sm" variant="ghost" onClick={() => setRenaming({ id: c.id, name: c.name })}>Rename</Button>
                <Button size="sm" variant="ghost" className="text-red-600" disabled={busy} onClick={() => run(() => api.del(`/inventory/manage/categories/${c.id}`), 'Category deleted')}>Delete</Button>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">A category can only be deleted when it has no items (including archived ones).</p>
    </Modal>
  );
}

export default function InventoryPage() {
  const toast = useToast();
  const isOwner = useAuth().user.role === 'owner'; // staff manage stock and items; archiving and categories are owner-only
  const [filters, setFilters] = useState({ q: '', category_id: '', archived: '0', page: 1 });
  const q = useDebounced(filters.q);
  const list = useFetch('/inventory/manage/items', { ...filters, q });
  const categories = useFetch('/inventory/manage/categories');
  const [editing, setEditing] = useState(undefined); // undefined closed | null new | item
  const [managing, setManaging] = useState(false);
  const [toggling, setToggling] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value, page: 1 });
  const archivedView = filters.archived === '1';

  const toggleArchive = async () => {
    setBusy(true);
    try {
      await (archivedView ? api.post(`/inventory/manage/items/${toggling.id}/restore`) : api.del(`/inventory/manage/items/${toggling.id}`));
      toast.success(archivedView ? 'Item restored' : 'Item archived'); setToggling(null); list.reload(); categories.reload();
    } catch (e) { toast.error(e.message); setToggling(null); } finally { setBusy(false); }
  };

  const columns = [
    { header: 'Item', cell: (i) => (
      <div className="flex items-center gap-3">
        <ItemThumb url={i.images[0]?.url} name={i.name} className="h-12 w-12 shrink-0" />
        <div className="min-w-0"><p className="truncate font-medium">{i.name}</p><p className="truncate text-xs text-slate-500">#{i.id} · {i.category}{i.color ? ` · ${i.color}` : ''} · <span className="capitalize">{i.condition_status.replace('_', ' ')}</span></p></div>
      </div>) },
    { header: 'Sizes', hideBelow: 'lg', cell: (i) => <div className="flex flex-wrap gap-1">{i.variants.map((v) => <Badge key={v.id} tone={v.available > 0 ? 'gray' : 'red'}>{v.size}: {v.available}/{v.total_quantity}</Badge>)}</div> },
    { header: 'Stock', hideBelow: 'md', cell: (i) => <span className="whitespace-nowrap tabular-nums">{i.available_quantity} / {i.total_quantity}</span> },
    { header: 'Rent / day', hideBelow: 'md', cell: (i) => <span className="tabular-nums">{peso(i.rental_price)}</span> },
    { header: 'Buy', hideBelow: 'lg', cell: (i) => <span className="tabular-nums">{i.purchase_price != null ? peso(i.purchase_price) : '—'}</span> },
    { header: 'Status', cell: (i) => <StatusBadge status={i.availability_status} /> },
    { header: '', className: 'text-right', cell: (i) => (
      <div className="flex justify-end gap-1">
        {!archivedView && <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>Edit</Button>}
        {isOwner && <Button size="sm" variant="ghost" className={archivedView ? '' : 'text-red-600'} onClick={() => setToggling(i)}>{archivedView ? 'Restore' : 'Archive'}</Button>}
      </div>) },
  ];

  return (
    <>
      <PageHeader title="Inventory" subtitle="Gowns, suits, costumes and traditional wear you rent out or sell."
        actions={<>{isOwner && <Button variant="secondary" onClick={() => setManaging(true)}>Categories</Button>}<Button onClick={() => setEditing(null)} disabled={!categories.data?.length}>Add item</Button></>} />
      <Section flush>
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3 dark:border-slate-800">
          <Input label="Search" placeholder="Item name, color…" value={filters.q} onChange={set('q')} />
          <Select label="Category" value={filters.category_id} onChange={set('category_id')}><option value="">All categories</option>{categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select label="Show" value={filters.archived} onChange={set('archived')}><option value="0">Active items</option><option value="1">Archived items</option></Select>
        </div>
        {list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : (
          <DataTable columns={columns} result={list.data} loading={list.loading} onPage={(page) => setFilters({ ...filters, page })}
            empty={{ title: archivedView ? 'No archived items' : 'No inventory yet', hint: archivedView ? 'Archived items appear here and can be restored.' : 'Add your first gown, suit or costume to start taking requests.' }} />
        )}
      </Section>

      {editing !== undefined && categories.data && (
        <ItemForm key={editing?.id ?? 'new'} item={editing} categories={categories.data} onClose={() => setEditing(undefined)}
          onSaved={(_saved, opts) => { list.reload(); categories.reload(); if (!opts?.keepOpen) setEditing(undefined); }} />
      )}
      {managing && categories.data && <CategoryManager categories={categories.data} onClose={() => setManaging(false)} onChanged={() => { categories.reload(); list.reload(); }} />}
      <ConfirmDialog open={!!toggling} loading={busy} danger={!archivedView} title={archivedView ? 'Restore item' : 'Archive item'} confirmLabel={archivedView ? 'Restore' : 'Archive'}
        onCancel={() => setToggling(null)} onConfirm={toggleArchive}
        message={toggling ? (archivedView ? `Restore "${toggling.name}" to your inventory?` : `Archive "${toggling.name}"? It is hidden from renters but its history is kept. Items with open requests or rentals can't be archived.`) : ''} />
    </>
  );
}
