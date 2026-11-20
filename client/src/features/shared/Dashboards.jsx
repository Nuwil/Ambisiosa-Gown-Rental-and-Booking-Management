import { Link } from 'react-router-dom';
import { useFetch } from '../../lib/useFetch.js';
import { Async } from '../../components/ui/Feedback.jsx';
import { ActionLink, Badge, Bento, PageHeader, Section, StatCard, StatusBadge, TypeBadge } from '../../components/ui/Display.jsx';
import { buttonClass } from '../../components/ui/Controls.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { Donut, SimpleBar, TrendChart } from '../../components/charts/Charts.jsx';
import { fmtDate, fmtDateTime, monthLabel, num, peso } from '../../lib/format.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const statusDonut = (rows) => {
  const m = {};
  (rows || []).forEach((r) => { m[r.status] = (m[r.status] || 0) + Number(r.count); });
  return Object.entries(m).map(([name, value]) => ({ name, value }));
};
const typeBars = (rows) => {
  const m = {};
  (rows || []).forEach((r) => { m[r.status] ??= { status: r.status, rental: 0, purchase: 0 }; m[r.status][r.type] += Number(r.count); });
  return Object.values(m);
};

function MiniTable({ rows, cols, empty }) {
  if (!rows?.length) return <p className="px-5 py-8 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead><tr>{cols.map((c) => <th key={c.h} className="th px-4 py-2.5">{c.h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r, i) => <tr key={r.id ?? i} className="transition-colors duration-150 hover:bg-slate-100/60 dark:hover:bg-slate-800/40">{cols.map((c) => <td key={c.h} className="px-4 py-2.5">{c.c(r)}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}


const monthly = (rows, key) => (rows || []).map((r) => ({ ...r, label: monthLabel(r.month), [key]: Number(r[key]) }));
const sum = (rows, key) => (rows || []).reduce((n, r) => n + Number(r[key] || 0), 0);

/** Left bento column: one inverted hero figure plus two compact alert tiles. */
const Lead = ({ hero, a, b }) => (
  <div className="col-span-2 grid min-w-0 content-start gap-3 md:col-span-6 lg:col-span-4 lg:gap-4">
    {hero}
    <div className="grid grid-cols-2 gap-3 lg:gap-4">{a}{b}</div>
  </div>
);
const Trend = ({ title, rows, k, name, height = 250 }) => (
  <Section title={title} className="col-span-2 md:col-span-6 lg:col-span-8">
    <TrendChart data={monthly(rows, k)} xKey="label" money series={[{ key: k, name }]} height={height} />
  </Section>
);

const txCols = [
  { h: 'Customer', c: (t) => t.customer_name }, { h: 'Item', c: (t) => `${t.item_name} (${t.size})` },
  { h: 'Type', c: (t) => <TypeBadge type={t.type} /> }, { h: 'Date', c: (t) => fmtDate(t.created_at) },
  { h: 'Amount', c: (t) => <span className="tabular-nums">{peso(t.amount)}</span> }, { h: 'Status', c: (t) => <StatusBadge status={t.display_status} /> },
];

export function AdminDashboard() {
  const state = useFetch('/stats/dashboard');
  return (
    <>
      <PageHeader title="System overview" subtitle="Everything across all shops and renters." />
      <Async state={state}>{({ stats: s, recentUsers, activity, revenueByMonth, statusBreakdown }) => (
        <Bento>
          <Lead
            hero={<StatCard variant="hero" label="Revenue" value={peso(s.revenue)} hint="Payments received" />}
            a={<StatCard label="Pending requests" value={num(s.pending_requests)} tone={s.pending_requests ? 'warn' : undefined} />}
            b={<StatCard label="Overdue rentals" value={num(s.overdue)} tone={s.overdue ? 'danger' : undefined} />} />
          <Trend title="Revenue, last 12 months" rows={revenueByMonth} k="revenue" name="Revenue" />

          <StatCard className="md:col-span-2 lg:col-span-2" label="Staff" value={num(s.staff)} />
          <StatCard className="md:col-span-2 lg:col-span-2" label="Renters" value={num(s.renters)} />
          <StatCard className="md:col-span-2 lg:col-span-2" label="Rental items" value={num(s.items)} />
          <StatCard className="md:col-span-2 lg:col-span-2" label="Active rentals" value={num(s.active_rentals)} />
          <StatCard className="md:col-span-2 lg:col-span-2" label="Completed rentals" value={num(s.completed_rentals)} />
          <StatCard className="md:col-span-2 lg:col-span-2" label="Purchases" value={num(s.purchases)} hint="Completed" />

          <Section title="Transactions by status" className="col-span-2 md:col-span-3 lg:col-span-4"><Donut data={statusDonut(statusBreakdown)} /></Section>
          <Section title="Rentals vs purchases by status" className="col-span-2 md:col-span-3 lg:col-span-8"><SimpleBar data={typeBars(statusBreakdown)} xKey="status" series={[{ key: 'rental', name: 'Rental' }, { key: 'purchase', name: 'Purchase' }]} height={240} /></Section>

          <Section title="Recently registered users" className="col-span-2 md:col-span-6 lg:col-span-5" flush>
            <MiniTable empty="No users" rows={recentUsers} cols={[{ h: 'Name', c: (u) => u.name }, { h: 'Role', c: (u) => <Badge tone="violet">{u.role}</Badge> }, { h: 'Status', c: (u) => <StatusBadge status={u.status} /> }, { h: 'Joined', c: (u) => fmtDate(u.created_at) }]} />
          </Section>
          <Section title="Recent system activity" className="col-span-2 md:col-span-6 lg:col-span-7" actions={<ActionLink to="/admin/settings?tab=logs">View all</ActionLink>} flush>
            <MiniTable empty="No activity yet" rows={activity} cols={[{ h: 'Activity', c: (l) => l.description }, { h: 'Affected', c: (l) => l.target_name || '—' }, { h: 'When', c: (l) => <span className="whitespace-nowrap">{fmtDateTime(l.created_at)}</span> }]} />
          </Section>
        </Bento>
      )}</Async>
    </>
  );
}

const OverviewRow = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800/70">
    <dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt><dd className="font-display text-2xl font-normal tabular-nums">{value}</dd>
  </div>
);

export function OwnerDashboard() {
  const state = useFetch('/stats/dashboard');
  return (
    <>
      <PageHeader title="Business dashboard" subtitle="Your inventory, customers and transactions." />
      <Async state={state}>{({ stats: s, recentTransactions, upcomingReturns, lowStock, revenueByMonth, statusBreakdown }) => {
        const total = Number(s.total_units) || 0;
        const share = total ? Math.round((Number(s.available_units) / total) * 100) : 0;
        return (
          <Bento>
            <Lead
              hero={<StatCard variant="hero" label="Revenue" value={peso(s.revenue)} hint="Payments received" />}
              a={<StatCard label="Pending requests" value={num(s.pending_requests)} tone={s.pending_requests ? 'warn' : undefined} />}
              b={<StatCard label="Overdue rentals" value={num(s.overdue)} tone={s.overdue ? 'danger' : undefined} />} />
            <Trend title="Revenue, last 12 months" rows={revenueByMonth} k="revenue" name="Revenue" />

            <StatCard className="col-span-2 md:col-span-6 lg:col-span-5" label="Available units" value={num(s.available_units)} hint={`of ${num(s.total_units)} total, ${share}% on the shelf`}>
              <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="img" aria-label={`${share}% of units available`}>
                <div className="h-full rounded-full bg-slate-900 transition-[width] duration-700 dark:bg-slate-100" style={{ width: `${share}%` }} />
              </div>
            </StatCard>
            <StatCard className="md:col-span-2 lg:col-span-2" label="Currently rented" value={num(s.rented_units)} hint="units" />
            <StatCard className="md:col-span-2 lg:col-span-2" label="Reserved" value={num(s.reserved_units)} hint="approved, units" />
            <StatCard className="col-span-2 md:col-span-2 lg:col-span-3" label="Pending return" value={num(s.pending_return_units)} hint="due within 3 days" />

            <Section title="Overview" className="col-span-2 md:col-span-3 lg:col-span-4">
              <dl>
                <OverviewRow label="Customers" value={num(s.customers)} />
                <OverviewRow label="Inventory items" value={num(s.items)} />
                <OverviewRow label="Rental transactions" value={num(s.rental_transactions)} />
                <OverviewRow label="Purchase transactions" value={num(s.purchase_transactions)} />
              </dl>
            </Section>
            <Section title="Transactions by status" className="col-span-2 md:col-span-3 lg:col-span-4"><Donut data={statusDonut(statusBreakdown)} height={220} /></Section>
            <Section title="Low stock and unavailable" className="col-span-2 md:col-span-6 lg:col-span-4" flush>
              <MiniTable empty="All items are well stocked" rows={lowStock} cols={[{ h: 'Item', c: (r) => <Link className="font-medium hover:underline" to="/owner/inventory">{r.name}</Link> }, { h: 'Size', c: (r) => r.size }, { h: 'Available', c: (r) => (r.available === 0 ? <Badge tone="red">Unavailable</Badge> : <Badge tone="amber">{r.available} of {r.total}</Badge>) }]} />
            </Section>

            <Section title="Purchase and rental history" className="col-span-2 md:col-span-6 lg:col-span-8" actions={<ActionLink to="/owner/transactions">Manage transactions</ActionLink>} flush>
              <MiniTable rows={recentTransactions} cols={txCols} empty="No transactions yet" />
            </Section>
            <Section title="Upcoming returns, 7 days" className="col-span-2 md:col-span-6 lg:col-span-4" flush>
              <MiniTable empty="Nothing due this week" rows={upcomingReturns} cols={[{ h: 'Customer', c: (t) => t.customer_name }, { h: 'Item', c: (t) => `${t.item_name} (${t.size})` }, { h: 'Due', c: (t) => <span className="whitespace-nowrap">{fmtDate(t.expected_return)}</span> }]} />
            </Section>
          </Bento>
        );
      }}</Async>
    </>
  );
}

export function RenterDashboard() {
  const { user } = useAuth();
  const state = useFetch('/stats/dashboard');
  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(' ')[0]}`} subtitle="Your rentals, purchases and reminders." actions={<Link to="/renter/items" className={buttonClass('primary', 'md')}>Browse items<Icon name="arrow-up-right" className="h-4 w-4" /></Link>} />
      <Async state={state}>{({ stats: s, recentTransactions, upcomingReturns, spendByMonth }) => (
        <div className="space-y-4">
          {upcomingReturns.some((u) => u.level !== 'upcoming') && (
            <div role="alert" className="space-y-2">
              {upcomingReturns.filter((u) => u.level !== 'upcoming').map((u) => (
                <div key={u.id} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${u.level === 'overdue' ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200' : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200'}`}>
                  <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                  <p><strong>{u.item_name}</strong> ({u.size}) is {u.level === 'overdue' ? `overdue by ${-u.days_left} day(s)` : u.days_left === 0 ? 'due today' : `due in ${u.days_left} day(s)`}. Return date {fmtDate(u.expected_return)}.</p>
                </div>
              ))}
            </div>
          )}
          <Bento>
            <Lead
              hero={<StatCard variant="hero" label="Total spending" value={peso(s.total_spending)} hint={`${peso(sum(spendByMonth, 'spent'))} in the last 6 months`} />}
              a={<StatCard label="Active rentals" value={num(s.active_rentals)} />}
              b={<StatCard label="Pending requests" value={num(s.pending_requests)} tone={s.pending_requests ? 'warn' : undefined} />} />
            <Section title="Spending, last 6 months" className="col-span-2 md:col-span-6 lg:col-span-8">
              <TrendChart data={monthly(spendByMonth, 'spent')} xKey="label" money series={[{ key: 'spent', name: 'Spent' }]} height={220} />
            </Section>

            <StatCard className="md:col-span-3 lg:col-span-3" label="Items rented" value={num(s.rented_items)} />
            <StatCard className="md:col-span-3 lg:col-span-3" label="Items purchased" value={num(s.purchased_items)} />
            <StatCard className="md:col-span-3 lg:col-span-3" label="Overdue" value={num(s.overdue)} tone={s.overdue ? 'danger' : undefined} />
            <StatCard className="md:col-span-3 lg:col-span-3" label="Completed rentals" value={num(s.completed_rentals)} />

            <Section title="Upcoming returns" className="col-span-2 md:col-span-6 lg:col-span-4" flush>
              <MiniTable empty="No active rentals" rows={upcomingReturns} cols={[{ h: 'Item', c: (u) => `${u.item_name} (${u.size})` }, { h: 'Return by', c: (u) => <span className="whitespace-nowrap">{fmtDate(u.expected_return)}</span> }]} />
            </Section>
            <Section title="Recent transactions" className="col-span-2 md:col-span-6 lg:col-span-8" actions={<ActionLink to="/renter/history">Full history</ActionLink>} flush>
              <MiniTable rows={recentTransactions} cols={txCols.filter((c) => c.h !== 'Customer')} empty="You have no transactions yet." />
            </Section>
          </Bento>
        </div>
      )}</Async>
    </>
  );
}
