import { Link } from 'react-router-dom';
import Arrow from './Arrow.jsx';
import { products, peso } from './lib/products.js';
import { site } from './lib/site.js';

function Media({ product }) {
  if (product.image) {
    return <img src={product.image} alt={product.name} className="absolute inset-0 h-full w-full object-cover" />;
  }
  return (
    <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${product.tone[0]}, ${product.tone[1]})` }} role="img" aria-label={`${product.name} (photo coming soon)`}>
      <span className="absolute bottom-3 left-4 font-display text-6xl leading-none text-paper/85">{product.name[0]}</span>
    </div>
  );
}

export default function ShopPreview() {
  return (
    <section id="shop-preview" className="scroll-mt-16 border-b border-line bg-paper-2">
      <div className="container-x py-20 sm:py-28">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="eyebrow">Shop preview</p>
            <h2 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Featured rentals</h2>
          </div>
          <p className="max-w-xs text-sm text-ink-2">A small selection from the collection. Prices are per day.</p>
        </div>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {products.map((product) => (
            <li key={product.id}>
              <article className="group h-full border border-line bg-card transition-colors duration-300 hover:border-ink">
                <div className="relative aspect-[3/4] overflow-hidden"><Media product={product} /></div>
                <div className="p-4">
                  <p className="eyebrow">{product.category}</p>
                  <h3 className="mt-1.5 font-semibold leading-snug">{product.name}</h3>
                  <p className="mt-3 flex items-baseline justify-between gap-2">
                    <span><strong className="font-semibold tabular-nums">{peso(product.price)}</strong><span className="text-xs text-muted"> / day</span></span>
                  </p>
                  <p className="mt-3 flex flex-wrap gap-1.5">
                    {product.sizes.map((size) => <span key={size} className="border border-line px-1.5 py-0.5 text-[11px] text-ink-2">{size}</span>)}
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>
        <div className="mt-12 flex justify-center">
          <Link to={site.catalogHref} className="btn-primary">View Full Catalog<Arrow /></Link>
        </div>
      </div>
    </section>
  );
}
