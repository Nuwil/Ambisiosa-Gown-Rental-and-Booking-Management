/** Port of server/src/utils/forecast.js (OLS trend, seasonal index with 24+ months). */
export const MIN_POINTS = 6;
export const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
export const addMonths = (key, k) => { const [y, m] = key.split('-').map(Number); return monthKey(new Date(Date.UTC(y, m - 1 + k, 1))); };
export const monthRange = (endKey, n) => Array.from({ length: n }, (_, i) => addMonths(endKey, i - (n - 1)));
const round = (v) => Math.round(v * 100) / 100;

function ols(ys) {
  const n = ys.length; const mx = (n - 1) / 2; const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0; let den = 0;
  ys.forEach((y, x) => { num += (x - mx) * (y - my); den += (x - mx) ** 2; });
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: my - slope * mx };
}

export function forecastMonthly(history, horizon = 3) {
  const first = history.findIndex((h) => h.value > 0);
  const series = first === -1 ? [] : history.slice(first);
  const n = series.length;
  if (n < MIN_POINTS) return { sufficient: false, dataPoints: n, minRequired: MIN_POINTS, method: null, history, forecast: [] };
  const ys = series.map((s) => s.value);
  const { slope, intercept } = ols(ys);
  const fitted = ys.map((_, i) => intercept + slope * i);
  const seasonal = n >= 24;
  const idx = Array(12).fill(1);
  if (seasonal) {
    const buckets = Array.from({ length: 12 }, () => []);
    series.forEach((s, i) => { if (fitted[i] > 0) buckets[Number(s.month.slice(5)) - 1].push(s.value / fitted[i]); });
    buckets.forEach((b, m) => { if (b.length) idx[m] = Math.min(1.5, Math.max(0.5, b.reduce((a, c) => a + c, 0) / b.length)); });
  }
  const predictAt = (i, month) => Math.max(0, (intercept + slope * i) * (seasonal ? idx[Number(month.slice(5)) - 1] : 1));
  const sd = Math.sqrt(ys.reduce((a, y, i) => a + (y - predictAt(i, series[i].month)) ** 2, 0) / Math.max(1, n - 2));
  const last = series[n - 1].month;
  const forecast = Array.from({ length: horizon }, (_, k) => {
    const month = addMonths(last, k + 1); const value = predictAt(n + k, month);
    return { month, value: round(value), low: round(Math.max(0, value - sd)), high: round(value + sd), predicted: true };
  });
  return {
    sufficient: true, dataPoints: n, minRequired: MIN_POINTS,
    method: seasonal ? 'linear trend × seasonal index (≥24 months of history)' : 'linear trend (6–23 months of history)',
    trendPerMonth: round(slope), history, forecast,
  };
}
