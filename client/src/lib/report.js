import { bucketLabel, fmtDate, monthLabel, peso } from './format.js';

const DAY = 86400000;
const add = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The period of equal length that ends the day before `range.from` (used for growth comparisons). */
export function previousRange({ from, to }) {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;
  return { from: add(from, -days), to: add(from, -1), days };
}

/** % change; null when there is nothing to compare against. */
export const growth = (cur, prev) => (prev ? (cur - prev) / Math.abs(prev) : cur ? null : 0);
export const fmtGrowth = (g, hadPrev = true) => (g === null ? (hadPrev ? 'New' : '—') : `${g >= 0 ? '+' : ''}${(g * 100).toFixed(1)}%`);

const KPIS = [
  ['Total revenue', (d) => d.summary.revenue, 'money'],
  ['Rental revenue', (d) => d.summary.rental_revenue, 'money'],
  ['Purchase revenue', (d) => d.summary.purchase_revenue, 'money'],
  ['Rental bookings', (d) => d.summary.rental_count, 'num'],
  ['Purchases', (d) => d.summary.purchase_count, 'num'],
  ['Total transactions', (d) => d.summary.rental_count + d.summary.purchase_count, 'num'],
  ['Avg. transaction value', (d) => d.summary.avg_transaction_value, 'money'],
  ['Active customers', (d) => d.customers.active, 'num'],
  ['Repeat customers', (d) => d.customers.repeat, 'num'],
];

/**
 * Turns the analytics payload for the selected period (and, when available, the previous period) into a report
 * structure that both the print view and the CSV export render, so they can never disagree.
 */
export function buildGrowthReport(cur, prev, { shop, generatedBy }) {
  const kpis = KPIS.map(([label, get, kind]) => {
    const value = get(cur); const before = prev ? get(prev) : null;
    return { label, kind, value, previous: before, change: before === null ? null : growth(value, before), hadPrev: before !== null };
  });
  const byBucket = new Map();
  cur.revenueSeries.forEach((r) => byBucket.set(String(r.bucket), { bucket: r.bucket, rental: Number(r.rental), purchase: Number(r.purchase) }));
  cur.rentalTrend.forEach((r) => { const row = byBucket.get(String(r.bucket)) ?? { bucket: r.bucket, rental: 0, purchase: 0 }; row.rentals = Number(r.count); row.purchases = Number(r.purchases); byBucket.set(String(r.bucket), row); });
  const trend = [...byBucket.values()].sort((a, b) => String(a.bucket).localeCompare(String(b.bucket))).map((r, i, all) => {
    const total = (r.rental ?? 0) + (r.purchase ?? 0);
    const before = i ? (all[i - 1].rental ?? 0) + (all[i - 1].purchase ?? 0) : null;
    return { label: cur.range.bucket === 'month' ? new Date(`${String(r.bucket).slice(0, 7)}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : bucketLabel(r.bucket, cur.range.bucket), rental: r.rental ?? 0, purchase: r.purchase ?? 0, total, rentals: r.rentals ?? 0, purchases: r.purchases ?? 0, change: before === null ? undefined : growth(total, before) };
  });
  const revenue = kpis[0];
  const best = trend.reduce((m, r) => (r.total > (m?.total ?? -1) ? r : m), null);
  const headline = [
    revenue.hadPrev && revenue.change !== null ? `Revenue ${revenue.change >= 0 ? 'grew' : 'fell'} ${Math.abs(revenue.change * 100).toFixed(1)}% versus the previous period (${peso(revenue.previous)} to ${peso(revenue.value)}).` : `Revenue for the period was ${peso(revenue.value)}.`,
    best && best.total > 0 ? `The strongest ${cur.range.bucket} was ${best.label} with ${peso(best.total)}.` : null,
  ].filter(Boolean);
  return {
    shop, generatedBy, generatedAt: new Date(), hasPrevious: Boolean(prev),
    range: { from: cur.range.from, to: cur.range.to, bucket: cur.range.bucket }, previousRange: prev ? { from: prev.range.from, to: prev.range.to } : null,
    headline, kpis, trend,
    topRented: (cur.topRented ?? []).slice(0, 5), topPurchased: (cur.topPurchased ?? []).slice(0, 5),
    categories: (cur.categories ?? []).map((c) => ({ category: c.category, rentals: Number(c.rentals), purchases: Number(c.purchases), total: Number(c.total) })),
  };
}

export const formatKpi = (k, v) => (v === null || v === undefined ? '—' : k.kind === 'money' ? peso(v) : new Intl.NumberFormat().format(Math.round(v * 100) / 100));

const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** CSV with labelled sections (opens cleanly in Excel / Sheets). */
export function reportToCsv(r) {
  const rows = [
    [`${r.shop} - Growth report`], [`Period`, `${r.range.from} to ${r.range.to}`], r.previousRange && [`Compared with`, `${r.previousRange.from} to ${r.previousRange.to}`],
    [`Generated`, r.generatedAt.toISOString()], [],
    ['KEY METRICS'], ['Metric', 'This period', 'Previous period', 'Change'],
    ...r.kpis.map((k) => [k.label, k.kind === 'money' ? k.value.toFixed(2) : k.value, k.previous === null ? '' : k.kind === 'money' ? k.previous.toFixed(2) : k.previous, k.hadPrev ? fmtGrowth(k.change) : '']), [],
    [`TREND BY ${r.range.bucket.toUpperCase()}`], ['Period', 'Rental revenue', 'Purchase revenue', 'Total revenue', 'Rentals', 'Purchases', 'Revenue change'],
    ...r.trend.map((t) => [t.label, t.rental.toFixed(2), t.purchase.toFixed(2), t.total.toFixed(2), t.rentals, t.purchases, t.change === undefined ? '' : fmtGrowth(t.change)]), [],
    ['MOST RENTED ITEMS'], ['Item', 'Category', 'Units'], ...r.topRented.map((i) => [i.name, i.category, i.units]), [],
    ['BY CATEGORY'], ['Category', 'Rentals', 'Purchases', 'Total'], ...r.categories.map((c) => [c.category, c.rentals, c.purchases, c.total]),
  ].filter(Boolean);
  return `﻿${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

export const periodLabel = (r) => `${fmtDate(r.from)} to ${fmtDate(r.to)}`;
export { monthLabel };
