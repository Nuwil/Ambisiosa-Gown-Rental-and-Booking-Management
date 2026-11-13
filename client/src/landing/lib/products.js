export const products = [
  { id: 1, name: 'Emerald Evening Gown', category: 'Gowns', price: 1500, sizes: ['S', 'M', 'L'], tone: ['#cfd6c8', '#4f6b5a'] },
  { id: 2, name: 'Navy Three-piece Suit', category: 'Suits', price: 1620, sizes: ['M', 'L', 'XL'], tone: ['#c9d1da', '#2f3f5c'] },
  { id: 3, name: 'Barong Tagalog', category: 'Traditional wear', price: 1200, sizes: ['S', 'M', 'L', 'XL'], tone: ['#e6dcc2', '#a38b52'] },
  { id: 4, name: 'Rose Ball Gown', category: 'Gowns', price: 2100, sizes: ['XS', 'S', 'M'], tone: ['#e2cdd0', '#97586a'] },
  { id: 5, name: 'Charcoal Tuxedo', category: 'Suits', price: 1850, sizes: ['M', 'L', 'XL'], tone: ['#cfcdd4', '#3d3b46'] },
];

export const peso = (value) => `₱${Number(value).toLocaleString('en-PH')}`;
