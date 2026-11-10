import { Link } from 'react-router-dom';
import { useFetch } from '../../lib/useFetch.js';
import { Async } from '../../components/ui/Feedback.jsx';
import { Badge, PageHeader, Section, StatCard, StatGrid, StatusBadge, TypeBadge } from '../../components/ui/Display.jsx';
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
  if (!rows?.length) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead><tr>{cols.map((c) => <th key={c.h} className="th px-3 py-2">{c.h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r, i) => <tr key={r.id ?? i}>{cols.map((c) => <td key={c.h} className="px-3 py-2">{c.c(r)}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

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
        <div className="space-y-5">
          <StatGrid>
            <StatCard label="Staff" value={num(s.staff)} /><StatCard label="Renters" value={num(s.renters)} />
            <StatCard label="Rental items" value={num(s.items)} /><StatCard label="Revenue" value={peso(s.revenue)} hint="Payments received" />
            <StatCard label="Active rentals" value={num(s.active_rentals)} /><StatCard label="Completed rentals" value={num(s.completed_rentals)} />
            <StatCard label="Purchases" value={num(s.purchases)} hint="Completed" /><StatCard label="Pending requests" value={num(s.pending_requests)} tone={s.pending_requests ? 'warn' : undefined} />
            <StatCard label="Overdue rentals" value={num(s.overdue)} tone={s.overdue ? 'danger' : undefined} />
          </StatGrid>
          <div className="grid gap-5 lg:grid-cols-3">
            <Section title="Revenue — last 12 months" className="lg:col-span-2">
              <TrendChart data={revenueByMonth.map((r) => ({ ...r, label: monthLabel(r.month) }))} xKey="label" money series={[{ key: 'revenue', name: 'Revenue' }]} />
            </Section>
            <Section title="Transactions by status"><Donut data={statusDonut(statusBreakdown)} /></Section>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Recently registered users" flush>
              <MiniTable empty="No users" rows={recentUsers} cols={[{ h: 'Name', c: (u) => u.name }, { h: 'Role', c: (u) => <Badge tone="violet">{u.role}</Badge> }, { h: 'Status', c: (u) => <StatusBadge status={u.status} /> }, { h: 'Joined', c: (u) => fmtDate(u.created_at) }]} />
            </Section>
            <Section title="Recent system activity" actions={<Link className="text-xs text-brand-600 hover:underline" to="/admin/settings?tab=logs">View all</Link>} flush>
              <MiniTable empty="No activity yet" rows={activity} cols={[{ h: 'Activity', c: (l) => l.description }, { h: 'Affected', c: (l) => l.target_name || '—' }, { h: 'When', c: (l) => <span className="whitespace-nowrap">{fmtDateTime(l.created_at)}</span> }]} />
            </Section>
          </div>
          <Section title="Rentals vs purchases by status"><SimpleBar data={typeBars(statusBreakdown)} xKey="status" series={[{ key: 'rental', name: 'Rental' }, { key: 'purchase', name: 'Purchase' }]} height={220} /></Section>
        </div>
      )}</Async>
    </>
  );
}

export function OwnerDashboard() {
  const state = useFetch('/stats/dashboard');
  return (
    <>
      <PageHeader title="Business dashboard" subtitle="Your inventory, customers and transactions." />
      <Async state={state}>{({ stats: s, recentTransactions, upcomingReturns, lowStock, revenueByMonth, statusBreakdown }) => (
        <div className="space-y-5">
          <StatGrid>
            <StatCard label="Customers" value={num(s.customers)} /><StatCard label="Inventory items" value={num(s.items)} />
            <StatCard label="Available units" value={num(s.available_units)} hint={`of ${num(s.total_units)} total`} /><StatCard label="Currently rented" value={num(s.rented_units)} hint="units" />
            <StatCard label="Reserved" value={num(s.reserved_units)} hint="approved, units" /><StatCard label="Pending return" value={num(s.pending_return_units)} hint="due within 3 days" />
            <StatCard label="Overdue rentals" value={num(s.overdue)} tone={s.overdue ? 'danger' : undefined} /><StatCard label="Pending requests" value={num(s.pending_requests)} tone={s.pending_requests ? 'warn' : undefined} />
            <StatCard label="Rental transactions" value={num(s.rental_transactions)} /><StatCard label="Purchase transactions" value={num(s.purchase_transactions)} />
            <StatCard label="Revenue" value={peso(s.revenue)} hint="Payments received" />
          </StatGrid>
          <div className="grid gap-5 lg:grid-cols-3">
            <Section title="Revenue — last 12 months" className="lg:col-span-2">
              <TrendChart data={revenueByMonth.map((r) => ({ ...r, label: monthLabel(r.month) }))} xKey="label" money series={[{ key: 'revenue', name: 'Revenue' }]} />
            </Section>
            <Section title="Transactions by status"><Donut data={statusDonut(statusBreakdown)} /></Section>
          </div>
          <Section title="Purchase and rental history" actions={<Link to="/owner/transactions" className="text-xs text-brand-600 hover:underline">Manage transactions</Link>} flush>
            <MiniTable rows={recentTransactions} cols={txCols} empty="No transactions yet" />
          </Section>
          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Upcoming return schedule (7 days)" flush>
              <MiniTable empty="Nothing due this week" rows={upcomingReturns} cols={[{ h: 'Customer', c: (t) => t.customer_name }, { h: 'Item', c: (t) => `${t.item_name} (${t.size})` }, { h: 'Due', c: (t) => fmtDate(t.expected_return) }]} />
            </Section>
            <Section title="Low stock & unavailable" flush>
              <MiniTable empty="All items are well stocked" rows={lowStock} cols={[{ h: 'Item', c: (r) => <Link className="text-brand-600 hover:underline" to="/owner/inventory">{r.name}</Link> }, { h: 'Size', c: (r) => r.size }, { h: 'Available', c: (r) => (r.available === 0 ? <Badge tone="red">Unavailable</Badge> : <Badge tone="amber">{r.available} of {r.total}</Badge>) }]} />
            </Section>
          </div>
        </div>
      )}</Async>
    </>
  );
}

export function RenterDashboard() {
  const { user } = useAuth();
  const state = useFetch('/stats/dashboard');
  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(' ')[0]}`} subtitle="Your rentals, purchases and reminders." actions={<Link to="/renter/items" className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">Browse items</Link>} />
      <Async state={state}>{({ stats: s, recentTransactions, upcomingReturns, spendByMonth }) => (
        <div className="space-y-5">
          {upcomingReturns.some((u) => u.level !== 'upcoming') && (
            <div role="alert" className="space-y-2">
              {upcomingReturns.filter((u) => u.level !== 'upcoming').map((u) => (
                <div key={u.id} className={`rounded-lg border px-4 py-3 text-sm ${u.level === 'overdue' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200' : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'}`}>
                  <strong>{u.item_name}</strong> ({u.size}) is {u.level === 'overdue' ? `overdue by ${-u.days_left} day(s)` : u.days_left === 0 ? 'due today' : `due in ${u.days_left} day(s)`} — return date {fmtDate(u.expected_return)}.
                </div>
              ))}
            </div>
          )}
          <StatGrid>
            <StatCard label="Items rented" value={num(s.rented_items)} /><StatCard label="Items purchased" value={num(s.purchased_items)} />
            <StatCard label="Active rentals" value={num(s.active_rentals)} /><StatCard label="Pending requests" value={num(s.pending_requests)} tone={s.pending_requests ? 'warn' : undefined} />
            <StatCard label="Overdue" value={num(s.overdue)} tone={s.overdue ? 'danger' : undefined} /><StatCard label="Completed rentals" value={num(s.completed_rentals)} />
            <StatCard label="Total spending" value={peso(s.total_spending)} />
          </StatGrid>
          <div className="grid gap-5 lg:grid-cols-3">
            <Section title="Upcoming returns" flush className="lg:col-span-1">
              <MiniTable empty="No active rentals" rows={upcomingReturns} cols={[{ h: 'Item', c: (u) => `${u.item_name} (${u.size})` }, { h: 'Return by', c: (u) => <span className="whitespace-nowrap">{fmtDate(u.expected_return)}</span> }]} />
            </Section>
            <Section title="Spending — last 6 months" className="lg:col-span-2">
              <TrendChart data={spendByMonth.map((r) => ({ ...r, label: monthLabel(r.month) }))} xKey="label" money series={[{ key: 'spent', name: 'Spent' }]} height={220} />
            </Section>
          </div>
          <Section title="Recent transactions" actions={<Link to="/renter/history" className="text-xs text-brand-600 hover:underline">Full history</Link>} flush>
            <MiniTable rows={recentTransactions} cols={txCols.filter((c) => c.h !== 'Customer')} empty="You have no transactions yet." />
          </Section>
        </div>
      )}</Async>
    </>
  );
}
