import { useState } from 'react';
import Arrow from './Arrow.jsx';
import { site } from './lib/site.js';

const EMPTY = { name: '', email: '', topic: 'rent', message: '', company: '' };

export default function Contact() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function onSubmit(event) {
    event.preventDefault();
    setStatus({ state: 'sending', message: '' });
    try {
      const response = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.message || 'Something went wrong. Please try again.');
      setForm(EMPTY);
      setStatus({ state: 'success', message: 'Thank you. Your message has been sent and we will reply by email.' });
    } catch (error) {
      setStatus({ state: 'error', message: error.message });
    }
  }

  const sending = status.state === 'sending';
  const { contact } = site;

  return (
    <section id="contact" className="scroll-mt-16">
      <div className="container-x grid gap-14 py-20 sm:py-28 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <p className="eyebrow">Contact</p>
          <h2 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Questions about a booking?</h2>
          <p className="mt-6 max-w-md leading-relaxed text-ink-2">Tell us what you are looking for and the date you need it. We will get back to you by email.</p>
          <dl className="mt-10 divide-y divide-line border-y border-line text-sm">
            {[
              ['Email', contact.email],
              ['Phone', contact.phone],
              ['Visit', contact.address],
              ['Hours', contact.hours],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[5rem_1fr] gap-4 py-4"><dt className="text-muted">{label}</dt><dd className="font-medium">{value}</dd></div>
            ))}
          </dl>
        </div>
        <form onSubmit={onSubmit} className="border border-ink bg-card p-6 sm:p-10 lg:col-span-7" aria-describedby="inquiry-status">
          <div className="grid gap-6 sm:grid-cols-2">
            <label className="block"><span className="eyebrow mb-2 block">Name</span><input className="field" name="name" autoComplete="name" required maxLength={120} value={form.name} onChange={set('name')} /></label>
            <label className="block"><span className="eyebrow mb-2 block">Email</span><input className="field" type="email" name="email" autoComplete="email" required maxLength={191} value={form.email} onChange={set('email')} /></label>
          </div>
          <label className="mt-6 block">
            <span className="eyebrow mb-2 block">I am interested in</span>
            <select className="field" name="topic" value={form.topic} onChange={set('topic')}>
              <option value="rent">Renting an item</option>
              <option value="buy">Buying an item</option>
              <option value="other">Something else</option>
            </select>
          </label>
          <label className="mt-6 block"><span className="eyebrow mb-2 block">Message</span><textarea className="field min-h-36 resize-y" name="message" required minLength={10} maxLength={2000} value={form.message} onChange={set('message')} /></label>
          <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
            <label>Company<input tabIndex={-1} autoComplete="off" name="company" value={form.company} onChange={set('company')} /></label>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <button type="submit" className="btn-primary" disabled={sending}>{sending ? 'Sending' : 'Send inquiry'}{!sending && <Arrow />}</button>
            <p id="inquiry-status" role="status" aria-live="polite" className={`text-sm ${status.state === 'error' ? 'text-accent' : 'text-ink-2'}`}>{status.message}</p>
          </div>
        </form>
      </div>
    </section>
  );
}
