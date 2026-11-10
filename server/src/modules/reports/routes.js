import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { pool } from '../../config/db.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/http.js';
import { logActivity } from '../../utils/audit.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z.object({ format: z.enum(['xlsx', 'pdf']).default('xlsx'), from: date.optional(), to: date.optional() });
const kindParam = z.object({ kind: z.enum(['rentals', 'purchases', 'revenue', 'inventory', 'customers', 'overdue']) });

// Each report: columns + a query that is ALWAYS scoped by owner for owners (`oc`), system-wide for admin.
const REPORTS = {
  rentals: {
    title: 'Rental Transactions',
    columns: ['ID', 'Customer', 'Item', 'Size', 'Qty', 'Start', 'Expected Return', 'Actual Return', 'Amount', 'Payment', 'Status'],
    sql: (oc) => `SELECT t.id, c.name, i.name, v.size, t.quantity, t.start_date, t.expected_return, t.actual_return, t.amount, t.payment_status, t.status
      FROM transactions t JOIN customers c ON c.id=t.customer_id JOIN item_variants v ON v.id=t.variant_id JOIN items i ON i.id=v.item_id
      WHERE t.type='rental' AND DATE(t.created_at) BETWEEN ? AND ? ${oc} ORDER BY t.id DESC`,
    dated: true,
  },
  purchases: {
    title: 'Purchase Transactions',
    columns: ['ID', 'Customer', 'Item', 'Size', 'Qty', 'Date', 'Amount', 'Payment', 'Status'],
    sql: (oc) => `SELECT t.id, c.name, i.name, v.size, t.quantity, DATE(t.created_at), t.amount, t.payment_status, t.status
      FROM transactions t JOIN customers c ON c.id=t.customer_id JOIN item_variants v ON v.id=t.variant_id JOIN items i ON i.id=v.item_id
      WHERE t.type='purchase' AND DATE(t.created_at) BETWEEN ? AND ? ${oc} ORDER BY t.id DESC`,
    dated: true,
  },
  revenue: {
    title: 'Revenue (payments received)',
    columns: ['Payment ID', 'Date', 'Transaction', 'Type', 'Customer', 'Method', 'Amount'],
    sql: (oc) => `SELECT p.id, DATE(p.paid_at), t.id, t.type, c.name, p.method, p.amount
      FROM payments p JOIN transactions t ON t.id=p.transaction_id JOIN customers c ON c.id=t.customer_id
      WHERE DATE(p.paid_at) BETWEEN ? AND ? ${oc} ORDER BY p.id DESC`,
    dated: true,
  },
  inventory: {
    title: 'Inventory',
    columns: ['Item ID', 'Name', 'Category', 'Color', 'Size', 'Total Qty', 'Rental Price', 'Purchase Price', 'Condition', 'Published'],
    sql: (oc) => `SELECT i.id, i.name, cat.name, i.color, v.size, v.total_quantity, i.rental_price, i.purchase_price, i.condition_status, IF(i.is_published,'Yes','No')
      FROM items i JOIN categories cat ON cat.id=i.category_id JOIN item_variants v ON v.item_id=i.id
      WHERE i.archived_at IS NULL ${oc.replace('t.owner_id', 'i.owner_id')} ORDER BY i.id DESC, v.size`,
    dated: false,
  },
  customers: {
    title: 'Customers',
    columns: ['ID', 'Name', 'Phone', 'Email', 'Address', 'Registered', 'Transactions', 'Total Paid'],
    sql: (oc) => `SELECT c.id, c.name, c.phone, c.email, c.address, DATE(c.created_at),
        (SELECT COUNT(*) FROM transactions t WHERE t.customer_id=c.id),
        (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN transactions t ON t.id=p.transaction_id WHERE t.customer_id=c.id)
      FROM customers c WHERE 1=1 ${oc.replace('t.owner_id', 'c.owner_id')} ORDER BY c.id DESC`,
    dated: false,
  },
  overdue: {
    title: 'Overdue Rentals',
    columns: ['ID', 'Customer', 'Phone', 'Item', 'Size', 'Qty', 'Expected Return', 'Days Overdue', 'Amount'],
    sql: (oc) => `SELECT t.id, c.name, c.phone, i.name, v.size, t.quantity, t.expected_return, DATEDIFF(CURDATE(), t.expected_return), t.amount
      FROM transactions t JOIN customers c ON c.id=t.customer_id JOIN item_variants v ON v.id=t.variant_id JOIN items i ON i.id=v.item_id
      WHERE t.type='rental' AND t.status='active' AND t.expected_return < CURDATE() ${oc} ORDER BY t.expected_return`,
    dated: false,
  },
};

const router = Router();
router.use(authenticate, requireRole('owner', 'admin'));

router.get('/:kind', validate({ params: kindParam, query: querySchema }), asyncHandler(async (req, res) => {
  const def = REPORTS[req.params.kind];
  const { format } = req.query;
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || `${to.slice(0, 4)}-01-01`;
  const isOwner = req.user.role === 'owner';
  const oc = isOwner ? 'AND t.owner_id = ?' : '';
  const params = [...(def.dated ? [from, to] : []), ...(isOwner ? [req.user.id] : [])];
  const [rows] = await pool.query({ sql: def.sql(oc), rowsAsArray: true }, params);

  const fileBase = `${req.params.kind}-${new Date().toISOString().slice(0, 10)}`;
  const subtitle = def.dated ? `${from} to ${to}` : `As of ${new Date().toISOString().slice(0, 10)}`;
  await logActivity({ actorId: req.user.id, action: 'REPORT_EXPORT', description: `${req.user.name} exported ${def.title} (${format})` });

  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(def.title.slice(0, 31));
    ws.addRow([def.title]).font = { bold: true, size: 14 };
    ws.addRow([subtitle]);
    ws.addRow([]);
    const head = ws.addRow(def.columns);
    head.font = { bold: true };
    head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }; });
    rows.forEach((r) => ws.addRow(r.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v))));
    ws.columns.forEach((col, i) => { col.width = Math.min(40, Math.max(def.columns[i].length + 2, ...rows.slice(0, 200).map((r) => String(r[i] ?? '').length + 2))); });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  }

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pdf"`);
  doc.pipe(res);
  doc.fontSize(16).text(def.title).fontSize(9).fillColor('#555').text(`${subtitle} · ${rows.length} record(s)`).moveDown();
  const width = (doc.page.width - 72) / def.columns.length;
  const drawRow = (cells, bold) => {
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#111');
    const heights = cells.map((c, i) => doc.heightOfString(String(c ?? ''), { width: width - 4 }));
    const h = Math.max(...heights, 10) + 4;
    if (y + h > doc.page.height - 40) { doc.addPage(); return drawRow(cells, bold); }
    cells.forEach((c, i) => doc.text(String(c ?? ''), 36 + i * width, y, { width: width - 4 }));
    doc.y = y + h;
    doc.moveTo(36, doc.y - 2).lineTo(doc.page.width - 36, doc.y - 2).strokeColor('#ddd').stroke();
  };
  drawRow(def.columns, true);
  rows.forEach((r) => drawRow(r.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)), false));
  doc.end();
}));

export default router;
