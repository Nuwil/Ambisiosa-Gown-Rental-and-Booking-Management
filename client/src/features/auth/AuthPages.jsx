import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, HOME } from '../../auth/AuthContext.jsx';
import { Button, Input } from '../../components/ui/Controls.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import GoogleButton, { OrDivider } from './GoogleButton.jsx';
import VerifyEmailPanel, { NOT_VERIFIED } from './VerifyEmailPanel.jsx';
import { DEMO_ACCOUNTS, DEMO_ENABLED, DEMO_MODE, resetDemoData } from './demoAccounts.js';

function Shell({ title, subtitle, children, footer, after }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <aside className="hidden flex-col justify-between bg-slate-900 p-14 text-slate-100 lg:flex dark:border-r dark:border-slate-800 dark:bg-slate-900">
        <p className="font-display text-3xl font-normal">Atelier Rentals</p>
        <div>
          <span className="mb-6 block h-px w-12 bg-brand-300" aria-hidden="true" />
          <p className="max-w-md font-display text-5xl font-normal leading-[1.08]">Gowns, suits, costumes and traditional wear.</p>
          <p className="mt-5 max-w-sm text-sm text-slate-400">Rent by the day or buy, with every booking tracked from request to return.</p>
        </div>
        <p className="text-xs text-slate-500">Rental and booking management</p>
      </aside>
      <main className="flex items-center justify-center px-6 py-12">
        <div className="page-enter w-full max-w-sm">
          <p className="mb-10 font-display text-2xl font-normal lg:hidden">Atelier Rentals</p>
          <h1 className="font-display text-4xl font-normal tracking-tight">{title}</h1>
          <p className="mb-8 mt-2 text-sm text-slate-500">{subtitle}</p>
          {children}
          <p className="mt-8 text-sm text-slate-500">{footer}</p>
          {after}
        </div>
      </main>
    </div>
  );
}

export function LoginPage() {
  const { user, login, loginWithGoogle, completeLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoOpen, setDemoOpen] = useState(true);
  const [demoBusy, setDemoBusy] = useState('');
  const [verify, setVerify] = useState(null); // email awaiting its OTP
  const toast = useToast();
  if (user) return <Navigate to={HOME[user.role]} replace />;

  const signIn = async (email, password) => {
    setError(''); setBusy(true);
    try {
      const u = await login(email.trim(), password);
      const from = location.state?.from;
      navigate(from && from.startsWith(HOME[u.role].split('/').slice(0, 2).join('/')) ? from : HOME[u.role], { replace: true });
    } catch (err) { if (err.status === 403 && NOT_VERIFIED.test(err.message)) setVerify(email.trim().toLowerCase()); else setError(err.message); } finally { setBusy(false); setDemoBusy(''); }
  };
  const goHome = (u) => navigate(HOME[u.role], { replace: true });
  const google = async (credential) => { setError(''); try { goHome(await loginWithGoogle(credential)); } catch (err) { setError(err.message); } };
  const submit = (e) => { e.preventDefault(); signIn(form.email, form.password); };
  const useDemo = (a) => { setDemoBusy(a.role); setForm({ email: a.email, password: a.password }); signIn(a.email, a.password); };

  if (verify) return <Shell title="Verify your email" subtitle="Confirm it's really you to finish signing in." footer={null}><VerifyEmailPanel email={verify} onVerified={(u) => goHome(completeLogin(u))} onBack={() => setVerify(null)} /></Shell>;

  return (
    <Shell title="Welcome back" subtitle="Sign in to manage or book rentals." footer={<>New renter? <Link className="font-medium text-slate-900 underline underline-offset-4 decoration-slate-300 transition-colors hover:decoration-slate-900 dark:text-white dark:decoration-slate-600 dark:hover:decoration-white" to="/register">Create an account</Link></>}
      after={DEMO_ENABLED && (
        <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
          <Button type="button" variant="secondary" className="w-full" aria-expanded={demoOpen} aria-controls="demo-accounts" onClick={() => setDemoOpen((o) => !o)}>
            Demo accounts <Icon name="chevron-down" className={`h-4 w-4 transition-transform ${demoOpen ? 'rotate-180' : ''}`} />
          </Button>
          <ul id="demo-accounts" inert={!demoOpen} className={`grid gap-2 overflow-hidden transition-all duration-300 ${demoOpen ? 'mt-3 max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.role}>
                <button type="button" disabled={busy} onClick={() => useDemo(a)} className="card flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-slate-900 disabled:opacity-60 dark:hover:border-white">
                  <Icon name={a.icon} className="h-5 w-5 shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{a.label}{demoBusy === a.role && ' …'}</span>
                    <span className="block truncate text-xs text-slate-500">{a.blurb}</span>
                  </span>
                  <Icon name="arrow-up-right" className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
          {DEMO_MODE && (
            <p className="mt-3 text-xs text-slate-500">
              Demo mode — data resets when you close the tab.{' '}
              <button type="button" className="font-medium underline underline-offset-4 decoration-slate-300 transition-colors hover:decoration-slate-900 dark:decoration-slate-600 dark:hover:decoration-white" onClick={() => resetDemoData().then(() => toast.success('Demo data reset'))}>Reset demo data</button>
            </p>
          )}
        </div>
      )}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">{error}</p>}
        <Button type="submit" loading={busy} className="w-full" disabled={!form.email || !form.password}>Sign in</Button>
      </form>
      <OrDivider />
      <GoogleButton onCredential={google} onError={setError} disabled={busy} />
    </Shell>
  );
}

export function RegisterPage() {
  const { user, register, completeLogin, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', address: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // { email, demoCode } once the OTP has been emailed
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
    try { const r = await register({ ...form, phone: form.phone || null, address: form.address || null }); setPending({ email: r.email, demoCode: r.demoCode }); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const google = async (credential) => { setError(''); try { const u = await loginWithGoogle(credential); navigate(HOME[u.role], { replace: true }); } catch (err) { setError(err.message); } };

  if (pending) return <Shell title="Verify your email" subtitle="One last step before your account is activated." footer={null}><VerifyEmailPanel email={pending.email} demoCode={pending.demoCode} onVerified={(u) => navigate(HOME[completeLogin(u).role], { replace: true })} onBack={() => setPending(null)} /></Shell>;

  return (
    <Shell title="Create your account" subtitle="Browse gowns, suits, costumes and traditional wear." footer={<>Already registered? <Link className="font-medium text-slate-900 underline underline-offset-4 decoration-slate-300 transition-colors hover:decoration-slate-900 dark:text-white dark:decoration-slate-600 dark:hover:decoration-white" to="/login">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Full name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} />
        <Input label="Email" type="email" autoComplete="email" required hint="We'll email a 6-digit code to confirm it." value={form.email} onChange={set('email')} error={errors.email} />
        <Input label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Phone (optional)" autoComplete="tel" value={form.phone} onChange={set('phone')} />
          <Input label="Address (optional)" autoComplete="street-address" value={form.address} onChange={set('address')} />
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">{error}</p>}
        <Button type="submit" loading={busy} className="w-full">Create account</Button>
      </form>
      <OrDivider />
      <GoogleButton onCredential={google} onError={setError} disabled={busy} />
    </Shell>
  );
}
