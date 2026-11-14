# Atelier Rentals — Gown, Costume, Suit & Traditional Wear Rental Management System

React + Vite + Tailwind client · Node/Express API · MySQL.

**Staff access roles:** the owner sets, per staff member, which areas they can open — *Inventory*, *Customers*, *Transactions* (presets: Full access, Front desk, Inventory clerk). Enforced by API middleware (`requireStaffPermission` / `staffNeeds`), mirrored in navigation.

**Cart:** renters add rent/buy lines to a server-side cart (`/api/cart`), edit dates/quantities, select lines and check out. Checkout creates one pending request per line in a single DB transaction — if any line is unavailable nothing is created.

**Accounts:** exactly **one Admin** and **one Owner** (enforced by a unique database constraint), any number of **Staff** (created by the Owner, or by the Admin) and any number of **Renters** (self-registration). RBAC is enforced in the API; the client guards are navigation UX only.

| | Admin | Owner | Staff | Renter |
|---|---|---|---|---|
| System dashboard, analytics, users, backups, logs | ✔ | | | |
| Shop dashboard, customers, transactions, inventory | read-only oversight | ✔ | ✔ | |
| Delete customers, archive items, categories | | ✔ | | |
| Shop analytics, reports (PDF/Excel), staff accounts | | ✔ | | |
| Browse items, cart, request/checkout, own history | | | | ✔ |
| Renter-accounts directory (read-only) | | ✔ | with *customers* access | |

## Run

```bash
# 1. Database (MySQL 8+ / MariaDB 10.6+)
cd server && cp .env.example .env     # set DB_*, JWT_SECRET (long random string)
npm install
npm run migrate                       # creates rental_db + tables
npm run seed                          # admin only: admin@example.com / Admin12345 (override with ADMIN_EMAIL / ADMIN_PASSWORD; change it after first login)
npm run seed:demo                     # optional development sample data
npm run dev                           # API on :4000

# 2. Client
cd ../client && npm install && npm run dev   # http://localhost:5173 (proxies /api and /uploads)
```

## Vercel showcase mode

The Vercel client build uses the `demo` Vite mode. It offers Admin, Owner, Staff, and Renter dashboard previews with sample data, without calling the API or requiring a database. This is a read-only showcase, not real authentication; changes and accounts are not stored. The server service is not publicly routed in this mode. For the full application, configure MySQL and deploy the normal client/server setup.

Optional database-backed development sample data (`npm run seed:demo`, password `Demo12345`): if the database has no owner, the seed creates `owner@demo.test`; otherwise it adds sample records to the existing owner account. Staff `staff1..3@demo.test` (Full access / Front desk / Inventory clerk) and renters `renter1..9@demo.test` are created (renter8 suspended, renter9 inactive; renter1 and renter2 have items waiting in their carts).
The demo items come with generated "Sample photo" images (`server/seed-assets`). Owners and staff replace them by uploading real photos in Inventory (up to 5 per item; the first is the main photo, the second shows on hover).
Remove and reload sample data with `npm run seed:reset`. If demo items are already used by a non-demo cart or transaction, the reset stops rather than removing those records.

Tests: `npm run smoke:fresh` in `server/` reseeds and runs the 117-check API suite (RBAC, staff permissions, single-owner rules, lifecycle, concurrency, reports, admin).

## Design notes

- **Layering**: `routes → validate (zod) → service (rules, transactions) → SQL`. No SQL in the client, no business rules in routes.
- **Auth**: bcrypt hashes, JWT in an `httpOnly` cookie, rate-limited login/register, suspended/inactive users are locked out on the next request.
- **Shop scope**: the shop is derived from the session (the owner's id, or a staff member's owner), never from request input. Suspending the owner also locks out their staff.
- **Availability is derived** (`total − overlapping approved/active reservations`), never stored, so it cannot drift. Approve/release/purchase lock the variant row (`FOR UPDATE`) and re-check stock; concurrent approvals cannot oversell.
- **Purchases** reserve stock at approval and permanently deduct it on finalize.
- **Overdue** is computed (`active` and past return date), with a daily job creating reminders.
- **Analytics**: daily/weekly/monthly/yearly/custom ranges. Forecasts (demand, revenue, replenishment) use linear trend + seasonality from recorded history, are disabled with too little data, and are always tagged **Estimate**.
- **Reports**: Excel and PDF export (owner: own data; admin: system-wide).
- **Backups**: `mysqldump` (needs the binary on PATH or `MYSQLDUMP_BIN`); restore requires the admin password plus typing `RESTORE`, and takes a safety backup first.
- **Audit trail**: logins, account changes, inventory, transactions, payments, password changes and backups are logged with actor, affected user and timestamp.
- **Uploads**: JPG/PNG/WebP up to 3 MB, random file names, served with `nosniff`.
