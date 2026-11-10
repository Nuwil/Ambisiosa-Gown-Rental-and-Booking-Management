import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { download } from '../../api/client.js';
import { useFetch } from '../../lib/useFetch.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { Async, EmptyState } from '../../components/ui/Feedback.jsx';
import { Badge, EstimateTag, PageHeader, Section, StatCard, StatGrid } from '../../components/ui/Display.jsx';
import { Button, Input, Select } from '../../components/ui/Controls.jsx';
import { Donut, ForecastChart, SimpleBar, TrendChart } from '../../components/charts/Charts.jsx';
import { bucketLabel, fmtDate, monthLabel, num, pct, peso } from '../../lib/format.js';

const RANGES = [['daily', 'Daily (30 days)'], ['weekly', 'Weekly (12 weeks)'], ['monthly', 'Monthly (12 months)'], ['yearly', 'Yearly (5 years)'], ['custom', 'Custom range']];
const REPORTS = [['rentals', 'Rental transactions'], ['purchases', 'Purchase transactions'], ['revenue', 'Revenue'], ['inventory', 'Inventory'], ['customers', 'Customers'], ['overdue', 'Overdue rentals']];

function RankTable({ rows, empty }) {
  if (!rows?.length) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <table className="min-w-full text-sm">
      <thead><tr><th className="th px-4 py-2">#</th><th className="th px-2 py-2">Item</th><th className="th px-2 py-2">Category</th><th className="th px-4 py-2 text-right">Units</th></tr></thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((r, i) => <tr key={r.id}><td className="px-4 py-2 text-slate-400">{i + 1}</td><td className="px-2 py-2 font-medium">{r.name}</td><td className="px-2 py-2 text-slate-500">{r.category}</td><td className="px-4 py-2 text-right tabular-nums">{num(r.units)}</td></tr>)}
      </tbody>
    </table>
  );
}

function Predictions({ p }) {
  const insufficient = (r) => !r?.sufficient;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <EstimateTag /> {p.disclaimer} Solid lines are recorded actuals; dashed lines are estimates with an approximate range.
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={<span className="flex items-center gap-2">Revenue outlook <EstimateTag /></span>}>
          {insufficient(p.revenue) ? <EmptyState title="Not enough history yet" hint={`Predictions need at least ${p.revenue.minRequired} months of recorded data. Found ${p.revenue.dataPoints}.`} /> : (
            <><ForecastChart result={{ ...p.revenue, history: p.revenue.history.slice(-12).map((h) => ({ ...h, month: monthLabel(h.month) })), forecast: p.revenue.forecast.map((f) => ({ ...f, month: monthLabel(f.month) })) }} money label="revenue" />
              <p className="mt-2 text-xs text-slate-500">Method: {p.revenue.method}. Trend {p.revenue.trendPerMonth >= 0 ? '+' : ''}{peso(p.revenue.trendPerMonth)}/month.</p></>
          )}
        </Section>
        <Section title={<span className="flex items-center gap-2">Rental demand (units) <EstimateTag /></span>}>
          {insufficient(p.rentalDemand) ? <EmptyState title="Not enough history yet" hint={`Needs ${p.rentalDemand.minRequired}+ months of rentals. Found ${p.rentalDemand.dataPoints}.`} /> : (
            <><ForecastChart result={{ ...p.rentalDemand, history: p.rentalDemand.history.slice(-12).map((h) => ({ ...h, month: monthLabel(h.month) })), forecast: p.rentalDemand.forecast.map((f) => ({ ...f, month: monthLabel(f.month) })) }} label="demand" />
              <p className="mt-2 text-xs text-slate-500">Method: {p.rentalDemand.method}.</p></>
          )}
        </Section>
      </div>
      <Section title={<span className="flex items-center gap-2">Predicted demand by category — next 3 months <EstimateTag /></span>} flush>
        {p.categoryDemand.filter((c) => c.sufficient).length === 0 ? <EmptyState title="Not enough category history yet" /> : (
          <div className="overflow-x-auto"><table className="min-w-full text-sm">
            <thead><tr><th className="th">Category</th>{p.categoryDemand.find((c) => c.sufficient).forecast.map((f) => <th key={f.month} className="th text-right">{monthLabel(f.month)}</th>)}<th className="th text-right">Trend / mo</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {p.categoryDemand.filter((c) => c.sufficient).map((c) => (
                <tr key={c.category}><td className="td font-medium">{c.category}</td>{c.forecast.map((f) => <td key={f.month} className="td text-right tabular-nums">{Math.round(f.value)} <span className="text-xs text-slate-400">({Math.round(f.low)}–{Math.round(f.high)})</span></td>)}<td className="td text-right tabular-nums">{c.trendPerMonth >= 0 ? '+' : ''}{c.trendPerMonth}</td></tr>
              ))}
            </tbody></table></div>
        )}
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Frequently rented (last 90 days — recorded)" flush>
          {p.frequentlyRented.length ? <ul className="divide-y divide-slate-100 dark:divide-slate-800">{p.frequentlyRented.map((i) => <li key={i.id} className="flex justify-between px-4 py-2.5 text-sm"><span>{i.name}</span><span className="tabular-nums text-slate-500">{i.rentals_90d} rentals</span></li>)}</ul> : <EmptyState title="No recent rentals" />}
        </Section>
        <Section title={<span className="flex items-center gap-2">Inventory replenishment <EstimateTag /></span>} flush>
          {p.replenishment.length ? <ul className="divide-y divide-slate-100 dark:divide-slate-800">{p.replenishment.map((r) => <li key={r.item_id} className="px-4 py-2.5 text-sm"><p className="font-medium">{r.name} <span className="font-normal text-slate-500">· {r.category}</span></p><p className="text-xs text-slate-500">{r.suggestion}</p></li>)}</ul> : <EmptyState title="No replenishment needed" hint="No item shows sustained high utilisation." />}
        </Section>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [range, setRange] = useState('monthly');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [tab, setTab] = useState('overview');
  const [exporting, setExporting] = useState('');
  const [report, setReport] = useState({ kind: 'rentals', format: 'xlsx' });
  const customReady = range !== 'custom' || (custom.from && custom.to && custom.from <= custom.to);
  const state = useFetch('/stats/analytics', { range, ...(range === 'custom' ? custom : {}) }, { enabled: !!customReady });
  const isAdmin = user.role === 'admin';

  const exportReport = async () => {
    setExporting(report.kind);
    try { await download(`/reports/${report.kind}`, { format: report.format, ...(range === 'custom' ? custom : {}) }); toast.success('Report downloaded'); }
    catch (e) { toast.error(e.message); } finally { setExporting(''); }
  };

  const tabs = [['overview', 'Overview'], ['items', 'Items & categories'], ['customers', isAdmin ? 'Shop & renters' : 'Customers'], ['inventory', 'Inventory'], ['predictions', 'Predictions']];
  return (
    <>
      <PageHeader title="Analytics" subtitle={isAdmin ? 'System-wide performance.' : 'Performance of your business only.'} />
      <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <Select label="Period" value={range} onChange={(e) => setRange(e.target.value)} className="w-52">{RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        {range === 'custom' && <><Input label="From" type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /><Input label="To" type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} error={custom.from && custom.to && custom.from > custom.to ? 'Must be after From' : ''} /></>}
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <Select label="Report" value={report.kind} onChange={(e) => setReport({ ...report, kind: e.target.value })}>{REPORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <Select label="Format" value={report.format} onChange={(e) => setReport({ ...report, format: e.target.value })}><option value="xlsx">Excel</option><option value="pdf">PDF</option></Select>
          <Button variant="secondary" loading={!!exporting} onClick={exportReport}>Export</Button>
        </div>
      </div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>{l}</button>)}
      </div>
      {!customReady ? <EmptyState title="Choose a valid date range" /> : (
        <Async state={state}>{(d) => {
          const bl = (r) => bucketLabel(r.bucket, d.range.bucket);
          const rev = d.revenueSeries.map((r) => ({ ...r, label: bl(r) }));
          const trend = d.rentalTrend.map((r) => ({ ...r, label: bl(r) }));
          return (
            <div className="space-y-5">
              <p className="text-xs text-slate-500">Showing recorded data from {fmtDate(d.range.from)} to {fmtDate(d.range.to)}, grouped by {d.range.bucket}. Revenue counts payments actually received.</p>
              {tab === 'overview' && <>
                <StatGrid>
                  <StatCard label="Total revenue" value={peso(d.summary.revenue)} /><StatCard label="Rental revenue" value={peso(d.summary.rental_revenue)} /><StatCard label="Purchase revenue" value={peso(d.summary.purchase_revenue)} />
                  <StatCard label="Rental transactions" value={num(d.summary.rental_count)} /><StatCard label="Purchase transactions" value={num(d.summary.purchase_count)} /><StatCard label="Avg. transaction value" value={peso(d.summary.avg_transaction_value)} />
                  <StatCard label="Overdue now" value={num(d.overdue.current)} hint={d.overdue.current ? `avg ${d.overdue.avg_days_overdue} days late` : undefined} tone={d.overdue.current ? 'danger' : undefined} />
                  <StatCard label="Late returns" value={`${d.overdue.returned_late} / ${d.overdue.returned_in_range}`} hint="in period" />
                </StatGrid>
                <div className="grid gap-5 lg:grid-cols-2">
                  <Section title="Revenue"><TrendChart data={rev} xKey="label" money stacked series={[{ key: 'rental', name: 'Rental' }, { key: 'purchase', name: 'Purchase' }]} /></Section>
                  <Section title="Rental & purchase trend"><TrendChart data={trend} xKey="label" series={[{ key: 'count', name: 'Rentals' }, { key: 'purchases', name: 'Purchases' }]} /></Section>
                </div>
                <Section title="Upcoming returns (14 days)" flush>
                  {d.upcomingReturns.length ? <table className="min-w-full text-sm"><thead><tr><th className="th">Customer</th><th className="th">Item</th><th className="th">Due</th><th className="th text-right">In</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{d.upcomingReturns.map((u) => <tr key={u.id}><td className="td">{u.customer_name}</td><td className="td">{u.item_name} ({u.size}) × {u.quantity}</td><td className="td">{fmtDate(u.expected_return)}</td><td className="td text-right">{Number(u.days_left) === 0 ? 'today' : `${u.days_left}d`}</td></tr>)}</tbody></table> : <EmptyState title="No returns due in the next 14 days" />}
                </Section>
              </>}
              {tab === 'items' && <>
                <div className="grid gap-5 lg:grid-cols-2">
                  <Section title="Most rented items" flush><RankTable rows={d.topRented} empty="No rentals in this period" /></Section>
                  <Section title="Most purchased items" flush><RankTable rows={d.topPurchased} empty="No purchases in this period" /></Section>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <Section title="Popular categories (share of transactions)"><Donut data={d.categories.map((c) => ({ name: c.category, value: Number(c.total) }))} /></Section>
                  <Section title="Rentals vs purchases by category"><SimpleBar data={d.categories.map((c) => ({ ...c, rentals: Number(c.rentals), purchases: Number(c.purchases) }))} xKey="category" series={[{ key: 'rentals', name: 'Rentals' }, { key: 'purchases', name: 'Purchases' }]} /></Section>
                </div>
              </>}
              {tab === 'customers' && <>
                <StatGrid><StatCard label="Active customers" value={num(d.customers.active)} hint="with confirmed transactions" /><StatCard label="Repeat customers" value={num(d.customers.repeat)} /><StatCard label="Retention rate" value={pct(d.customers.retention_rate)} hint="share with 2+ transactions" /></StatGrid>
                {isAdmin && <div className="grid gap-5 lg:grid-cols-2">
                  <Section title="Shop performance" flush><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr><th className="th">Shop</th><th className="th text-right">Revenue</th><th className="th text-right">Transactions</th><th className="th text-right">Items</th><th className="th text-right">Overdue</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{d.ownerPerformance.map((o) => <tr key={o.id}><td className="td font-medium">{o.shop}</td><td className="td text-right tabular-nums">{peso(o.revenue)}</td><td className="td text-right">{o.transactions}</td><td className="td text-right">{o.items}</td><td className="td text-right">{o.overdue}</td></tr>)}</tbody></table></div></Section>
                  <Section title="Most active renters" flush>{d.renterActivity.length ? <table className="min-w-full text-sm"><thead><tr><th className="th">Renter</th><th className="th text-right">Transactions</th><th className="th text-right">Value</th><th className="th">Last active</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{d.renterActivity.map((r) => <tr key={r.id}><td className="td">{r.name}</td><td className="td text-right">{r.transactions}</td><td className="td text-right tabular-nums">{peso(r.value)}</td><td className="td">{fmtDate(r.last_activity)}</td></tr>)}</tbody></table> : <EmptyState title="No renter activity in this period" />}</Section>
                </div>}
              </>}
              {tab === 'inventory' && <>
                <StatGrid><StatCard label="Items" value={num(d.inventory.total_items)} /><StatCard label="Total units" value={num(d.inventory.total_units)} /><StatCard label="Available today" value={num(d.inventory.available_now)} /><StatCard label="Avg. utilisation" value={pct(d.inventory.average_utilization)} hint="rented unit-days ÷ capacity" /></StatGrid>
                <Section title="Item utilisation (top 15)"><SimpleBar horizontal data={d.inventory.items.slice(0, 15).map((i) => ({ name: i.name, utilization: Math.round(i.utilization * 100) }))} xKey="name" series={[{ key: 'utilization', name: 'Utilisation %' }]} /></Section>
                <Section title="Overdue statistics"><p className="text-sm">{d.overdue.current} overdue rental(s) involving {d.overdue.units} unit(s){d.overdue.current ? `, ${d.overdue.avg_days_overdue} days late on average` : ''}. Of {d.overdue.returned_in_range} return(s) in the period, <Badge tone={d.overdue.returned_late ? 'amber' : 'green'}>{d.overdue.returned_late} late</Badge>.</p></Section>
              </>}
              {tab === 'predictions' && <Predictions p={d.predictions} />}
            </div>
          );
        }}</Async>
      )}
    </>
  );
}
