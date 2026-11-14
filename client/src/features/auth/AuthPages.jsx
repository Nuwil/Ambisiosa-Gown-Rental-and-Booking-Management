import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, HOME } from '../../auth/AuthContext.jsx';
import { Button, Input } from '../../components/ui/Controls.jsx';
import { DEMO_MODE, DEMO_ROLES } from '../../demo/session.js';

function Shell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <aside className="hidden flex-col justify-between bg-slate-900 p-14 text-slate-100 lg:flex dark:border-r dark:border-slate-800 dark:bg-slate-900">
        <p className="font-display text-3xl font-normal">Ambisiosa</p>
        <div>
          <span className="mb-6 block h-px w-12 bg-brand-300" aria-hidden="true" />
          <p className="max-w-md font-display text-5xl font-normal leading-[1.08]">Gowns, suits, costumes and traditional wear.</p>
          <p className="mt-5 max-w-sm text-sm text-slate-400">Rent by the day or buy, with every booking tracked from request to return.</p>
        </div>
        <p className="text-xs text-slate-500">Rental and booking management</p>
      </aside>
      <main className="flex items-center justify-center px-6 py-12">
        <div className="page-enter w-full max-w-sm">
          <p className="mb-10 font-display text-2xl font-normal lg:hidden">Ambisiosa</p>
          <h1 className="font-display text-4xl font-normal tracking-tight">{title}</h1>
          <p className="mb-8 mt-2 text-sm text-slate-500">{subtitle}</p>
          {children}
          <p className="mt-8 text-sm text-slate-500">{footer}</p>
        </div>
      </main>
    </div>
  );
}

export function LoginPage() {
  const { user, login, demoLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={HOME[user.role]} replace />;

  if (DEMO_MODE) {
    return (
      <Shell title="Explore the showcase" subtitle="Choose a role to preview its dashboard. No password or database is used." footer="This is a read-only demo with sample data. Changes are not saved.">
        <div className="space-y-3">
          {DEMO_ROLES.map(({ role, label, description }) => (
            <Button key={role} variant="secondary" className="w-full justify-between px-4 py-3 text-left" onClick={() => {
              const u = demoLogin(role);
              navigate(HOME[u.role], { replace: true });
            }}>
              <span><span className="block capitalize">{label}</span><span className="mt-0.5 block text-xs font-normal opacity-70">{description}</span></span>
              <span aria-hidden="true">→</span>
            </Button>
          ))}
        </div>
      </Shell>
    );
  }

  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const u = await login(form.email.trim(), form.password);
      const from = location.state?.from;
      navigate(from && from.startsWith(HOME[u.role].split('/').slice(0, 2).join('/')) ? from : HOME[u.role], { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Shell title="Welcome back" subtitle="Sign in to manage or book rentals." footer={<>New renter? <Link className="font-medium text-slate-900 underline underline-offset-4 decoration-slate-300 transition-colors hover:decoration-slate-900 dark:text-white dark:decoration-slate-600 dark:hover:decoration-white" to="/register">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">{error}</p>}
        <Button type="submit" loading={busy} className="w-full" disabled={!form.email || !form.password}>Sign in</Button>
      </form>
    </Shell>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', address: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={HOME[user.role]} replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const validate = () => {
    const er = {};
    if (form.name.trim().length < 2) er.name = 'Enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) er.email = 'Enter a valid email';
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) er.password = 'At least 8 characters with a letter and a number';
    setErrors(er); return !Object.keys(er).length;
  };
  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (!validate()) return;
    setBusy(true);
    try { const u = await register({ ...form, phone: form.phone || null, address: form.address || null }); navigate(HOME[u.role], { replace: true }); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Shell title="Create your account" subtitle="Browse gowns, suits, costumes and traditional wear." footer={<>Already registered? <Link className="font-medium text-slate-900 underline underline-offset-4 decoration-slate-300 transition-colors hover:decoration-slate-900 dark:text-white dark:decoration-slate-600 dark:hover:decoration-white" to="/login">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Full name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} />
        <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <Input label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Phone (optional)" autoComplete="tel" value={form.phone} onChange={set('phone')} />
          <Input label="Address (optional)" autoComplete="street-address" value={form.address} onChange={set('address')} />
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">{error}</p>}
        <Button type="submit" loading={busy} className="w-full">Create account</Button>
      </form>
    </Shell>
  );
}
