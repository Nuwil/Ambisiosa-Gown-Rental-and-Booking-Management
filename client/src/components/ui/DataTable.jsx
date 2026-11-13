import { Button } from './Controls.jsx';
import { EmptyState, Spinner } from './Feedback.jsx';
import Icon from './Icon.jsx';
import { cx } from '../../lib/format.js';

export function Pagination({ meta, onPage }) {
  if (!meta || meta.totalPages <= 1) return meta ? <p className="px-4 py-2 text-xs text-slate-500">{meta.total} record{meta.total === 1 ? '' : 's'}</p> : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
      <span className="text-xs text-slate-500">Page {meta.page} of {meta.totalPages} · {meta.total} records</span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}><Icon name="chevron-left" className="h-3.5 w-3.5" />Previous</Button>
        <Button size="sm" variant="secondary" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>Next<Icon name="chevron-right" className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

/**
 * columns: [{ header, cell: (row) => node, className?, hideBelow?: 'md'|'lg' }]
 * `result` is the paged API response ({ data, meta }) from useFetch.
 */
export default function DataTable({ columns, result, loading, onPage, onRowClick, empty, rowKey = (r) => r.id }) {
  const rows = result?.data ?? [];
  return (
    <div className="relative">
      {loading && <div className="absolute right-3 top-3"><Spinner className="h-4 w-4" /></div>}
      {!rows.length && !loading ? (
        <EmptyState {...(empty || {})} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="border-b border-slate-200 dark:border-slate-800">
              <tr>{columns.map((c, i) => <th key={i} className={cx('th', c.hideBelow === 'md' && 'hidden md:table-cell', c.hideBelow === 'lg' && 'hidden lg:table-cell')}>{c.header}</th>)}</tr>
            </thead>
            <tbody className={cx('divide-y divide-slate-100 transition-opacity dark:divide-slate-800/70', loading && 'opacity-60')}>
              {rows.map((r) => (
                <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cx('transition-colors duration-150', onRowClick && 'cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/50')}>
                  {columns.map((c, i) => <td key={i} className={cx('td', c.className, c.hideBelow === 'md' && 'hidden md:table-cell', c.hideBelow === 'lg' && 'hidden lg:table-cell')}>{c.cell(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination meta={result?.meta} onPage={onPage} />
    </div>
  );
}
