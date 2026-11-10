import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Button, Input } from '../../components/ui/Controls.jsx';
import { Badge, PageHeader } from '../../components/ui/Display.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { fmtDate } from '../../lib/format.js';
import { ACCESS_AREAS, fieldErrors, presetFor } from '../../lib/forms.js';
import Icon from '../../components/ui/Icon.jsx';

function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: user.name || '', phone: user.phone || '', address: user.address || '', shop_name: user.shop_name || '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setErrors({}); setBusy(true);
    try {
      await updateProfile({ name: form.name, phone: form.phone || null, address: form.address || null, ...(user.role === 'owner' ? { shop_name: form.shop_name || null } : {}) });
      toast.success('Profile updated');
    } catch (err) { setErrors(fieldErrors(err)); toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
      <Input label="Full name" value={form.name} onChange={set('name')} error={errors.name} required />
      <Input label="Email" value={user.email} disabled hint="Email cannot be changed." />
      <Input label="Contact number" value={form.phone} onChange={set('phone')} error={errors.phone} />
      {user.role === 'owner' && <Input label="Shop name" value={form.shop_name} onChange={set('shop_name')} error={errors.shop_name} />}
      <Input className="sm:col-span-2" label="Address" value={form.address} onChange={set('address')} error={errors.address} />
      <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={busy}>Save profile</Button></div>
    </form>
  );
}

export function PasswordForm() {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return setErrors({ confirm: 'Passwords do not match' });
    setErrors({}); setBusy(true);
    try {
      await api.put('/auth/password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast.success('Password changed');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) { setErrors(fieldErrors(err)); toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
      <Input className="sm:col-span-2" label="Current password" type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} error={errors.currentPassword} required />
      <Input label="New password" type="password" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} error={errors.newPassword} required />
      <Input label="Confirm new password" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} required />
      <p className="self-center text-xs text-slate-500">8+ characters with a letter and a number.</p>
      <div className="flex justify-end"><Button type="submit" loading={busy}>Change password</Button></div>
    </form>
  );
}

export function ThemeControl() {
  const { user, setTheme } = useAuth();
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="radiogroup" aria-label="Theme">
      {[['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']].map(([v, l, icon]) => (
        <button key={v} role="radio" aria-checked={user.theme === v} onClick={() => setTheme(v)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${user.theme === v ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}><Icon name={icon} className="h-4 w-4" />{l}</button>
      ))}
    </div>
  );
}

const Card = ({ title, aside, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
    <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{title}</h2>{aside}</div>
    {children}
  </section>
);

/** Identity header: who is signed in, role/shop, and the theme switch — replaces three stacked sections. */
function SummaryCard({ onLogout }) {
  const { user } = useAuth();
  const initials = user.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const shop = user.role === 'owner' || user.role === 'staff' ? user.shop_name : null;
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg font-semibold text-white" aria-hidden="true">{initials}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><p className="truncate text-lg font-semibold">{user.name}</p><Badge tone="violet" className="capitalize">{user.role}</Badge></div>
        <p className="truncate text-sm text-slate-500">{user.email}{shop ? ` · ${shop}` : ''} · Member since {fmtDate(user.created_at)}</p>
        {user.role === 'staff' && (
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">Access: <strong className="text-slate-700 dark:text-slate-300">{presetFor(user.permissions)}</strong>
            {ACCESS_AREAS.filter((a) => user.permissions?.includes(a.key)).map((a) => <Badge key={a.key} tone="gray">{a.label}</Badge>)}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2"><ThemeControl />{onLogout && <Button variant="secondary" onClick={onLogout}>Log out</Button>}</div>
    </section>
  );
}

export function AccountSections({ onLogout }) {
  return (
    <div className="space-y-4">
      <SummaryCard onLogout={onLogout} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title="Profile"><ProfileForm /></Card>
        <Card title="Change password"><PasswordForm /></Card>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="Settings" subtitle="Your account, profile and appearance." />
      <AccountSections onLogout={async () => { await logout(); navigate('/login'); }} />
    </>
  );
}
