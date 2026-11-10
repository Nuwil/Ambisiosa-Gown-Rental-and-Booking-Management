import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, HOME } from '../../auth/AuthContext.jsx';
import { Button, Input } from '../../components/ui/Controls.jsx';

function Shell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4 py-10 dark:from-slate-950 dark:via-slate-950 dark:to-brand-800/20">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-2xl font-semibold tracking-tight text-brand-700 dark:text-brand-300">Atelier Rentals</p>
        <div className="card p-6 shadow-lg sm:p-8">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">{subtitle}</p>
          {children}
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">{footer}</p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={HOME[user.role]} replace />;

  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const u = await login(form.email.trim(), form.password);
      const from = location.state?.from;
      navigate(from && from.startsWith(HOME[u.role].split('/').slice(0, 2).join('/')) ? from : HOME[u.role], { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Shell title="Welcome back" subtitle="Sign in to manage or book rentals." footer={<>New renter? <Link className="font-medium text-brand-600 hover:underline" to="/register">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
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
    <Shell title="Create your account" subtitle="Browse gowns, suits, costumes and traditional wear." footer={<>Already registered? <Link className="font-medium text-brand-600 hover:underline" to="/login">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Full name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} />
        <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <Input label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Phone (optional)" autoComplete="tel" value={form.phone} onChange={set('phone')} />
          <Input label="Address (optional)" autoComplete="street-address" value={form.address} onChange={set('address')} />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        <Button type="submit" loading={busy} className="w-full">Create account</Button>
      </form>
    </Shell>
  );
}
