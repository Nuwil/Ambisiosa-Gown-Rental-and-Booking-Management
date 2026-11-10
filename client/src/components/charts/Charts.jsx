import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { peso, num } from '../../lib/format.js';

export const COLORS = ['#7c3aed', '#0d9488', '#d97706', '#e11d48', '#0284c7', '#65a30d', '#c026d3', '#475569'];
const tick = { fill: 'currentColor', fontSize: 12 };
const grid = <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} vertical={false} />;
const tooltipStyle = { borderRadius: 8, border: '1px solid rgba(148,163,184,.4)', fontSize: 12 };

const Frame = ({ height = 260, children }) => (
  <div className="text-slate-500 dark:text-slate-400" style={{ height }}>
    <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
  </div>
);

export const NoData = ({ children = 'No data for this period' }) => (
  <div className="flex h-40 items-center justify-center text-sm text-slate-500">{children}</div>
);

/** series: [{ key, name, color? }]  — money=true formats axis/tooltip as pesos */
export function TrendChart({ data, xKey, series, money, height, stacked }) {
  if (!data?.length) return <NoData />;
  const fmt = money ? (v) => peso(v) : (v) => num(v);
  return (
    <Frame height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey={xKey} tick={tick} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={money ? 64 : 36} tickFormatter={money ? (v) => (v >= 1000 ? `${v / 1000}k` : v) : undefined} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(v)} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stackId={stacked ? 'a' : undefined}
            stroke={s.color || COLORS[i]} fill={s.color || COLORS[i]} fillOpacity={0.15} strokeWidth={2} />
        ))}
      </AreaChart>
    </Frame>
  );
}

export function SimpleBar({ data, xKey, series, horizontal, height = 260, money }) {
  if (!data?.length) return <NoData />;
  return (
    <Frame height={horizontal ? Math.max(height, data.length * 34 + 30) : height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: horizontal ? 8 : 0, bottom: 0 }}>
        {grid}
        {horizontal ? (
          <><XAxis type="number" tick={tick} tickLine={false} axisLine={false} allowDecimals={false} /><YAxis type="category" dataKey={xKey} tick={tick} tickLine={false} axisLine={false} width={130} /></>
        ) : (
          <><XAxis dataKey={xKey} tick={tick} tickLine={false} axisLine={false} /><YAxis tick={tick} tickLine={false} axisLine={false} width={36} allowDecimals={false} /></>
        )}
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => (money ? peso(v) : num(v))} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color || COLORS[i]} radius={[4, 4, 0, 0]} maxBarSize={36} />)}
      </BarChart>
    </Frame>
  );
}

export function Donut({ data, nameKey = 'name', valueKey = 'value', height = 240 }) {
  const rows = (data || []).filter((d) => Number(d[valueKey]) > 0);
  if (!rows.length) return <NoData />;
  return (
    <Frame height={height}>
      <PieChart>
        <Pie data={rows} dataKey={valueKey} nameKey={nameKey} innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
          {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </Frame>
  );
}

/** Actuals (solid) vs predictions (dashed, amber) with an uncertainty band. History/forecast come from the API. */
export function ForecastChart({ result, money, height = 260, label = 'Value' }) {
  if (!result?.sufficient) return null;
  const data = [
    ...result.history.map((h) => ({ month: h.month, actual: h.value })),
    ...result.forecast.map((f) => ({ month: f.month, predicted: f.value, band: [f.low, f.high] })),
  ];
  // connect the predicted line to the last actual point
  const lastActual = result.history.at(-1);
  if (lastActual) { const i = result.history.length - 1; data[i].predicted = lastActual.value; }
  const fmt = money ? (v) => peso(v) : (v) => num(v);
  return (
    <Frame height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey="month" tick={tick} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={money ? 64 : 36} tickFormatter={money ? (v) => (v >= 1000 ? `${v / 1000}k` : v) : undefined} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => (Array.isArray(v) ? `${fmt(v[0])} – ${fmt(v[1])}` : fmt(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area dataKey="band" name="Estimate range" stroke="none" fill="#d97706" fillOpacity={0.15} legendType="none" />
        <Line type="monotone" dataKey="actual" name={`Actual ${label}`} stroke="#7c3aed" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="predicted" name={`Predicted ${label} (estimate)`} stroke="#d97706" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} />
      </ComposedChart>
    </Frame>
  );
}
