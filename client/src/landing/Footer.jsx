import { Link } from 'react-router-dom';
import { site } from './lib/site.js';

export default function Footer() {
  return (
    <footer className="bg-ink text-paper">
      <div className="container-x grid gap-12 py-16 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="text-3xl font-bold tracking-tight">{site.name}</p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-paper/70">{site.tagline}. Browse, book and return, all in one place.</p>
        </div>
        <nav className="md:col-span-3" aria-label="Footer">
          <p className="eyebrow !text-paper/50">Navigate</p>
          <ul className="mt-5 space-y-3 text-sm">
            {site.nav.map((link) => <li key={link.href}><a href={link.href} className="text-paper/80 transition-colors hover:text-paper">{link.label}</a></li>)}
            <li><Link to={site.loginHref} className="text-paper/80 transition-colors hover:text-paper">Login</Link></li>
          </ul>
        </nav>
        <div className="md:col-span-4">
          <p className="eyebrow !text-paper/50">Get in touch</p>
          <ul className="mt-5 space-y-3 text-sm text-paper/80">
            <li>{site.contact.email}</li><li>{site.contact.phone}</li><li>{site.contact.address}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-paper/15">
        <p className="container-x py-6 text-xs text-paper/50">&copy; {new Date().getFullYear()} {site.name}. All rights reserved.</p>
      </div>
    </footer>
  );
}
