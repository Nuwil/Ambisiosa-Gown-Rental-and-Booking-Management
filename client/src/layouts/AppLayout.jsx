import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Icon from '../components/ui/Icon.jsx';
import NotificationBell from './NotificationBell.jsx';
import { cx } from '../lib/format.js';
import { CartProvider, useCart } from '../features/cart/CartContext.jsx';

const NAV = {
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/admin/analytics', label: 'Analytics', icon: 'analytics' },
    { to: '/admin/oversight', label: 'Oversight', icon: 'eye' },
    { to: '/admin/settings', label: 'Settings', icon: 'settings' },
  ],
  owner: [
    { to: '/owner/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/owner/customers', label: 'Customers', icon: 'customers' },
    { to: '/owner/transactions', label: 'Transactions', icon: 'transactions' },
    { to: '/owner/inventory', label: 'Inventory', icon: 'inventory' },
    { to: '/owner/analytics', label: 'Analytics', icon: 'analytics' },
    { to: '/owner/staff', label: 'Staff', icon: 'customers' },
    { to: '/owner/settings', label: 'Settings', icon: 'settings' },
  ],
  staff: [
    { to: '/owner/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/owner/customers', label: 'Customers', icon: 'customers', perm: 'customers' },
    { to: '/owner/transactions', label: 'Transactions', icon: 'transactions', perm: 'transactions' },
    { to: '/owner/inventory', label: 'Inventory', icon: 'inventory', perm: 'inventory' },
    { to: '/owner/settings', label: 'Settings', icon: 'settings' },
  ],
  renter: [
    { to: '/renter/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/renter/items', label: 'Rent Items', icon: 'rent' },
    { to: '/renter/cart', label: 'My Cart', icon: 'cart', badge: true },
    { to: '/renter/settings', label: 'Settings', icon: 'settings' },
  ],
};

function CartBadge({ className }) {
  const { count } = useCart();
  return count > 0 ? <span className={cx('ml-auto inline-flex min-w-[1.25rem] justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold leading-5 text-white', className)} aria-label={`${count} in cart`}>{count}</span> : null;
}

export default function AppLayout() {
  return <CartProvider><Layout /></CartProvider>;
}

function Layout() {
  const { user, logout, setTheme } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const dark = user.theme === 'dark';
  const brand = user.role === 'owner' || user.role === 'staff' ? user.shop_name || 'My Shop' : 'Atelier Rentals';

  const sidebar = (
    <nav className="flex h-full flex-col" aria-label="Main">
      <div className="px-5 py-5">
        <p className="truncate text-lg font-semibold tracking-tight text-brand-700 dark:text-brand-300">{brand}</p>
        <p className="text-xs capitalize text-slate-500">{user.role} workspace</p>
      </div>
      <ul className="flex-1 space-y-1 px-3">
        {NAV[user.role].filter((n) => !n.perm || user.permissions?.includes(n.perm)).map((n) => (
          <li key={n.to}>
            <NavLink to={n.to} onClick={() => setOpen(false)}
              className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-800/30 dark:text-brand-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>
              <Icon name={n.icon} className="h-[18px] w-[18px]" />{n.label}{n.badge && <CartBadge />}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <button onClick={async () => { await logout(); navigate('/login'); }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          <Icon name="logout" className="h-[18px] w-[18px]" />Log out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl dark:bg-slate-900">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <div className="flex-1" />
          {user.role === 'renter' && (
            <NavLink to="/renter/cart" aria-label="Open cart" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              <Icon name="cart" /><CartBadge className="!absolute -right-0.5 -top-0.5 !ml-0 !min-w-[1.1rem] !text-[10px] !leading-[1.1rem]" />
            </NavLink>
          )}
          <button onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Icon name={dark ? 'sun' : 'moon'} /></button>
          <NotificationBell />
          <div className="ml-1 hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight">{user.name}</p>
            <p className="text-xs capitalize text-slate-500">{user.role}</p>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6"><Outlet /></main>
      </div>
    </div>
  );
}
