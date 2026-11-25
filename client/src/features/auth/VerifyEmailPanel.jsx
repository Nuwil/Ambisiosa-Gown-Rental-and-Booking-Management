import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { Button } from '../../components/ui/Controls.jsx';
import { DEMO_MODE } from './demoAccounts.js';

export const NOT_VERIFIED = /^Email not verified/;
const RESEND_SECONDS = 60;

/** 6-digit email OTP entry. onVerified(user) receives the session user; onBack returns to the form. */
export default function VerifyEmailPanel({ email, demoCode, onVerified, onBack }) {
  const [code, setCode] = useState('');
  const [hint, setHint] = useState(demoCode || '');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const input = useRef(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { if (wait <= 0) return undefined; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  // Demo has no mailbox: fetch the code to show on screen when arriving without one (e.g. from the login form).
  useEffect(() => { if (DEMO_MODE && !demoCode) api.post('/auth/resend-code', { email }).then((r) => setHint(r.demoCode || '')).catch(() => {}); }, [demoCode, email]);

  const submit = async (e) => {
    e.preventDefault(); setError(''); setNote(''); setBusy(true);
    try { onVerified((await api.post('/auth/verify-email', { email, code })).user); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  const resend = async () => {
    setError(''); setNote('');
    try { const r = await api.post('/auth/resend-code', { email }); setHint(r.demoCode || ''); setNote('A new code is on its way.'); setWait(RESEND_SECONDS); }
    catch (err) { setError(err.message); }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-slate-500">We sent a 6-digit code to <strong className="font-medium text-slate-900 dark:text-white">{email}</strong>. It expires in 10 minutes.</p>
      {DEMO_MODE && hint && <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm dark:border-slate-700">Demo mode — no email is sent. Your code: <strong className="font-mono tracking-widest">{hint}</strong></p>}
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Verification code</span>
        <input ref={input} className="input text-center font-mono text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="Verification code"
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
      </label>
      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">{error}</p>}
      {note && <p role="status" className="text-sm text-slate-500">{note}</p>}
      <Button type="submit" loading={busy} className="w-full" disabled={code.length !== 6}>Verify and continue</Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" className="text-slate-500 underline underline-offset-4" onClick={onBack}>Use a different email</button>
        <button type="button" className="font-medium underline underline-offset-4 disabled:no-underline disabled:opacity-50" disabled={wait > 0} onClick={resend}>{wait > 0 ? `Resend in ${wait}s` : 'Resend code'}</button>
      </div>
    </form>
  );
}
