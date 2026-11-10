import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Select } from '../../components/ui/Controls.jsx';
import { Pagination } from '../../components/ui/DataTable.jsx';
import { EmptyState, ErrorState } from '../../components/ui/Feedback.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { cx, peso } from '../../lib/format.js';
import { CONDITIONS, pref } from '../../lib/forms.js';
import { useDebounced, useFetch } from '../../lib/useFetch.js';

const EMPTY = { q: '', category: '', size: '', color: '', owner_id: '', condition: '', min_rent: '', max_rent: '', available: '', sort: 'newest', page: 1 };
const PAGE_SIZE = 12;

// Swatch colours for the colour filter; unknown names fall back to a neutral ring.
const SWATCH = { black: '#1b1b21', white: '#f6f6f6', navy: '#1f2a5a', red: '#c1272d', rose: '#d6648a', blush: '#f0b4c4', emerald: '#0f7a5c', gold: '#c9a227', brown: '#6b4423', cream: '#eadfc2', ivory: '#f2ead6', charcoal: '#3d424b', assorted: 'conic-gradient(#b03a5b, #2d4f9e, #2f8f6b, #b03a5b)' };
const swatch = (name) => SWATCH[String(name).toLowerCase()] || '#cbd5e1';

const FunnelIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
const CloseIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;

function Group({ title, children, open = true }) {
  return (
    <details open={open} className="group border-b border-slate-200 py-4 dark:border-slate-800">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
        {title}<span className="text-slate-400 transition group-open:rotate-180" aria-hidden="true">⌄</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Chip({ active, onClick, children, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
      className={cx('rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-40',
        active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-400')}>{children}</button>
  );
}

function FilterPanel({ filters, patch, facets, shops }) {
  const num = (k) => (e) => patch({ [k]: e.target.value === '' ? '' : String(Math.max(0, Number(e.target.value))) });
  return (
    <div>
      <label className="flex cursor-pointer items-center justify-between border-b border-slate-200 pb-4 text-sm font-semibold dark:border-slate-800">
        Available now
        <input type="checkbox" role="switch" className="h-5 w-9 cursor-pointer accent-violet-600" checked={filters.available === '1'} onChange={(e) => patch({ available: e.target.checked ? '1' : '' })} />
      </label>
      <Group title="Rental price per day">
        <div className="flex items-center gap-2">
          <input className="input" type="number" min="0" inputMode="numeric" aria-label="Minimum rental price" placeholder={facets?.price ? String(Math.floor(facets.price.min_rent)) : 'Min'} value={filters.min_rent} onChange={num('min_rent')} />
          <span className="text-slate-400">–</span>
          <input className="input" type="number" min="0" inputMode="numeric" aria-label="Maximum rental price" placeholder={facets?.price ? String(Math.ceil(facets.price.max_rent)) : 'Max'} value={filters.max_rent} onChange={num('max_rent')} />
        </div>
      </Group>
      {facets?.sizes?.length > 0 && (
        <Group title="Size">
          <div className="flex flex-wrap gap-2">{facets.sizes.map((s) => <Chip key={s.name} active={filters.size === s.name} onClick={() => patch({ size: filters.size === s.name ? '' : s.name })}>{s.name}</Chip>)}</div>
        </Group>
      )}
      {facets?.colors?.length > 0 && (
        <Group title="Colour">
          <div className="flex flex-wrap gap-2.5">
            {facets.colors.map((c) => (
              <button key={c.name} type="button" title={c.name} aria-label={c.name} aria-pressed={filters.color === c.name} onClick={() => patch({ color: filters.color === c.name ? '' : c.name })}
                className={cx('h-7 w-7 rounded-full border border-slate-300 transition dark:border-slate-600', filters.color === c.name && 'ring-2 ring-brand-600 ring-offset-2 ring-offset-white dark:ring-offset-slate-900')}
                style={{ background: swatch(c.name) }} />
            ))}
          </div>
          {filters.color && <p className="mt-2 text-xs text-slate-500">{filters.color}</p>}
        </Group>
      )}
      <Group title="Condition" open={false}>
        <div className="flex flex-wrap gap-2">{CONDITIONS.map(([v, l]) => <Chip key={v} active={filters.condition === v} onClick={() => patch({ condition: filters.condition === v ? '' : v })}>{l}</Chip>)}</div>
      </Group>
      {shops?.length > 1 && (
        <Group title="Shop" open={false}>
          <Select aria-label="Shop" value={filters.owner_id} onChange={(e) => patch({ owner_id: e.target.value })}><option value="">All shops</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        </Group>
      )}
    </div>
  );
}

function ActiveChips({ filters, patch, clear, shops }) {
  const chips = [];
  if (filters.q) chips.push(['q', `“${filters.q}”`]);
  if (filters.category) chips.push(['category', filters.category]);
  if (filters.size) chips.push(['size', `Size ${filters.size}`]);
  if (filters.color) chips.push(['color', filters.color]);
  if (filters.condition) chips.push(['condition', CONDITIONS.find(([v]) => v === filters.condition)?.[1]]);
  if (filters.available) chips.push(['available', 'Available now']);
  if (filters.owner_id) chips.push(['owner_id', shops?.find((s) => String(s.id) === String(filters.owner_id))?.name || 'Shop']);
  if (filters.min_rent || filters.max_rent) chips.push(['price', `${filters.min_rent ? peso(filters.min_rent) : '₱0'} – ${filters.max_rent ? peso(filters.max_rent) : 'any'} /day`]);
  if (!chips.length) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map(([k, label]) => (
        <button key={k} onClick={() => patch(k === 'price' ? { min_rent: '', max_rent: '' } : { [k]: '' })} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700" aria-label={`Remove filter ${label}`}>{label}<CloseIcon /></button>
      ))}
      <button onClick={clear} className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">Clear all</button>
    </div>
  );
}

function ProductCard({ item, list }) {
  const unavailable = item.availability_status !== 'available';
  const low = !unavailable && item.available_quantity <= 2;
  const isNew = Date.now() - new Date(item.created_at).getTime() < 30 * 864e5;
  const [first, second] = item.images;
  const media = (
    <div className={cx('relative overflow-hidden bg-slate-100 dark:bg-slate-800', list ? 'h-40 w-32 shrink-0 rounded-lg sm:h-48 sm:w-40' : 'aspect-[4/5]')}>
      {first ? <img src={first.url} alt={item.name} loading="lazy" className={cx('absolute inset-0 h-full w-full object-cover transition duration-500', second && 'group-hover:opacity-0', unavailable && 'grayscale-[40%]')} />
        : <div className="flex h-full items-center justify-center text-4xl font-semibold text-brand-300">{item.name.slice(0, 2).toUpperCase()}</div>}
      {second && <img src={second.url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:opacity-100" />}
      <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
        {isNew && !unavailable && <span className="rounded bg-brand-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">New</span>}
        {low && <span className="rounded bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">Only {item.available_quantity} left</span>}
      </div>
      {unavailable && <div className="absolute inset-x-0 bottom-0 bg-white/85 py-1.5 text-center text-xs font-semibold text-slate-700 backdrop-blur dark:bg-slate-900/85 dark:text-slate-200">Currently unavailable</div>}
    </div>
  );
  return (
    <Link to={`/renter/items/${item.id}`} className={cx('group block', list ? 'flex gap-4 rounded-xl border border-slate-200 p-3 transition hover:shadow-md dark:border-slate-800' : '')}>
      {media}
      <div className={cx(list ? 'min-w-0 flex-1 py-1' : 'pt-3')}>
        <p className="text-xs text-slate-500">{item.category}{item.color ? ` · ${item.color}` : ''}</p>
        <p className="truncate font-medium group-hover:text-brand-700 dark:group-hover:text-brand-300">{item.name}</p>
        {list && item.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{item.description}</p>}
        <p className="mt-1"><strong className="tabular-nums">{peso(item.rental_price)}</strong><span className="text-xs text-slate-500"> / day</span></p>
        {item.purchase_price != null && <p className="text-xs text-slate-500">or buy <span className="font-medium tabular-nums text-slate-700 dark:text-slate-300">{peso(item.purchase_price)}</span></p>}
        <div className="mt-2 flex flex-wrap gap-1">
          {item.variants.map((v) => <span key={v.id} className={cx('rounded border px-1.5 py-0.5 text-[11px]', v.available > 0 ? 'border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300' : 'border-slate-200 text-slate-400 line-through dark:border-slate-800')}>{v.size}</span>)}
        </div>
      </div>
    </Link>
  );
}

const SkeletonCard = ({ list }) => (
  <div className={cx('animate-pulse', list && 'flex gap-4 rounded-xl border border-slate-200 p-3 dark:border-slate-800')} aria-hidden="true">
    <div className={cx('rounded-lg bg-slate-200 dark:bg-slate-800', list ? 'h-40 w-32 shrink-0' : 'aspect-[4/5]')} />
    <div className={cx('space-y-2', list ? 'flex-1 py-1' : 'pt-3')}><div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" /><div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800" /><div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-800" /></div>
  </div>
);

export default function BrowsePage() {
  const [filters, setFilters] = useState(EMPTY);
  const [view, setViewState] = useState(pref.get('browse-view', 'grid'));
  const [drawer, setDrawer] = useState(false);
  const debounced = useDebounced(filters, 350);
  const facets = useFetch('/inventory/catalog/facets');
  const shops = useFetch('/inventory/catalog/shops');
  const list = useFetch('/inventory/catalog', { ...debounced, pageSize: PAGE_SIZE });
  const patch = (p) => setFilters((f) => ({ ...f, ...p, page: 1 }));
  const clear = () => setFilters({ ...EMPTY, sort: filters.sort });
  const setView = (v) => { setViewState(v); pref.set('browse-view', v); };
  const total = list.data?.meta.total;
  const listView = view === 'list';

  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawer(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [drawer]);

  const panel = <FilterPanel filters={filters} patch={patch} facets={facets.data} shops={shops.data} />;

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Rent items</h1>
        <p className="text-sm text-slate-500">Gowns, suits, costumes and traditional wear — rent by the day or buy.</p>
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categories">
        {[{ name: '', count: facets.data?.categories.reduce((a, c) => a + c.count, 0) }, ...(facets.data?.categories || [])].map((c) => (
          <button key={c.name || 'all'} role="tab" aria-selected={filters.category === c.name} onClick={() => patch({ category: c.name })}
            className={cx('shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition', filters.category === c.name ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-300 hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-400')}>
            {c.name || 'All'}{c.count != null && <span className="ml-1.5 text-xs opacity-60">{c.count}</span>}
          </button>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label="Filters"><div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">{panel}</div></aside>

        <section aria-live="polite">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 basis-56">
              <input className="input pl-9" type="search" placeholder="Search gowns, suits, colours…" aria-label="Search items" value={filters.q} onChange={(e) => patch({ q: e.target.value })} />
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            </div>
            <Button variant="secondary" className="lg:hidden" onClick={() => setDrawer(true)}><FunnelIcon /> Filters</Button>
            <select className="input w-auto" aria-label="Sort by" value={filters.sort} onChange={(e) => patch({ sort: e.target.value })}>
              <option value="newest">Newest</option><option value="rent_asc">Price: low to high</option><option value="rent_desc">Price: high to low</option><option value="name">Name (A–Z)</option>
            </select>
            <div className="hidden rounded-lg border border-slate-300 p-0.5 sm:flex dark:border-slate-700" role="group" aria-label="View">
              {['grid', 'list'].map((v) => <button key={v} onClick={() => setView(v)} aria-pressed={view === v} aria-label={`${v} view`} className={cx('rounded-md p-1.5', view === v ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}><Icon name={v} className="h-4 w-4" /></button>)}
            </div>
          </div>

          <p className="mb-3 text-sm text-slate-500">{total == null ? 'Loading…' : `${total} item${total === 1 ? '' : 's'}`}</p>
          <ActiveChips filters={filters} patch={patch} clear={clear} shops={shops.data} />

          {list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? (
            <div className={cx(listView ? 'space-y-3' : 'grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4')}>{Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} list={listView} />)}</div>
          ) : !list.data.data.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700"><EmptyState title="No items match your filters" hint="Try removing a filter or searching for something else." action={<Button variant="secondary" onClick={clear}>Clear all filters</Button>} /></div>
          ) : (
            <>
              <div className={cx('transition-opacity', list.loading && 'opacity-50', listView ? 'space-y-3' : 'grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4')}>
                {list.data.data.map((i) => <ProductCard key={i.id} item={i} list={listView} />)}
              </div>
              <div className="mt-8 rounded-xl border border-slate-200 dark:border-slate-800"><Pagination meta={list.data.meta} onPage={(page) => { setFilters((f) => ({ ...f, page })); window.scrollTo({ top: 0, behavior: 'smooth' }); }} /></div>
            </>
          )}
        </section>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col bg-white shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="font-semibold">Filters</h2><button onClick={() => setDrawer(false)} aria-label="Close filters" className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><CloseIcon /></button></div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">{panel}</div>
            <div className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-800"><Button variant="secondary" className="flex-1" onClick={clear}>Clear</Button><Button className="flex-1" onClick={() => setDrawer(false)}>Show {total ?? ''} items</Button></div>
          </div>
        </div>
      )}
    </>
  );
}
