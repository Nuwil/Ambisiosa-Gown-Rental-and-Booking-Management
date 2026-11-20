import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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

const iconBtn = 'rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white';

function CartBadge({ className }) {
  const { count } = useCart();
  return count > 0 ? <span className={cx('ml-auto inline-flex min-w-[1.25rem] justify-center rounded-full bg-slate-900 px-1.5 text-[11px] font-medium leading-5 text-white dark:bg-slate-100 dark:text-slate-900', className)} aria-label={`${count} in cart`}>{count}</span> : null;
}

export default function AppLayout() {
  return <CartProvider><Layout /></CartProvider>;
}

function Layout() {
  const { user, logout, setTheme } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const dark = user.theme === 'dark';
  const brand = user.role === 'owner' || user.role === 'staff' ? user.shop_name || 'My Shop' : 'Atelier Rentals';
  const initials = user.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  const sidebar = (
    <nav className="flex h-full flex-col" aria-label="Main">
      <div className="px-6 pb-6 pt-7">
        <p className="truncate font-display text-3xl font-normal leading-none tracking-tight">{brand}</p>
        <p className="eyebrow mt-2">{user.role} workspace</p>
      </div>
      <ul className="flex-1 space-y-0.5 px-3">
        {NAV[user.role].filter((n) => !n.perm || user.permissions?.includes(n.perm)).map((n) => (
          <li key={n.to}>
            <NavLink to={n.to} onClick={() => setOpen(false)}
              className={({ isActive }) => cx('group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200',
                isActive ? 'bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:bg-slate-100/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white')}>
              {({ isActive }) => (<>
                <span aria-hidden="true" className={cx('absolute -left-3 top-1/2 w-0.5 -translate-y-1/2 rounded-full bg-brand-600 transition-all duration-300 dark:bg-brand-300', isActive ? 'h-5 opacity-100' : 'h-0 opacity-0')} />
                <Icon name={n.icon} className="h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-0.5" />{n.label}{n.badge && <CartBadge />}
              </>)}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <button onClick={async () => { await logout(); navigate('/login'); }} className={cx(iconBtn, 'flex w-full items-center gap-3 px-3 text-sm')}>
          <Icon name="logout" className="h-[18px] w-[18px]" />Log out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-slate-200 lg:block dark:border-slate-800">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside className="page-enter absolute inset-y-0 left-0 w-72 bg-slate-50 shadow-xl dark:bg-slate-950">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <button className={cx(iconBtn, 'lg:hidden')} onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <div className="flex-1" />
          {user.role === 'renter' && (
            <NavLink to="/renter/cart" aria-label="Open cart" className={cx(iconBtn, 'relative')}>
              <Icon name="cart" /><CartBadge className="!absolute -right-0.5 -top-0.5 !ml-0 !min-w-[1.1rem] !text-[10px] !leading-[1.1rem]" />
            </NavLink>
          )}
          <button onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`} className={iconBtn}><Icon name={dark ? 'sun' : 'moon'} /></button>
          <NotificationBell />
          <div className="ml-3 flex items-center gap-2.5 border-l border-slate-200 pl-4 dark:border-slate-800">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{user.name}</p>
              <p className="text-xs capitalize text-slate-500">{user.role}</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300" aria-hidden="true">{initials}</div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8"><div key={location.pathname} className="page-enter"><Outlet /></div></main>
      </div>
    </div>
  );
}
