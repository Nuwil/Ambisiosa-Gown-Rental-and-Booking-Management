const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 });
export const peso = (v) => money.format(Number(v || 0));
export const num = (v) => new Intl.NumberFormat().format(Number(v || 0));
export const pct = (v) => `${(Number(v || 0) * 100).toFixed(0)}%`;

export const fmtDate = (d) => {
  if (!d) return '—';
  const date = new Date(String(d).length <= 10 ? `${d}T00:00:00` : String(d).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
export const fmtDateTime = (d) => {
  if (!d) return '—';
  const date = new Date(String(d).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};
export const monthLabel = (m) => {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
};
export const bucketLabel = (b, bucket) => {
  if (bucket === 'month') return monthLabel(b);
  if (bucket === 'year') return b;
  return fmtDate(b).replace(/, \d{4}$/, '');
};
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
export const cx = (...c) => c.filter(Boolean).join(' ');
