import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { site } from './lib/site.js';

const linkClass = 'relative py-1 text-sm text-ink-2 transition-colors duration-200 hover:text-ink after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-ink after:transition-transform after:duration-300 hover:after:scale-x-100';

export default function Navbar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <nav className="container-x flex h-16 items-center justify-between" aria-label="Main">
        <a href="#home" className="text-2xl font-bold tracking-tight" onClick={() => setOpen(false)}>{site.name}</a>
        <ul className="hidden items-center gap-9 md:flex">
          {site.nav.map((link) => <li key={link.href}><a href={link.href} className={linkClass}>{link.label}</a></li>)}
        </ul>
        <div className="flex items-center gap-2">
          <Link to={site.loginHref} className="rounded-none border border-ink bg-ink px-5 py-2 text-sm font-semibold text-paper transition-colors duration-200 hover:bg-transparent hover:text-ink">Login</Link>
          <button type="button" className="rounded-none border border-ink/30 p-2 transition-colors hover:border-ink md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((value) => !value)}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h10" />}
            </svg>
          </button>
        </div>
      </nav>
      {open && (
        <div id="mobile-menu" className="border-t border-line bg-paper md:hidden">
          <ul className="container-x divide-y divide-line py-2">
            {site.nav.map((link) => <li key={link.href}><a href={link.href} onClick={() => setOpen(false)} className="block py-4 text-base font-medium">{link.label}</a></li>)}
          </ul>
        </div>
      )}
    </header>
  );
}
