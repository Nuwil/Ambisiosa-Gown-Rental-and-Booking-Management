import { cx } from '../../lib/format.js';

const TONES = {
  gray: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  violet: 'bg-brand-100 text-brand-800 dark:bg-brand-800/30 dark:text-brand-200',
};
export const Badge = ({ tone = 'gray', children, className }) => (
  <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>{children}</span>
);

const STATUS_TONE = {
  pending: 'amber', approved: 'blue', active: 'violet', completed: 'green', rejected: 'red', cancelled: 'gray', overdue: 'red',
  unpaid: 'red', partial: 'amber', paid: 'green', refunded: 'gray',
  available: 'green', unavailable: 'red', unpublished: 'gray', archived: 'gray',
  suspended: 'red', inactive: 'gray', success: 'green', failed: 'red', running: 'amber',
};
export const StatusBadge = ({ status }) => <Badge tone={STATUS_TONE[status] || 'gray'}>{String(status).replace(/_/g, ' ')}</Badge>;
export const TypeBadge = ({ type }) => <Badge tone={type === 'rental' ? 'violet' : 'blue'}>{type}</Badge>;

export function StatCard({ label, value, hint, tone }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cx('mt-1 text-2xl font-semibold tabular-nums', tone === 'danger' && 'text-red-600 dark:text-red-400', tone === 'warn' && 'text-amber-600 dark:text-amber-400')}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

export const StatGrid = ({ children }) => <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{children}</div>;

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const Section = ({ title, actions, children, className, flush }) => (
  <section className={cx('card', className)}>
    {(title || actions) && (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold">{title}</h2>{actions}
      </div>
    )}
    <div className={flush ? '' : 'p-4'}>{children}</div>
  </section>
);

/** Marks computed forecasts so they can never be mistaken for recorded figures. */
export const EstimateTag = () => <Badge tone="amber" className="uppercase tracking-wide">Estimate</Badge>;
export const SeedTag = () => <Badge tone="gray" className="uppercase">Sample</Badge>;
