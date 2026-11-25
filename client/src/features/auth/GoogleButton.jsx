import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Controls.jsx';
import { DEMO_MODE } from './demoAccounts.js';

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
let gisPromise;
const loadGis = () => (gisPromise ??= new Promise((resolve, reject) => {
  if (window.google?.accounts?.id) return resolve(window.google);
  const s = Object.assign(document.createElement('script'), { src: GIS_SRC, async: true, defer: true });
  s.onload = () => resolve(window.google);
  s.onerror = () => { gisPromise = undefined; reject(new Error('Could not load Google sign-in')); };
  document.head.appendChild(s);
}));

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
    <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

/**
 * "Continue with Google". Real mode renders Google's own button (Google Identity Services) and hands the signed ID token
 * to onCredential; the server verifies it. Demo mode shows a simulated button that signs in as a sample Google user.
 */
export default function GoogleButton({ onCredential, onError, disabled }) {
  const box = useRef(null);
  const [busy, setBusy] = useState(false);
  const cb = useRef(onCredential);
  cb.current = onCredential;

  useEffect(() => {
    if (DEMO_MODE || !GOOGLE_CLIENT_ID) return undefined;
    let dead = false;
    loadGis().then((google) => {
      if (dead || !box.current) return;
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => cb.current(r.credential) });
      google.accounts.id.renderButton(box.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: Math.min(box.current.clientWidth || 320, 400) });
    }).catch((e) => onError?.(e.message));
    return () => { dead = true; };
  }, [onError]);

  if (!DEMO_MODE && GOOGLE_CLIENT_ID) return <div ref={box} className="flex min-h-[44px] w-full justify-center" aria-label="Continue with Google" />;

  const run = async () => {
    if (!DEMO_MODE) return onError?.('Google sign-in is not configured. Set GOOGLE_CLIENT_ID (server) and VITE_GOOGLE_CLIENT_ID (client).');
    setBusy(true);
    try { await onCredential('demo-google:google.demo@example.com'); } finally { setBusy(false); }
  };
  return (
    <Button type="button" variant="secondary" className="w-full" loading={busy} disabled={disabled} onClick={run}>
      <GoogleMark /> Continue with Google{DEMO_MODE && <span className="text-xs font-normal text-slate-500">(simulated)</span>}
    </Button>
  );
}

export const OrDivider = () => (
  <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400" role="separator">
    <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />or<span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
  </div>
);
