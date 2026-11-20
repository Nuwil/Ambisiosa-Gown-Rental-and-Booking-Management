// Credentials created by `npm run seed` (admin) and `npm run seed:demo` (the rest).
// Shown on the login page only when VITE_DEMO_ACCOUNTS=true (default: dev builds only) or in static demo mode.
// VITE_DEMO_MODE=true swaps the API for an in-browser mock (see api/demo), so the app runs with no server or database.
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
export const DEMO_ENABLED = DEMO_MODE || (import.meta.env.VITE_DEMO_ACCOUNTS ?? String(import.meta.env.DEV)) === 'true';

/** Discards demo edits and reseeds the mock backend (no-op outside demo mode). */
export const resetDemoData = () => (import.meta.env.VITE_DEMO_MODE === 'true' ? import('../../api/demo/index.js').then((m) => m.resetDemo()) : Promise.resolve());

const DEMO_PASSWORD = 'Demo12345';

export const DEMO_ACCOUNTS = [
  { role: 'admin', icon: 'settings', label: 'Admin', email: 'admin@example.com', password: 'Admin12345', blurb: 'Oversight, users, backups, settings' },
  { role: 'owner', icon: 'inventory', label: 'Owner', email: 'owner@demo.test', password: DEMO_PASSWORD, blurb: 'Inventory, customers, staff, analytics' },
  { role: 'staff', icon: 'transactions', label: 'Staff', email: 'staff1@demo.test', password: DEMO_PASSWORD, blurb: 'Inventory, customers, transactions' },
  { role: 'renter', icon: 'rent', label: 'Renter', email: 'renter1@demo.test', password: DEMO_PASSWORD, blurb: 'Browse, cart, bookings' },
];
