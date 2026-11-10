/**
 * Transparent forecasting on historical monthly series. No black boxes:
 *  - OLS linear trend over all observed months
 *  - when >= 24 months exist, multiplied by a per-calendar-month seasonal index
 *  - band = trend/seasonal value ± 1 residual standard deviation
 * Everything returned is flagged `predicted: true` so the UI can distinguish it from actuals.
 */
export const MIN_POINTS = 6;

export function monthKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Returns the last `n` month keys ending at (and including) `endKey` ("YYYY-MM"). */
export function monthRange(endKey, n) {
  const [y, m] = endKey.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(monthKey(new Date(Date.UTC(y, m - 1 - i, 1))));
  return out;
}

export const addMonths = (key, k) => {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(Date.UTC(y, m - 1 + k, 1)));
};

function ols(ys) {
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: my - slope * mx };
}

/**
 * @param {{month:string,value:number}[]} history contiguous monthly series (zeros filled), oldest → newest
 * @param {number} horizon months to predict
 */
export function forecastMonthly(history, horizon = 3) {
  // Ignore leading months before the first non-zero value: they pre-date the business.
  const first = history.findIndex((h) => h.value > 0);
  const series = first === -1 ? [] : history.slice(first);
  const n = series.length;
  if (n < MIN_POINTS) {
    return { sufficient: false, dataPoints: n, minRequired: MIN_POINTS, method: null, history, forecast: [] };
  }
  const ys = series.map((s) => s.value);
  const { slope, intercept } = ols(ys);
  const fitted = ys.map((_, i) => intercept + slope * i);
  const seasonal = n >= 24;

  // seasonal index per calendar month (clamped to avoid wild swings)
  const idx = Array(12).fill(1);
  if (seasonal) {
    const buckets = Array.from({ length: 12 }, () => []);
    series.forEach((s, i) => { if (fitted[i] > 0) buckets[Number(s.month.slice(5)) - 1].push(s.value / fitted[i]); });
    buckets.forEach((b, m) => { if (b.length) idx[m] = Math.min(1.5, Math.max(0.5, b.reduce((a, c) => a + c, 0) / b.length)); });
  }
  const predictAt = (i, month) => Math.max(0, (intercept + slope * i) * (seasonal ? idx[Number(month.slice(5)) - 1] : 1));
  const resid = ys.map((y, i) => y - predictAt(i, series[i].month));
  const sd = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / Math.max(1, n - 2));

  const last = series[n - 1].month;
  const forecast = Array.from({ length: horizon }, (_, k) => {
    const month = addMonths(last, k + 1);
    const value = predictAt(n + k, month);
    return { month, value: round(value), low: round(Math.max(0, value - sd)), high: round(value + sd), predicted: true };
  });
  return {
    sufficient: true, dataPoints: n, minRequired: MIN_POINTS,
    method: seasonal ? 'linear trend × seasonal index (≥24 months of history)' : 'linear trend (6–23 months of history)',
    trendPerMonth: round(slope), history, forecast,
  };
}

const round = (v) => Math.round(v * 100) / 100;
