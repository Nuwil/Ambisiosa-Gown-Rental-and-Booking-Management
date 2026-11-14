export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const SESSION_KEY = 'ambisiosa-demo-role';
let memoryRole = null;

const DEMO_USERS = {
  admin: {
    id: 1, role: 'admin', name: 'Demo Administrator', email: 'admin@demo.local', theme: 'light',
  },
  owner: {
    id: 2, role: 'owner', name: 'Maria Santos', email: 'owner@demo.local', shop_name: 'Santos Gowns & Suits', theme: 'light',
  },
  staff: {
    id: 3, role: 'staff', name: 'Rico Valdez', email: 'staff@demo.local', shop_name: 'Santos Gowns & Suits',
    theme: 'light', permissions: ['inventory', 'customers', 'transactions'],
  },
  renter: {
    id: 4, role: 'renter', name: 'Ana Reyes', email: 'renter@demo.local', theme: 'light',
  },
};

export const DEMO_ROLES = [
  { role: 'admin', label: 'Administrator', description: 'System dashboard and oversight' },
  { role: 'owner', label: 'Owner', description: 'Shop dashboard and business tools' },
  { role: 'staff', label: 'Staff', description: 'Shop workspace with staff permissions' },
  { role: 'renter', label: 'Renter', description: 'Rental and purchase overview' },
];

export function getDemoUser() {
  let role = memoryRole;
  try {
    role = sessionStorage.getItem(SESSION_KEY) || role;
  } catch {
    // The in-memory role still supports this tab if browser storage is blocked.
  }
  return DEMO_USERS[role] ?? null;
}

export function setDemoUser(role) {
  const user = DEMO_USERS[role];
  if (!user) throw new Error('Choose a valid demo role.');
  memoryRole = role;
  try {
    sessionStorage.setItem(SESSION_KEY, role);
  } catch {
    // The in-memory role still supports this tab if browser storage is blocked.
  }
  return user;
}

export function clearDemoUser() {
  memoryRole = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // The in-memory role is cleared even if browser storage is blocked.
  }
}
