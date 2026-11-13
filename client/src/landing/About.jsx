const cell = 'border p-7 sm:p-9';

export default function About() {
  return (
    <section id="about" className="scroll-mt-16 border-b border-line">
      <div className="container-x py-20 sm:py-28">
        <div className="mb-12 max-w-2xl">
          <p className="eyebrow">About the service</p>
          <h2 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Everything you need from a rental counter, online.</h2>
        </div>
        <div className="grid grid-flow-dense gap-4 md:grid-cols-12">
          <article className={`${cell} border-line bg-card md:col-span-7 md:row-span-2 md:p-12`}>
            <p className="eyebrow">Rent or buy</p>
            <h3 className="mt-5 font-display text-5xl leading-[1.02] sm:text-6xl">A fitting room that is open all day.</h3>
            <p className="mt-6 max-w-lg leading-relaxed text-ink-2">Look through gowns, suits, costumes and traditional wear on your phone or laptop. Check what is available for your dates, then send a booking request in a few minutes. Rent by the day, or buy selected pieces outright.</p>
          </article>
          <article className={`${cell} border-ink bg-ink text-paper md:col-span-5`}>
            <p className="font-display text-3xl text-paper/60">01</p>
            <h3 className="mt-6 text-xl font-semibold">Live availability</h3>
            <p className="mt-2 text-sm leading-relaxed text-paper/75">Each item shows its sizes and how many are free, so you never request something that is already booked.</p>
          </article>
          <article className={`${cell} border-line bg-card md:col-span-5`}>
            <p className="font-display text-3xl text-accent">02</p>
            <h3 className="mt-6 text-xl font-semibold">Request your dates</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">Choose a start date and a return date. The shop reviews your request and confirms the booking.</p>
          </article>
          <article className={`${cell} border-line bg-card md:col-span-4`}>
            <p className="font-display text-3xl text-accent">03</p>
            <h3 className="mt-6 text-xl font-semibold">Return reminders</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">Due-date alerts show up before the return date, so nothing is handed back late.</p>
          </article>
          <article className={`${cell} border-line bg-paper-2 md:col-span-4`}>
            <p className="font-display text-3xl text-accent">04</p>
            <h3 className="mt-6 text-xl font-semibold">Gowns to barong</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">Evening wear, formal suits, costumes and traditional wear, all in one catalog.</p>
          </article>
          <article className={`${cell} border-line bg-card md:col-span-4`} style={{ borderTopColor: 'var(--color-accent)', borderTopWidth: 3 }}>
            <p className="font-display text-3xl text-accent">05</p>
            <h3 className="mt-6 text-xl font-semibold">Built for shop owners too</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">The same system tracks inventory, customers, payments and overdue rentals.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
