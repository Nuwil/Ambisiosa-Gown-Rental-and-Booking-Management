import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Button, ConfirmDialog, Input, Stepper, Textarea } from '../../components/ui/Controls.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { Badge, PageHeader, TypeBadge } from '../../components/ui/Display.jsx';
import { Async, EmptyState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { cx, peso, todayISO } from '../../lib/format.js';
import { useFetch } from '../../lib/useFetch.js';
import { useCart } from './CartContext.jsx';

function Line({ l, selected, onSelect, onPatch, onRemove, busy }) {
  const max = Math.max(l.quantity, Math.min(100, l.available || l.quantity));
  return (
    <li className={cx('flex gap-3 p-3 sm:p-4', l.issue && 'bg-amber-50/60 dark:bg-amber-950/20')}>
      <input type="checkbox" aria-label={`Select ${l.item_name}`} className="mt-1 h-4 w-4 shrink-0 accent-slate-900 dark:accent-slate-100" checked={selected} onChange={(e) => onSelect(e.target.checked)} />
      <Link to={`/renter/items/${l.item_id}`} className="h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:h-28 sm:w-24 dark:bg-slate-800">
        {l.image_url ? <img src={l.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center font-display text-3xl text-slate-400">{l.item_name.slice(0, 2).toUpperCase()}</div>}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/renter/items/${l.item_id}`} className="block truncate font-medium hover:underline">{l.item_name}</Link>
            <p className="text-xs text-slate-500">{l.shop_name} · Size {l.size} <TypeBadge type={l.type} /></p>
          </div>
          <p className="shrink-0 text-right font-semibold tabular-nums">{peso(l.line_total)}</p>
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-2">
          {l.type === 'rental' && (<>
            <label className="text-xs text-slate-500">From<input type="date" min={todayISO()} value={l.start_date} disabled={busy} aria-label="Rental date"
              onChange={(e) => e.target.value && onPatch({ start_date: e.target.value, ...(l.expected_return < e.target.value ? { expected_return: e.target.value } : {}) })} className="input !w-auto !py-1 text-sm" /></label>
            <label className="text-xs text-slate-500">To<input type="date" min={l.start_date} value={l.expected_return} disabled={busy} aria-label="Return date"
              onChange={(e) => e.target.value && onPatch({ expected_return: e.target.value })} className="input !w-auto !py-1 text-sm" /></label>
          </>)}
          <Stepper size="sm" value={l.quantity} max={max} disabled={busy} onChange={(quantity) => onPatch({ quantity })} />
          <span className="text-xs text-slate-500">
            {l.unit_price != null && (l.type === 'rental' ? `${peso(l.unit_price)}/day × ${l.days ?? '–'} day${l.days === 1 ? '' : 's'}` : `${peso(l.unit_price)} each`)}
          </span>
          <button type="button" onClick={onRemove} className="ml-auto text-xs font-medium text-red-600 hover:underline">Remove</button>
        </div>
        {l.issue && <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400"><Icon name="alert" className="h-3.5 w-3.5 shrink-0" />{l.issue}</p>}
      </div>
    </li>
  );
}

export default function CartPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { setCount } = useCart();
  const state = useFetch('/cart');
  const cart = state.data;
  const [selected, setSelected] = useState(null); // Set<id>; null until first load
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);    // { id } | { all: true }
  const [contact, setContact] = useState({ phone: user.phone || '', address: user.address || '' });
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const seeded = useRef(false);

  useEffect(() => {
    if (!cart) return;
    setCount(cart.lines.length);
    if (!seeded.current) { seeded.current = true; setSelected(new Set(cart.lines.filter((l) => !l.issue).map((l) => l.id))); }
    else setSelected((s) => new Set([...s].filter((id) => cart.lines.some((l) => l.id === id))));
  }, [cart, setCount]);

  const chosen = useMemo(() => (cart?.lines || []).filter((l) => selected?.has(l.id)), [cart, selected]);
  const blocked = chosen.filter((l) => l.issue);
  const subtotal = chosen.reduce((n, l) => n + l.line_total, 0);
  const hasPurchase = chosen.some((l) => l.type === 'purchase');
  const allSelected = cart?.lines.length > 0 && chosen.length === cart.lines.length;

  const mutate = async (fn) => {
    setBusy(true); setError('');
    try { state.setData(await fn()); } catch (e) { toast.error(e.message); state.reload(); } finally { setBusy(false); }
  };
  const toggle = (id, on) => setSelected((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });

  const checkout = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.post('/cart/checkout', {
        ids: chosen.map((l) => l.id), notes: notes || null,
        contact_phone: contact.phone || null, contact_address: contact.address || null,
      });
      state.setData(r.cart);
      toast.success(`${r.transaction_ids.length} request${r.transaction_ids.length === 1 ? '' : 's'} sent. The shops will review them shortly.`);
      navigate('/renter/dashboard');
    } catch (e) { setError(e.message); state.reload(); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="My cart" subtitle="Review your picks, adjust dates and quantities, then send the selected items as requests." />
      <Async state={state}>
        {() => (cart.lines.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
            <EmptyState title="Your cart is empty" hint="Add gowns, suits or costumes while browsing and review them here before sending your requests."
              action={<Link to="/renter/items" className="mt-2"><Button>Browse items</Button></Link>} />
          </div>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
            <section className="card" aria-label="Cart items">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 text-sm dark:border-slate-800">
                <label className="flex items-center gap-2 font-medium"><input type="checkbox" className="h-4 w-4 accent-slate-900 dark:accent-slate-100" checked={allSelected} onChange={(e) => setSelected(new Set(e.target.checked ? cart.lines.map((l) => l.id) : []))} />
                  Select all <span className="font-normal text-slate-500">({chosen.length}/{cart.lines.length})</span></label>
                <button className="text-xs font-medium text-red-700 hover:underline dark:text-red-400" onClick={() => setConfirm({ all: true })}>Clear cart</button>
              </div>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {cart.lines.map((l) => (
                  <Line key={l.id} l={l} busy={busy} selected={!!selected?.has(l.id)} onSelect={(on) => toggle(l.id, on)}
                    onPatch={(patch) => mutate(() => api.patch(`/cart/${l.id}`, patch))} onRemove={() => setConfirm({ id: l.id })} />
                ))}
              </ul>
            </section>

            <aside className="card space-y-3 p-5 lg:sticky lg:top-20" aria-label="Order summary">
              <h2 className="eyebrow">Summary</h2>
              <dl className="space-y-1.5 text-sm">
                {chosen.map((l) => (<div key={l.id} className="flex justify-between gap-3"><dt className="min-w-0 truncate text-slate-500">{l.item_name} ({l.size}) × {l.quantity}</dt><dd className="tabular-nums">{peso(l.line_total)}</dd></div>))}
                {!chosen.length && <p className="text-slate-500">Select items to include.</p>}
              </dl>
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
                <span className="text-sm text-slate-500">Estimated total</span><strong className="font-display text-3xl font-normal tabular-nums">{peso(subtotal)}</strong>
              </div>
              {hasPurchase && <div className="grid gap-2"><Input label="Contact number" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /><Input label="Address" value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} /></div>}
              <Textarea label="Note to the shops (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              {blocked.length > 0 && <Badge tone="amber">Fix or deselect {blocked.length} item{blocked.length === 1 ? '' : 's'} with warnings</Badge>}
              {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">{error}</p>}
              <Button className="w-full !py-3" loading={busy} disabled={!chosen.length || blocked.length > 0} onClick={checkout}>Send {chosen.length || ''} request{chosen.length === 1 ? '' : 's'}</Button>
              <p className="text-center text-xs text-slate-500">Nothing is charged now. If any item became unavailable, none are sent and your cart stays as is.</p>
            </aside>
          </div>
        ))}
      </Async>
      <ConfirmDialog open={!!confirm} danger title={confirm?.all ? 'Clear cart?' : 'Remove item?'} confirmLabel={confirm?.all ? 'Clear cart' : 'Remove'}
        message={confirm?.all ? 'Remove every item from your cart?' : 'Remove this item from your cart?'} onCancel={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); mutate(() => (c.all ? api.del('/cart') : api.del(`/cart/${c.id}`))); }} />
    </>
  );
}
