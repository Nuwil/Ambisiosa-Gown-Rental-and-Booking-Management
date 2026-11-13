// Minimal 24px line icon set (1.5 stroke). Every glyph in the UI comes from here — no emoji or text symbols.
const PATHS = {
  dashboard: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z',
  analytics: 'M4 4v16h16M8 16v-5m4 5V8m4 8v-3',
  settings: 'M4 7h9m4 0h3M4 17h3m4 0h9M15 4v6M9 14v6',
  customers: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  inventory: 'M21 8l-9-5-9 5m18 0v8l-9 5m9-13l-9 5m0 8l-9-5V8m9 13v-8M3 8l9 5',
  transactions: 'M7 16V5m0 0L4 8m3-3l3 3M17 8v11m0 0l3-3m-3 3l-3-3',
  rent: 'M6 7h12l1 13H5L6 7zM9 7a3 3 0 0 1 6 0',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  bell: 'M6 9a6 6 0 1 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9zM10 20a2 2 0 0 0 4 0',
  menu: 'M4 7h16M4 12h16M4 17h10',
  logout: 'M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m6-4l4-4-4-4m4 4H10',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2m0 15v2M4.6 4.6l1.4 1.4m12 12l1.4 1.4M2.5 12h2m15 0h2M4.6 19.4L6 18M18 6l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  cart: 'M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.45-1.1L20 8H6.2M9.5 20h.01M17.5 20h.01',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  close: 'M6 6l12 12M18 6L6 18',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'arrow-left': 'M19 12H5m6-6l-6 6 6 6',
  'arrow-up-right': 'M7 17L17 7M8 7h9v9',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5',
  filter: 'M4 7h16M7 12h10M10 17h4',
  alert: 'M12 4l9 16H3L12 4zM12 10v4m0 3h.01',
  check: 'M5 12.5l4.5 4.5L19 7',
  'id-card': 'M3 6h18v12H3zM8 11.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5zM5.5 16c.4-1.4 1.4-2 2.5-2s2.1.6 2.5 2M13.5 10h4.5M13.5 14h3',
  contract: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M9 12h6M8.5 17c1-1.6 1.8-1.6 2.2-.6s1 .6 1.8-.6',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5m0-8h.01',
};

export default function Icon({ name, className = 'h-5 w-5', strokeWidth = 1.5 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name] || PATHS.dashboard} />
    </svg>
  );
}
