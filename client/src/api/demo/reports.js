/** Report downloads generated locally. "Excel" is delivered as CSV (opens in Excel); PDF is a small hand-built document. */
import { authenticate, mount, requireRole } from './router.js';
import { getDb, logActivity } from './store.js';
import { find, txRow } from './model.js';
import { dayOf, diffDays, FileReply, today } from './util.js';
import { date, object, oneOf, parse } from './validate.js';

const querySchema = object({ format: oneOf(['xlsx', 'pdf'], { default: 'xlsx' }), from: date({ plain: true, optional: true }), to: date({ plain: true, optional: true }) });
const kindParam = object({ kind: oneOf(['rentals', 'purchases', 'revenue', 'inventory', 'customers', 'overdue']) });
const between = (d, from, to) => d >= from && d <= to;

const REPORTS = {
  rentals: {
    title: 'Rental Transactions', dated: true,
    columns: ['ID', 'Customer', 'Item', 'Size', 'Qty', 'Start', 'Expected Return', 'Actual Return', 'Amount', 'Payment', 'Status'],
    rows: ({ txs, from, to }) => txs.filter((t) => t.type === 'rental' && between(dayOf(t.created_at), from, to)).map((t) => [t.id, t.customer_name, t.item_name, t.size, t.quantity, t.start_date, t.expected_return, t.actual_return, t.amount, t.payment_status, t.status]),
  },
  purchases: {
    title: 'Purchase Transactions', dated: true,
    columns: ['ID', 'Customer', 'Item', 'Size', 'Qty', 'Date', 'Amount', 'Payment', 'Status'],
    rows: ({ txs, from, to }) => txs.filter((t) => t.type === 'purchase' && between(dayOf(t.created_at), from, to)).map((t) => [t.id, t.customer_name, t.item_name, t.size, t.quantity, dayOf(t.created_at), t.amount, t.payment_status, t.status]),
  },
  revenue: {
    title: 'Revenue (payments received)', dated: true,
    columns: ['Payment ID', 'Date', 'Transaction', 'Type', 'Customer', 'Method', 'Amount'],
    rows: ({ txs, from, to }) => getDb().payments.filter((p) => between(dayOf(p.paid_at), from, to)).sort((a, b) => b.id - a.id).flatMap((p) => {
      const t = txs.find((x) => x.id === p.transaction_id);
      return t ? [[p.id, dayOf(p.paid_at), t.id, t.type, t.customer_name, p.method, p.amount]] : [];
    }),
  },
  inventory: {
    title: 'Inventory', dated: false,
    columns: ['Item ID', 'Name', 'Category', 'Color', 'Size', 'Total Qty', 'Rental Price', 'Purchase Price', 'Condition', 'Published'],
    rows: ({ ownerId }) => getDb().items.filter((i) => !i.archived_at && (!ownerId || i.owner_id === ownerId)).sort((a, b) => b.id - a.id).flatMap((i) => getDb().variants.filter((v) => v.item_id === i.id)
      .sort((a, b) => a.size.localeCompare(b.size)).map((v) => [i.id, i.name, find('categories', i.category_id).name, i.color, v.size, v.total_quantity, i.rental_price, i.purchase_price, i.condition_status, i.is_published ? 'Yes' : 'No'])),
  },
  customers: {
    title: 'Customers', dated: false,
    columns: ['ID', 'Name', 'Phone', 'Email', 'Address', 'Registered', 'Transactions', 'Total Paid'],
    rows: ({ ownerId }) => getDb().customers.filter((c) => !ownerId || c.owner_id === ownerId).sort((a, b) => b.id - a.id).map((c) => {
      const ids = new Set(getDb().transactions.filter((t) => t.customer_id === c.id).map((t) => t.id));
      return [c.id, c.name, c.phone, c.email, c.address, dayOf(c.created_at), ids.size, getDb().payments.filter((p) => ids.has(p.transaction_id)).reduce((n, p) => n + p.amount, 0)];
    }),
  },
  overdue: {
    title: 'Overdue Rentals', dated: false,
    columns: ['ID', 'Customer', 'Phone', 'Item', 'Size', 'Qty', 'Expected Return', 'Days Overdue', 'Amount'],
    rows: ({ txs }) => txs.filter((t) => t.is_overdue).sort((a, b) => a.expected_return.localeCompare(b.expected_return)).map((t) => [t.id, t.customer_name, t.customer_phone, t.item_name, t.size, t.quantity, t.expected_return, diffDays(today(), t.expected_return), t.amount]),
  },
};

const csv = (columns, rows) => `﻿${[columns, ...rows].map((r) => r.map((v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n')}\r\n`;

/** Minimal single-font landscape A4 PDF: title, subtitle and the table as monospaced text lines. */
function pdf(title, subtitle, columns, rows) {
  const clean = (v) => String(v ?? '').replace(/[^\x20-\x7e]/g, '?');
  const widths = columns.map((c, i) => Math.min(24, Math.max(c.length, ...rows.slice(0, 200).map((r) => clean(r[i]).length))));
  const fmt = (r) => r.map((v, i) => clean(v).slice(0, widths[i]).padEnd(widths[i])).join('  ').trimEnd();
  const lines = [title, subtitle, '', fmt(columns), '-'.repeat(Math.min(190, fmt(columns).length)), ...rows.map(fmt)];
  const perPage = 48; const pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  const esc = (s) => s.replace(/[\\()]/g, '\\$&');
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'];
  pages.forEach((ls, i) => {
    const content = `BT /F1 7 Tf 9 TL 36 559 Td ${ls.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  let out = '%PDF-1.4\n'; const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return out;
}

export const routes = mount('/reports', [authenticate, requireRole('owner', 'admin')], [
  ['GET', '/:kind', [], ({ user, params, query }) => {
    const { kind } = parse(kindParam, params); const { format, ...q } = parse(querySchema, query);
    const def = REPORTS[kind];
    const to = q.to || today(); const from = q.from || `${to.slice(0, 4)}-01-01`;
    const ownerId = user.role === 'owner' ? user.id : null;
    const txs = getDb().transactions.filter((t) => !ownerId || t.owner_id === ownerId).map(txRow);
    const rows = def.rows({ txs, from, to, ownerId });
    const base = `${kind}-${today()}`;
    const subtitle = def.dated ? `${from} to ${to}` : `As of ${today()}`;
    logActivity({ actorId: user.id, action: 'REPORT_EXPORT', description: `${user.name} exported ${def.title} (${format})` });
    return format === 'pdf'
      ? new FileReply(`${base}.pdf`, 'application/pdf', [pdf(def.title, `${subtitle} - ${rows.length} record(s)`, def.columns, rows)])
      : new FileReply(`${base}.csv`, 'text/csv', [csv(def.columns, rows)]);
  }],
]);
