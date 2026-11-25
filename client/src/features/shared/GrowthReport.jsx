import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import { Button, Portal } from '../../components/ui/Controls.jsx';
import { Spinner } from '../../components/ui/Feedback.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { lockScroll } from '../../lib/scrollLock.js';
import { buildGrowthReport, formatKpi, fmtGrowth, periodLabel, previousRange, reportToCsv } from '../../lib/report.js';
import { num, peso } from '../../lib/format.js';

/** Revenue per period as stacked bars. Plain SVG with fixed print-safe colours (the report is always on white paper). */
function RevenueBars({ rows }) {
  if (!rows.length) return null;
  const W = 720; const H = 190; const pad = { l: 8, r: 8, t: 12, b: 28 };
  const max = Math.max(...rows.map((r) => r.total), 1);
  const slot = (W - pad.l - pad.r) / rows.length; const bw = Math.min(40, slot * 0.62);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const every = Math.ceil(rows.length / 12);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revenue by period" className="w-full">
      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="#cfcac0" />
      {rows.map((r, i) => {
        const x = pad.l + slot * i + (slot - bw) / 2;
        return (
          <g key={r.label + i}>
            <rect x={x} y={y(r.rental)} width={bw} height={H - pad.b - y(r.rental)} fill="#1b1a17" />
            <rect x={x} y={y(r.rental + r.purchase)} width={bw} height={y(r.rental) - y(r.rental + r.purchase)} fill="#8f2f33" />
            {i % every === 0 && <text x={x + bw / 2} y={H - 10} textAnchor="middle" fontSize="10" fill="#6b665c">{r.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

const Change = ({ value, had }) => {
  if (!had) return <span className="rp-muted">—</span>;
  const text = fmtGrowth(value);
  return <span className={value === null ? 'rp-muted' : value > 0 ? 'rp-up' : value < 0 ? 'rp-down' : 'rp-muted'}>{text}</span>;
};

/** Full-screen, print-ready growth report for the analytics period: preview, CSV download, print / save as PDF. */
export default function GrowthReport({ data, user, onClose }) {
  const toast = useToast();
  const [prev, setPrev] = useState(undefined); // undefined = loading, null = unavailable
  useEffect(() => {
    const prior = previousRange(data.range);
    api.get('/stats/analytics', { range: 'custom', from: prior.from, to: prior.to }).then(setPrev).catch(() => setPrev(null));
  }, [data]);
  useEffect(() => {
    const unlock = lockScroll(); document.body.classList.add('printing-report');
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => { unlock(); document.body.classList.remove('printing-report'); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const report = useMemo(() => (prev === undefined ? null : buildGrowthReport(data, prev, { shop: user.role === 'admin' ? 'Ambisiosa - all shops' : user.shop_name || user.name, generatedBy: user.name })), [data, prev, user]);

  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob([reportToCsv(report)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `growth-report_${report.range.from}_${report.range.to}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  return (
    <Portal>
      <div className="report-overlay fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Growth report">
        <div className="report-toolbar sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <p className="mr-auto text-sm font-medium">Growth report preview</p>
          <Button size="sm" variant="secondary" disabled={!report} onClick={downloadCsv}><Icon name="inventory" className="h-4 w-4" />Download CSV</Button>
          <Button size="sm" disabled={!report} onClick={() => window.print()}><Icon name="contract" className="h-4 w-4" />Print / Save as PDF</Button>
          <Button size="sm" variant="secondary" onClick={onClose}><Icon name="close" className="h-4 w-4" />Close</Button>
        </div>

        <div className="mx-auto my-6 max-w-[860px] px-3 sm:px-0">
          {!report ? <div className="report-paper flex justify-center py-24"><Spinner /></div> : (
            <article className="report-paper">
              <header className="rp-head">
                <p className="rp-eyebrow">Company growth report</p>
                <h1>{report.shop}</h1>
                <p className="rp-muted">{periodLabel(report.range)} · grouped by {report.range.bucket}{report.previousRange && <> · compared with {periodLabel(report.previousRange)}</>}</p>
              </header>

              <section>
                <h2>Summary</h2>
                {report.headline.map((h) => <p key={h} className="rp-lead">{h}</p>)}
                {!report.hasPrevious && <p className="rp-muted">The previous period could not be loaded, so growth figures are not shown.</p>}
              </section>

              <section>
                <h2>Key metrics</h2>
                <table>
                  <thead><tr><th>Metric</th><th className="r">This period</th><th className="r">Previous period</th><th className="r">Change</th></tr></thead>
                  <tbody>{report.kpis.map((k) => (
                    <tr key={k.label}><td>{k.label}</td><td className="r">{formatKpi(k, k.value)}</td><td className="r rp-muted">{formatKpi(k, k.previous)}</td><td className="r"><Change value={k.change} had={k.hadPrev} /></td></tr>
                  ))}</tbody>
                </table>
              </section>

              <section>
                <h2>Revenue trend</h2>
                <div className="rp-legend"><span><i style={{ background: '#1b1a17' }} />Rental</span><span><i style={{ background: '#8f2f33' }} />Purchase</span></div>
                <RevenueBars rows={report.trend} />
                <table>
                  <thead><tr><th>Period</th><th className="r">Rental</th><th className="r">Purchase</th><th className="r">Total</th><th className="r">Rentals</th><th className="r">Purchases</th><th className="r">Change</th></tr></thead>
                  <tbody>{report.trend.map((t, i) => (
                    <tr key={t.label + i}><td>{t.label}</td><td className="r">{peso(t.rental)}</td><td className="r">{peso(t.purchase)}</td><td className="r"><b>{peso(t.total)}</b></td><td className="r">{num(t.rentals)}</td><td className="r">{num(t.purchases)}</td><td className="r">{t.change === undefined ? <span className="rp-muted">—</span> : <Change value={t.change} had />}</td></tr>
                  ))}</tbody>
                </table>
              </section>

              <section className="rp-cols">
                <div>
                  <h2>Most rented</h2>
                  {report.topRented.length ? <table><tbody>{report.topRented.map((i, n) => <tr key={i.id}><td className="rp-muted">{n + 1}</td><td>{i.name}<br /><span className="rp-muted">{i.category}</span></td><td className="r">{num(i.units)} units</td></tr>)}</tbody></table> : <p className="rp-muted">No rentals in this period.</p>}
                </div>
                <div>
                  <h2>By category</h2>
                  {report.categories.length ? <table><thead><tr><th>Category</th><th className="r">Rentals</th><th className="r">Purchases</th></tr></thead><tbody>{report.categories.map((c) => <tr key={c.category}><td>{c.category}</td><td className="r">{num(c.rentals)}</td><td className="r">{num(c.purchases)}</td></tr>)}</tbody></table> : <p className="rp-muted">No activity in this period.</p>}
                </div>
              </section>

              <footer className="rp-foot">Generated {report.generatedAt.toLocaleString()} by {report.generatedBy}. Revenue counts payments actually received; figures come from recorded transactions.</footer>
            </article>
          )}
        </div>
      </div>
    </Portal>
  );
}
