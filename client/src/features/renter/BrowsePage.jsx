import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Select } from '../../components/ui/Controls.jsx';
import { Pagination } from '../../components/ui/DataTable.jsx';
import { EmptyState, ErrorState } from '../../components/ui/Feedback.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { cx, peso } from '../../lib/format.js';
import { CONDITIONS, pref } from '../../lib/forms.js';
import { useDebounced, useFetch } from '../../lib/useFetch.js';

const EMPTY = { q: '', category: '', size: '', color: '', owner_id: '', condition: '', min_rent: '', max_rent: '', available: '', sort: 'newest', page: 1 };
// 20 per page = four full rows of five on desktop.
const PAGE_SIZE = 20;

// Swatch colours for the colour filter; unknown names fall back to a neutral ring.
const SWATCH = { black: '#1b1b21', white: '#f6f6f6', navy: '#1f2a5a', red: '#c1272d', rose: '#d6648a', blush: '#f0b4c4', emerald: '#0f7a5c', gold: '#c9a227', brown: '#6b4423', cream: '#eadfc2', ivory: '#f2ead6', charcoal: '#3d424b', assorted: 'conic-gradient(#b03a5b, #2d4f9e, #2f8f6b, #b03a5b)' };
const swatch = (name) => SWATCH[String(name).toLowerCase()] || '#cbd5e1';

const Group = ({ title, children, className }) => <div className={className}><p className="eyebrow mb-3">{title}</p>{children}</div>;

function Chip({ active, onClick, children, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
      className={cx('rounded-md border px-2.5 py-1 text-xs font-medium transition-colors duration-200 disabled:opacity-40',
        active ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900' : 'border-slate-300 hover:border-slate-900 dark:border-slate-700 dark:hover:border-slate-300')}>{children}</button>
  );
}

/** Number of filters living inside the collapsible panel (search, category and sort are always visible). */
const panelCount = (f) => [f.available, f.size, f.color, f.condition, f.owner_id, f.min_rent || f.max_rent].filter(Boolean).length;

function FilterPanel({ filters, patch, facets, shops, onClear, count }) {
  const num = (k) => (e) => patch({ [k]: e.target.value === '' ? '' : String(Math.max(0, Number(e.target.value))) });
  return (
    <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
      <Group title="Availability">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <input type="checkbox" className="h-4 w-4 cursor-pointer accent-slate-900 dark:accent-slate-100" checked={filters.available === '1'} onChange={(e) => patch({ available: e.target.checked ? '1' : '' })} />
          Available now
        </label>
      </Group>
      <Group title="Rental price per day">
        <div className="flex items-center gap-2">
          <input className="input" type="number" min="0" inputMode="numeric" aria-label="Minimum rental price" placeholder={facets?.price ? String(Math.floor(facets.price.min_rent)) : 'Min'} value={filters.min_rent} onChange={num('min_rent')} />
          <span className="text-slate-400">&ndash;</span>
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
                className={cx('h-7 w-7 rounded-full border border-slate-300 transition duration-200 hover:scale-110 dark:border-slate-600', filters.color === c.name && 'ring-2 ring-slate-900 ring-offset-2 ring-offset-white dark:ring-slate-100 dark:ring-offset-slate-900')}
                style={{ background: swatch(c.name) }} />
            ))}
          </div>
          {filters.color && <p className="mt-2 text-xs text-slate-500">{filters.color}</p>}
        </Group>
      )}
      <Group title="Condition">
        <div className="flex flex-wrap gap-2">{CONDITIONS.map(([v, l]) => <Chip key={v} active={filters.condition === v} onClick={() => patch({ condition: filters.condition === v ? '' : v })}>{l}</Chip>)}</div>
      </Group>
      {shops?.length > 1 && (
        <Group title="Shop">
          <Select aria-label="Shop" value={filters.owner_id} onChange={(e) => patch({ owner_id: e.target.value })}><option value="">All shops</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        </Group>
      )}
      {count > 0 && <div className="flex items-end sm:col-span-2 lg:col-span-4"><button type="button" onClick={onClear} className="text-xs font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900 dark:text-white dark:decoration-slate-600">Reset filters</button></div>}
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
        <button key={k} onClick={() => patch(k === 'price' ? { min_rent: '', max_rent: '' } : { [k]: '' })} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1 text-xs font-medium transition-colors duration-200 hover:border-slate-900 dark:border-slate-700 dark:hover:border-slate-300" aria-label={`Remove filter ${label}`}>{label}<Icon name="close" className="h-3.5 w-3.5" /></button>
      ))}
      <button onClick={clear} className="text-xs font-medium text-slate-900 underline underline-offset-4 decoration-slate-300 hover:decoration-slate-900 dark:text-white dark:decoration-slate-600">Clear all</button>
    </div>
  );
}

const Tag = ({ className, children }) => <span className={cx('rounded-md px-2 py-0.5 text-[11px] font-medium', className)}>{children}</span>;

const GRID = 'grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-5';

function itemFlags(item) {
  const unavailable = item.availability_status !== 'available';
  return { unavailable, low: !unavailable && item.available_quantity <= 2, isNew: !unavailable && Date.now() - new Date(item.created_at).getTime() < 30 * 864e5 };
}

/** Uniform 3:4 tile: image fills it, a frosted strip carries the details and reveals buy price and sizes on hover. */
function ProductTile({ item }) {
  const { unavailable, low, isNew } = itemFlags(item);
  const [first, second] = item.images;
  return (
    <Link to={`/renter/items/${item.id}`} className="group relative block aspect-[3/4] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 transition-colors duration-300 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:hover:border-slate-600">
      {first ? <img src={first.url} alt={item.name} loading="lazy" className={cx('absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.03]', second && 'group-hover:opacity-0', unavailable && 'grayscale-[40%]')} />
        : <div className="flex h-full items-center justify-center font-display text-6xl text-slate-400">{item.name.slice(0, 2).toUpperCase()}</div>}
      {second && <img src={second.url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-700 ease-out group-hover:scale-[1.03] group-hover:opacity-100" />}
      <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1">
        {isNew && <Tag className="bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">New</Tag>}
        {low && <Tag className="bg-white/90 text-amber-800 backdrop-blur dark:bg-slate-900/90 dark:text-amber-300">Only {item.available_quantity} left</Tag>}
        {unavailable && <Tag className="bg-white/90 text-slate-700 backdrop-blur dark:bg-slate-900/90 dark:text-slate-200">Unavailable</Tag>}
      </div>
      <div className="absolute inset-x-2 bottom-2 bg-white/85 p-3 backdrop-blur-md dark:bg-slate-900/85">
        <p className="truncate text-[11px] text-slate-500">{item.category}{item.color ? ` \u00b7 ${item.color}` : ''}</p>
        <p className="truncate font-medium">{item.name}</p>
        <p><strong className="tabular-nums">{peso(item.rental_price)}</strong><span className="text-xs text-slate-500"> / day</span></p>
        <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr]">
          <div className="overflow-hidden">
            {item.purchase_price != null && <p className="mt-1 text-xs text-slate-500">Buy <span className="tabular-nums text-slate-700 dark:text-slate-300">{peso(item.purchase_price)}</span></p>}
            <div className="flex flex-wrap gap-1">
              {item.variants.map((v) => <span key={v.id} className={cx('mt-2 rounded border px-1.5 py-0.5 text-[11px]', v.available > 0 ? 'border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300' : 'border-slate-200 text-slate-400 line-through dark:border-slate-700')}>{v.size}</span>)}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ProductRow({ item }) {
  const { unavailable, low, isNew } = itemFlags(item);
  const [first, second] = item.images;
  return (
    <Link to={`/renter/items/${item.id}`} className="card card-hover group flex gap-4 p-3">
      <div className="relative h-40 w-32 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-48 sm:w-40 dark:bg-slate-800">
        {first ? <img src={first.url} alt={item.name} loading="lazy" className={cx('absolute inset-0 h-full w-full object-cover transition duration-500', second && 'group-hover:opacity-0', unavailable && 'grayscale-[40%]')} />
          : <div className="flex h-full items-center justify-center font-display text-4xl text-slate-400">{item.name.slice(0, 2).toUpperCase()}</div>}
        {second && <img src={second.url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:opacity-100" />}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {isNew && <Tag className="bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">New</Tag>}
          {low && <Tag className="bg-white/90 text-amber-800 dark:bg-slate-900/90 dark:text-amber-300">Only {item.available_quantity} left</Tag>}
        </div>
        {unavailable && <div className="absolute inset-x-0 bottom-0 bg-white/85 py-1.5 text-center text-xs font-medium text-slate-700 backdrop-blur dark:bg-slate-900/85 dark:text-slate-200">Currently unavailable</div>}
      </div>
      <div className="min-w-0 flex-1 py-1">
        <p className="text-xs text-slate-500">{item.category}{item.color ? ` \u00b7 ${item.color}` : ''}</p>
        <p className="truncate font-display text-2xl font-normal">{item.name}</p>
        {item.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{item.description}</p>}
        <p className="mt-2"><strong className="tabular-nums">{peso(item.rental_price)}</strong><span className="text-xs text-slate-500"> / day</span></p>
        {item.purchase_price != null && <p className="text-xs text-slate-500">or buy <span className="font-medium tabular-nums text-slate-700 dark:text-slate-300">{peso(item.purchase_price)}</span></p>}
        <div className="mt-2 flex flex-wrap gap-1">
          {item.variants.map((v) => <span key={v.id} className={cx('rounded-sm border px-1.5 py-0.5 text-[11px]', v.available > 0 ? 'border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300' : 'border-slate-200 text-slate-400 line-through dark:border-slate-800')}>{v.size}</span>)}
        </div>
      </div>
    </Link>
  );
}

const Skeleton = ({ list }) => list ? (
  <div className="card flex animate-pulse gap-4 p-3" aria-hidden="true">
    <div className="h-40 w-32 shrink-0 rounded-xl bg-slate-200 dark:bg-slate-800" />
    <div className="flex-1 space-y-2 py-1"><div className="h-3 w-1/3 rounded-sm bg-slate-200 dark:bg-slate-800" /><div className="h-5 w-3/4 rounded-sm bg-slate-200 dark:bg-slate-800" /><div className="h-4 w-1/2 rounded-sm bg-slate-200 dark:bg-slate-800" /></div>
  </div>
) : <div className="aspect-[3/4] animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" aria-hidden="true" />;

export default function BrowsePage() {
  const [filters, setFilters] = useState(EMPTY);
  const [view, setViewState] = useState(pref.get('browse-view', 'grid'));
  const [filtersOpen, setFiltersOpen] = useState(false); // hidden by default
  const debounced = useDebounced(filters, 350);
  const facets = useFetch('/inventory/catalog/facets');
  const shops = useFetch('/inventory/catalog/shops');
  const list = useFetch('/inventory/catalog', { ...debounced, pageSize: PAGE_SIZE });
  const patch = (p) => setFilters((f) => ({ ...f, ...p, page: 1 }));
  const clear = () => setFilters({ ...EMPTY, sort: filters.sort });
  const setView = (v) => { setViewState(v); pref.set('browse-view', v); };
  const total = list.data?.meta.total;
  const listView = view === 'list';

  const count = panelCount(filters);
  const panel = <FilterPanel filters={filters} patch={patch} facets={facets.data} shops={shops.data} count={count} onClear={() => patch({ available: '', size: '', color: '', condition: '', owner_id: '', min_rent: '', max_rent: '' })} />;

  return (
    <>
      <div className="mb-8">
        <h1 className="font-display text-4xl font-normal tracking-tight sm:text-5xl">Rent items</h1>
        <p className="mt-1.5 text-sm text-slate-500">Gowns, suits, costumes and traditional wear. Rent by the day or buy.</p>
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categories">
        {[{ name: '', count: facets.data?.categories.reduce((a, c) => a + c.count, 0) }, ...(facets.data?.categories || [])].map((c) => (
          <button key={c.name || 'all'} role="tab" aria-selected={filters.category === c.name} onClick={() => patch({ category: c.name })}
            className={cx('shrink-0 rounded-md border px-4 py-1.5 text-sm font-medium transition-colors duration-200', filters.category === c.name ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-300 hover:border-slate-900 dark:border-slate-700 dark:hover:border-slate-300')}>
            {c.name || 'All'}{c.count != null && <span className="ml-1.5 text-xs opacity-60">{c.count}</span>}
          </button>
        ))}
      </div>

      <div>
        <section aria-live="polite">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 basis-56">
              <input className="input pl-9" type="search" placeholder="Search gowns, suits, colours" aria-label="Search items" value={filters.q} onChange={(e) => patch({ q: e.target.value })} />
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
            <Button variant="secondary" aria-expanded={filtersOpen} aria-controls="filter-panel" onClick={() => setFiltersOpen((o) => !o)}>
              <Icon name="filter" className="h-4 w-4" />Filters
              {count > 0 && <span className="min-w-[1.25rem] bg-slate-900 px-1 text-[11px] leading-5 text-white dark:bg-slate-100 dark:text-slate-900">{count}</span>}
              <Icon name="chevron-down" className={cx('h-4 w-4 transition-transform duration-300', filtersOpen && 'rotate-180')} />
            </Button>
            <select className="input w-auto" aria-label="Sort by" value={filters.sort} onChange={(e) => patch({ sort: e.target.value })}>
              <option value="newest">Newest</option><option value="rent_asc">Price: low to high</option><option value="rent_desc">Price: high to low</option><option value="name">Name (A–Z)</option>
            </select>
            <div className="hidden rounded-lg border border-slate-300 p-0.5 sm:flex dark:border-slate-700" role="group" aria-label="View">
              {['grid', 'list'].map((v) => <button key={v} onClick={() => setView(v)} aria-pressed={view === v} aria-label={`${v} view`} className={cx('rounded-md p-1.5 transition-colors duration-200', view === v ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white')}><Icon name={v} className="h-4 w-4" /></button>)}
            </div>
          </div>

          {/* Collapsed by default. `inert` keeps hidden controls out of the tab order and screen readers. */}
          <div id="filter-panel" inert={!filtersOpen} className={cx('grid transition-[grid-template-rows,opacity] duration-300 ease-out', filtersOpen ? 'mb-5 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
            <div className="min-h-0 overflow-hidden"><div className="card p-5">{panel}</div></div>
          </div>

          <p className="mb-3 text-sm text-slate-500">{total == null ? 'Loading' : `${total} item${total === 1 ? '' : 's'}`}</p>
          <ActiveChips filters={filters} patch={patch} clear={clear} shops={shops.data} />

          {list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? (
            <div className={listView ? 'space-y-3' : GRID}>{Array.from({ length: listView ? 6 : 10 }, (_, i) => <Skeleton key={i} list={listView} />)}</div>
          ) : !list.data.data.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700"><EmptyState title="No items match your filters" hint="Try removing a filter or searching for something else." action={<Button variant="secondary" onClick={clear}>Clear all filters</Button>} /></div>
          ) : (
            <>
              <div className={cx('transition-opacity duration-300', list.loading && 'opacity-50', listView ? 'space-y-3' : GRID)}>
                {list.data.data.map((i) => (listView ? <ProductRow key={i.id} item={i} /> : <ProductTile key={i.id} item={i} />))}
              </div>
              <div className="card mt-8"><Pagination meta={list.data.meta} onPage={(page) => { setFilters((f) => ({ ...f, page })); window.scrollTo({ top: 0, behavior: 'smooth' }); }} /></div>
            </>
          )}
        </section>
      </div>

    </>
  );
}
