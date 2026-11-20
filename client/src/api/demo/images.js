/** Generated SVG "photos" (data URIs) so the demo never requests /uploads/... files. */

const PALETTE = {
  emerald: '#0f7b5f', blush: '#e8a9b5', navy: '#1f2d5c', ivory: '#e9e1cf', black: '#1c1c1f', charcoal: '#3d4148', gold: '#c49a3a',
  brown: '#6e4b32', cream: '#e2d4b8', rose: '#c9657a', red: '#b3262e', white: '#ececec', assorted: '#7a5c8e', burgundy: '#6d1f35',
  champagne: '#d9bf94', blue: '#2a5fa8', lavender: '#a692c9', grey: '#6b7280', green: '#2f6b45', silver: '#9aa3ad', plum: '#5e2d5a',
  pink: '#e58fb0', maroon: '#7a2130', teal: '#1f7a80', mustard: '#c99a1a',
};
const hexFor = (color = '') => PALETTE[color.toLowerCase().split(/[ /,-]/)[0]] ?? '#5b6475';

const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, ((n >> s) & 255) + amt));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
};

// Simple silhouettes on a 300x400 canvas, one per category family.
const SHAPES = {
  gown: 'M150 70c14 0 22 10 22 26 0 20-8 34-8 52 20 40 62 130 72 210H64c10-80 52-170 72-210 0-18-8-32-8-52 0-16 8-26 22-26z',
  suit: 'M110 90l40-18 40 18 36 22-12 200h-48l-16-120-16 120H86L74 112z M150 72l-18 70 18 30 18-30z',
  costume: 'M80 120c0-40 30-60 70-60s70 20 70 60c0 30-20 40-20 70v120H100V190c0-30-20-40-20-70z',
  traditional: 'M100 80l50-14 50 14 24 40-30 14-20-26v210h-48V108l-20 26-30-14z',
  accessory: 'M80 140c0 80 30 120 70 120s70-40 70-120M150 262m-22 0a22 22 0 1 0 44 0a22 22 0 1 0-44 0',
};
const shapeFor = (category = '') => {
  const c = category.toLowerCase();
  return c.includes('gown') ? SHAPES.gown : c.includes('suit') ? SHAPES.suit : c.includes('costume') ? SHAPES.costume : c.includes('tradition') ? SHAPES.traditional : SHAPES.accessory;
};

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]);
const cache = new Map();

/** `variant` 1 = front view, 2 = alternate tone/composition. */
export function svgImage({ name, color, category }, variant = 1) {
  const key = `${name}|${color}|${category}|${variant}`;
  if (cache.has(key)) return cache.get(key);
  const base = hexFor(color);
  const a = variant === 1 ? shade(base, 40) : shade(base, -30);
  const b = variant === 1 ? shade(base, -45) : shade(base, 55);
  const label = name.length > 26 ? `${name.slice(0, 25)}...` : name;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="600" height="800">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="${variant === 1 ? 1 : 0}" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`
    + `<rect width="300" height="400" fill="url(#g)"/>`
    + `<g transform="${variant === 1 ? '' : 'translate(300 0) scale(-1 1)'}"><path d="${shapeFor(category)}" fill="#fff" fill-opacity="0.22" stroke="#fff" stroke-opacity="0.5" stroke-width="2"/></g>`
    + `<rect y="340" width="300" height="60" fill="#000" fill-opacity="0.28"/>`
    + `<text x="150" y="376" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="#fff">${esc(label)}</text></svg>`;
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(key, uri);
  return uri;
}

/** Image rows hold `gen:<n>` (generated from the item's current name/colour) or a data URI (an upload). */
export function imageUrl(img, item, category) {
  if (img.path.startsWith('gen:')) return svgImage({ name: item.name, color: item.color ?? '', category }, Number(img.path.slice(4)) || 1);
  return img.path;
}

/** Reads an uploaded File into a compact data URI (downscaled when large) so it survives in sessionStorage. */
export async function fileToDataUrl(file, maxSide = 720) {
  const raw = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  if (file.size < 150 * 1024) return raw;
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = raw; });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch { return raw; }
}
