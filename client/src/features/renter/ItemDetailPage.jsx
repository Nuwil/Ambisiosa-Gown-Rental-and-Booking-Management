import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useCart } from '../cart/CartContext.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Button, Input, Stepper, Textarea } from '../../components/ui/Controls.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { Badge, StatusBadge } from '../../components/ui/Display.jsx';
import { Async } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { cx, daysBetween, peso, todayISO } from '../../lib/format.js';
import { fieldErrors } from '../../lib/forms.js';
import { useFetch } from '../../lib/useFetch.js';

function Lightbox({ images, index, onIndex, onClose, name }) {
  const go = useCallback((d) => onIndex((index + d + images.length) % images.length), [index, images.length, onIndex]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [go, onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label={`${name} photos`} onClick={onClose}>
      <button aria-label="Close" className="absolute right-4 top-4 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20" onClick={onClose}><Icon name="close" className="h-5 w-5" /></button>
      {images.length > 1 && <button aria-label="Previous photo" className="absolute left-3 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20" onClick={(e) => { e.stopPropagation(); go(-1); }}><Icon name="chevron-left" /></button>}
      <img src={images[index].url} alt={`${name}, photo ${index + 1} of ${images.length}`} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      {images.length > 1 && <button aria-label="Next photo" className="absolute right-3 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20" onClick={(e) => { e.stopPropagation(); go(1); }}><Icon name="chevron-right" /></button>}
      <p className="absolute bottom-4 text-sm text-white/70">{index + 1} / {images.length}</p>
    </div>
  );
}

function Gallery({ item }) {
  const images = item.images;
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const current = images[active];
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-start">
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto sm:w-20 sm:shrink-0 sm:flex-col sm:overflow-visible">
          {images.map((im, i) => (
            <button key={im.id} onClick={() => setActive(i)} onMouseEnter={() => setActive(i)} aria-label={`Show photo ${i + 1}`} aria-current={i === active}
              className={cx('aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-lg border transition duration-200 sm:w-full', i === active ? 'border-slate-900 dark:border-white' : 'border-transparent opacity-60 hover:opacity-100')}>
              <img src={im.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className="relative min-w-0 flex-1 self-start overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
        {current ? (
          <button className="block aspect-[4/5] w-full cursor-zoom-in" onClick={() => setOpen(true)} aria-label="Open photo full screen"><img src={current.url} alt={item.name} className="h-full w-full object-cover" /></button>
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center font-display text-7xl text-slate-400">{item.name.slice(0, 2).toUpperCase()}</div>
        )}
        {images.length > 1 && <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white">{active + 1} / {images.length}</span>}
      </div>
      {open && <Lightbox images={images} index={active} onIndex={setActive} onClose={() => setOpen(false)} name={item.name} />}
    </div>
  );
}

function PurchasePanel({ item, dates, setDates }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { setCount } = useCart();
  const canBuy = item.purchase_price != null;
  const [type, setType] = useState('rental');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [contact, setContact] = useState({ phone: user.phone || '', address: user.address || '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const variants = item.variants;
  const variant = variants.find((v) => String(v.id) === variantId);
  const validDates = dates.end >= dates.start;
  const days = type === 'rental' && validDates ? daysBetween(dates.start, dates.end) : 0;
  const total = type === 'rental' ? Number(item.rental_price) * days * quantity : Number(item.purchase_price || 0) * quantity;
  const max = variant?.available || 0;

  // Availability depends on the chosen dates: drop a size that is no longer free, and keep quantity within stock.
  useEffect(() => { if (variant && variant.available < 1) setVariantId(''); }, [variant]);
  useEffect(() => { if (max && quantity > max) setQuantity(max); }, [max, quantity]);

  const validate = () => {
    const v = {};
    if (!variantId) v.variant_id = 'Please choose a size';
    if (!(Number(quantity) >= 1)) v.quantity = 'Quantity must be at least 1';
    else if (variant && Number(quantity) > max) v.quantity = `Only ${max} available${type === 'rental' ? ' for these dates' : ''}`;
    if (type === 'rental') {
      if (dates.start < todayISO()) v.start_date = 'Rental date cannot be in the past';
      if (!validDates) v.expected_return = 'Return date must be on or after the rental date';
    }
    setErrors(v);
    return Object.keys(v).length === 0;
  };
  const line = () => ({ type, variant_id: Number(variantId), quantity: Number(quantity), ...(type === 'rental' ? { start_date: dates.start, expected_return: dates.end } : {}) });

  const run = async (fn) => {
    if (!validate()) return;
    setBusy(true);
    try { await fn(); } catch (err) { setErrors(fieldErrors(err)); toast.error(err.message); } finally { setBusy(false); }
  };

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/transactions/request', type === 'rental'
        ? { ...line(), notes: notes || null }
        : { ...line(), notes: notes || null, contact_phone: contact.phone || null, contact_address: contact.address || null });
      toast.success('Request sent. The shop will review it shortly.');
      navigate('/renter/dashboard');
    });
  };

  const addToCart = () => run(async () => {
    const cart = await api.post('/cart', line());
    setCount(cart.lines.length);
    toast.success(`Added to cart · ${cart.lines.length} line${cart.lines.length === 1 ? '' : 's'} in your cart`);
  });

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {canBuy && (
        <div className="grid grid-cols-2 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="tablist">
          {[['rental', 'Rent'], ['purchase', 'Buy']].map(([v, l]) => (
            <button key={v} role="tab" aria-selected={type === v} type="button" onClick={() => setType(v)}
              className={cx('rounded-md py-2 text-sm font-medium transition-colors duration-200', type === v ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white')}>{l}</button>
          ))}
        </div>
      )}

      {type === 'rental' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Rental date" type="date" min={todayISO()} value={dates.start} onChange={(e) => setDates({ start: e.target.value, end: dates.end < e.target.value ? e.target.value : dates.end })} error={errors.start_date} />
          <Input label="Return date" type="date" min={dates.start} value={dates.end} onChange={(e) => setDates({ ...dates, end: e.target.value })} error={errors.expected_return} />
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between"><p className="label !mb-0">Size</p>{variant && <p className="text-xs text-slate-500">{variant.available} available{type === 'rental' ? ' for your dates' : ''}</p>}</div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
          {variants.map((v) => (
            <button key={v.id} type="button" role="radio" aria-checked={variantId === String(v.id)} disabled={v.available < 1} onClick={() => setVariantId(String(v.id))}
              className={cx('min-w-[3.25rem] rounded-lg border px-3 py-2 text-sm font-medium transition',
                variantId === String(v.id) ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                  : v.available < 1 ? 'cursor-not-allowed border-slate-200 text-slate-400 line-through dark:border-slate-800' : 'border-slate-300 hover:border-slate-900 dark:border-slate-700 dark:hover:border-white')}>{v.size}</button>
          ))}
        </div>
        {errors.variant_id && <p className="mt-1.5 text-xs text-red-700 dark:text-red-400" role="alert">{errors.variant_id}</p>}
      </div>

      <div>
        <p className="label">Quantity</p>
        <Stepper value={quantity} max={max || 1} disabled={!variant} onChange={setQuantity} />
        {errors.quantity && <p className="mt-1.5 text-xs text-red-700 dark:text-red-400" role="alert">{errors.quantity}</p>}
      </div>

      {type === 'purchase' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Contact number" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
          <Input label="Address" value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} />
        </div>
      )}
      <Textarea label="Note to the shop (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-500">{type === 'rental' ? `Estimated total${days ? ` · ${days} day${days === 1 ? '' : 's'}` : ''}` : 'Total'}</span>
          <strong className="font-display text-4xl font-normal tabular-nums">{peso(total)}</strong>
        </div>
        {type === 'rental' && days > 0 && <p className="mt-1 text-xs text-slate-500">{peso(item.rental_price)} × {days} day{days === 1 ? '' : 's'}{quantity > 1 ? ` × ${quantity}` : ''}</p>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={addToCart} className="w-full !py-3 text-base">Add to cart</Button>
        <Button type="submit" loading={busy} className="w-full !py-3 text-base">{type === 'rental' ? 'Request to rent' : 'Request to buy'}</Button>
      </div>
      <p className="text-center text-xs text-slate-500">Nothing is charged now. The shop reviews your request and reserves the item once approved.</p>
    </form>
  );
}

function Related({ item }) {
  const state = useFetch('/inventory/catalog', { category: item.category, pageSize: 5 });
  const others = (state.data?.data || []).filter((i) => i.id !== item.id).slice(0, 4);
  if (!others.length) return null;
  return (
    <section className="mt-14" aria-label="More like this">
      <h2 className="mb-5 font-display text-3xl font-normal">More {item.category.toLowerCase()}</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {others.map((o) => (
          <Link key={o.id} to={`/renter/items/${o.id}`} className="group block">
            <div className="aspect-[4/5] overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
              {o.images[0] ? <img src={o.images[0].url} alt={o.name} loading="lazy" className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]" /> : <div className="flex h-full items-center justify-center font-display text-5xl text-slate-400">{o.name.slice(0, 2).toUpperCase()}</div>}
            </div>
            <p className="mt-2 truncate text-sm font-medium">{o.name}</p>
            <p className="text-sm"><strong className="tabular-nums">{peso(o.rental_price)}</strong><span className="text-xs text-slate-500"> / day</span></p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function ItemDetailPage() {
  const { id } = useParams();
  const [dates, setDates] = useState({ start: todayISO(), end: todayISO() });
  const valid = dates.end >= dates.start;
  const state = useFetch(`/inventory/catalog/${id}`, valid ? { start: dates.start, end: dates.end } : undefined);

  return (
    <Async state={state}>
      {(it) => (
        <>
          <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
            <Link to="/renter/items" className="hover:underline">Rent items</Link><Icon name="chevron-right" className="mx-1 inline h-3.5 w-3.5 align-[-2px]" />{it.category}<Icon name="chevron-right" className="mx-1 inline h-3.5 w-3.5 align-[-2px]" /><span className="text-slate-800 dark:text-slate-200">{it.name}</span>
          </nav>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
            <div className="lg:self-start"><Gallery key={it.id} item={it} /></div>

            <div className="lg:sticky lg:top-20 lg:self-start">
              <div className="flex flex-wrap items-center gap-2"><Badge tone="violet">{it.category}</Badge><StatusBadge status={it.availability_status} />{it.condition_status !== 'good' && <Badge className="capitalize">{it.condition_status.replace('_', ' ')}</Badge>}</div>
              <h1 className="mt-3 font-display text-5xl font-normal leading-[1.05] tracking-tight">{it.name}</h1>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                <span><strong className="font-display text-4xl font-normal tabular-nums">{peso(it.rental_price)}</strong><span className="text-sm text-slate-500"> / day</span></span>
                {it.purchase_price != null && <span className="text-sm text-slate-500">or buy for <strong className="tabular-nums text-slate-800 dark:text-slate-200">{peso(it.purchase_price)}</strong></span>}
              </p>
              {it.color && <p className="mt-2 text-sm text-slate-500">Colour: <span className="font-medium text-slate-800 dark:text-slate-200">{it.color}</span></p>}

              <div className="card mt-6 p-6"><PurchasePanel item={it} dates={dates} setDates={setDates} /></div>

              <div className="card mt-4 divide-y divide-slate-200 text-sm dark:divide-slate-800">
                {it.description && <details open className="group p-4"><summary className="eyebrow cursor-pointer list-none transition-colors hover:text-slate-900 dark:hover:text-white">Description</summary><p className="mt-2 whitespace-pre-line text-slate-600 dark:text-slate-300">{it.description}</p></details>}
                <details className="group p-4"><summary className="eyebrow cursor-pointer list-none transition-colors hover:text-slate-900 dark:hover:text-white">How renting works</summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600 dark:text-slate-300"><li>Send a request for your dates and size.</li><li>The shop approves it and reserves the item for you.</li><li>Pick it up, enjoy your event, and return it by your return date.</li></ol>
                </details>
                <details className="group p-4"><summary className="eyebrow cursor-pointer list-none transition-colors hover:text-slate-900 dark:hover:text-white">Shop</summary>
                  <p className="mt-2 font-medium">{it.shop_name || it.owner_name}</p><p className="text-slate-500">{[it.owner_phone, it.owner_address].filter(Boolean).join(' · ') || 'No contact details listed'}</p>
                </details>
              </div>
            </div>
          </div>
          <Related item={it} />
        </>
      )}
    </Async>
  );
}
