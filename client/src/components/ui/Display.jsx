import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../lib/format.js';
import Icon from './Icon.jsx';

const TONES = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-300/60 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-700/15 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-400/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-700/15 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-400/20',
  red: 'bg-red-50 text-red-800 ring-red-700/15 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-400/20',
  blue: 'bg-sky-50 text-sky-800 ring-sky-700/15 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-400/20',
  violet: 'bg-brand-50 text-brand-700 ring-brand-600/15 dark:bg-brand-800/30 dark:text-brand-200 dark:ring-brand-300/20',
};
export const Badge = ({ tone = 'gray', dot, children, className }) => (
  <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', TONES[tone], className)}>
    {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />}{children}
  </span>
);

const STATUS_TONE = {
  pending: 'amber', approved: 'blue', active: 'violet', completed: 'green', rejected: 'red', cancelled: 'gray', overdue: 'red',
  unpaid: 'red', partial: 'amber', paid: 'green', refunded: 'gray',
  available: 'green', unavailable: 'red', unpublished: 'gray', archived: 'gray',
  suspended: 'red', inactive: 'gray', success: 'green', failed: 'red', running: 'amber',
};
export const StatusBadge = ({ status }) => <Badge dot tone={STATUS_TONE[status] || 'gray'}>{String(status).replace(/_/g, ' ')}</Badge>;
export const TypeBadge = ({ type }) => <Badge tone={type === 'rental' ? 'violet' : 'blue'}>{type}</Badge>;


/**
 * Single-line figure that shrinks to fit its card instead of overflowing it. Starts at `max` px and scales down
 * (never below `min`) when the text is wider than the space available; re-fits on resize and once web fonts load.
 * The box has a fixed height and bottom-aligns, so baselines still line up across neighbouring cards.
 */
function FitValue({ children, max = 36, min = 16, className }) {
  const box = useRef(null);
  const text = useRef(null);
  useLayoutEffect(() => {
    const b = box.current; const t = text.current;
    if (!b || !t) return undefined;
    const fit = () => {
      t.style.fontSize = `${max}px`;
      const need = t.scrollWidth; const have = b.clientWidth;
      if (have > 0 && need > have) t.style.fontSize = `${Math.max(min, Math.floor((max * have / need) * 10) / 10)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(b);
    document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [children, max, min]);
  return (
    <div ref={box} className="flex min-w-0 items-end overflow-hidden" style={{ height: Math.round(max * 1.1) }}>
      <span ref={text} className={cx('shrink-0 whitespace-nowrap font-display font-normal leading-none tabular-nums', className)}>{children}</span>
    </div>
  );
}

/**
 * variant "hero" is the single high-contrast (inverted) tile on a page; use it once per layout.
 * `children` renders below the value (e.g. a progress bar).
 */
export function StatCard({ label, value, hint, tone, variant = 'default', className, children }) {
  const hero = variant === 'hero';
  return (
    <div className={cx(hero ? 'flex min-w-0 flex-col rounded-2xl bg-slate-900 p-6 text-slate-50 dark:bg-slate-100 dark:text-slate-900' : 'card card-hover flex min-w-0 flex-col p-5', className)}>
      <p className={cx('eyebrow', hero && '!text-slate-400 dark:!text-slate-500')}>{label}</p>
      {/* mt-auto: figures bottom-align across a row even when neighbouring labels wrap to two lines. */}
      <div className="mt-auto pt-2">
        <FitValue max={hero ? 48 : 36} className={cx(tone === 'danger' && 'text-red-700 dark:text-red-400', tone === 'warn' && 'text-amber-700 dark:text-amber-400')}>{value}</FitValue>
      </div>
      {hint && <p className={cx('mt-2 text-xs', hero ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400')}>{hint}</p>}
      {children}
    </div>
  );
}

/** Fits as many tiles as the *container* allows (not the viewport), so it is safe inside narrow columns. */
export const StatGrid = ({ children, className }) => <div className={cx('grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3', className)}>{children}</div>;

/** 12-column bento canvas. Children choose their own spans, e.g. className="col-span-2 md:col-span-4 lg:col-span-8". */
export const Bento = ({ children, className }) => <div className={cx('bento grid grid-cols-2 gap-3 md:grid-cols-6 lg:grid-cols-12 lg:gap-4', className)}>{children}</div>;

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="font-display text-4xl font-normal tracking-tight sm:text-5xl">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const Section = ({ title, actions, children, className, flush }) => (
  <section className={cx('card flex min-w-0 flex-col', className)}>
    {(title || actions) && (
      <div className={cx('flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-4', flush && 'border-b border-slate-200 dark:border-slate-800')}>
        <h2 className="eyebrow">{title}</h2>{actions}
      </div>
    )}
    <div className={cx('min-w-0 flex-1', !flush && 'px-5 pb-5')}>{children}</div>
  </section>
);

/** Quiet text link with a diagonal arrow that nudges on hover. */
export const ActionLink = ({ to, children }) => (
  <Link to={to} className="group inline-flex items-center gap-1 text-xs font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
    {children}<Icon name="arrow-up-right" className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
  </Link>
);

/** Marks computed forecasts so they can never be mistaken for recorded figures. */
export const EstimateTag = () => <Badge tone="amber" className="uppercase tracking-wide">Estimate</Badge>;
export const SeedTag = () => <Badge tone="gray" className="uppercase">Sample</Badge>;
