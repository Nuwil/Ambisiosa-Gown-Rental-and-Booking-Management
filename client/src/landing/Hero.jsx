import Arrow from './Arrow.jsx';

const steps = [
  ['01', 'Browse', 'Filter by size, colour and price.'],
  ['02', 'Book', 'Choose your rental dates.'],
  ['03', 'Return', 'Get reminders before the due date.'],
];
const categories = ['Gowns', 'Suits', 'Costumes', 'Traditional wear'];

export default function Hero() {
  return (
    <section id="home" className="scroll-mt-16 border-b border-line">
      <div className="container-x grid gap-14 py-16 sm:py-20 lg:grid-cols-12 lg:gap-10 lg:py-28">
        <div className="lg:col-span-7">
          <p className="eyebrow">Gown, suit and traditional wear rental</p>
          <h1 className="mt-6 text-[clamp(2.9rem,8.2vw,6.75rem)] font-bold leading-[0.95] tracking-[-0.035em]">
            Rent the look.<br />Keep the <em className="font-display font-normal italic tracking-normal text-accent">moment</em>.
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-2">
            Ambisiosa is a rental and booking service for gowns, suits, costumes and traditional wear. Browse what is in stock, pick your dates and send a booking request. Rent by the day, or buy the piece outright.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <a href="#shop-preview" className="btn-primary">Browse the collection<Arrow /></a>
            <a href="#about" className="group inline-flex items-center gap-2 text-sm font-semibold text-ink">
              <span className="border-b border-ink/40 pb-0.5 transition-colors group-hover:border-ink">How it works</span>
            </a>
          </div>
        </div>
        <ol className="self-end border border-ink bg-card lg:col-span-5" aria-label="How it works in three steps">
          {steps.map(([number, title, text]) => (
            <li key={number} className="grid grid-cols-[3.25rem_1fr] items-baseline gap-2 border-b border-line px-6 py-6 last:border-b-0 sm:px-8">
              <span className="font-display text-3xl text-accent">{number}</span>
              <div><p className="text-lg font-semibold">{title}</p><p className="mt-1 text-sm text-ink-2">{text}</p></div>
            </li>
          ))}
        </ol>
      </div>
      <div className="border-t border-line">
        <ul className="container-x grid grid-cols-2 sm:grid-cols-4">
          {categories.map((category, index) => (
            <li key={category} className={`py-5 text-sm font-medium text-ink-2 ${index > 0 ? 'sm:border-l sm:border-line sm:pl-6' : ''} ${index % 2 === 1 ? 'border-l border-line pl-4 sm:pl-6' : ''}`}>{category}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
