import { cx } from '../../lib/format.js';

export const Spinner = ({ className }) => (
  <svg className={cx('h-5 w-5 animate-spin text-brand-600', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20" />
    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

export const PageSpinner = () => (
  <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Loading"><Spinner className="h-8 w-8" /></div>
);

export function ErrorState({ error, onRetry }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center" role="alert">
      <p className="text-sm font-medium text-red-600 dark:text-red-400">{error?.message || 'Something went wrong'}</p>
      {onRetry && <button onClick={onRetry} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Try again</button>}
    </div>
  );
}

export const EmptyState = ({ title = 'Nothing here yet', hint, action }) => (
  <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
    <p className="font-medium text-slate-700 dark:text-slate-300">{title}</p>
    {hint && <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
    {action}
  </div>
);

/** Renders loading / error / content for a useFetch result. */
export function Async({ state, children, skeleton }) {
  if (state.loading && !state.data) return skeleton || <PageSpinner />;
  if (state.error && !state.data) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return null;
  return children(state.data);
}
