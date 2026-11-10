const PATHS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  analytics: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.6 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7.400 7.400 0 0 0 0 2.400l-2 1.500 2 3.400 2.300-.900a7 7 0 0 0 2 1.200l.400 2.600h4l.400-2.600a7 7 0 0 0 2-1.200l2.300.900 2-3.400-2-1.500c.1-.4.100-.8.100-1.200z',
  customers: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.870M16 3.130a4 4 0 0 1 0 7.750',
  inventory: 'M21 8 12 3 3 8m18 0-9 5m9-5v8l-9 5m0-8L3 8m9 5v8M3 8v8l9 5',
  transactions: 'M7 16V4m0 0L3 8m4-4 4 4m6 0v12m0 0 4-4m-4 4-4-4',
  rent: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zm11 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9m-4.270 13a2 2 0 0 1-3.460 0',
  menu: 'M3 12h18M3 6h18M3 18h18',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2m0 18v2M4.220 4.220l1.420 1.420m12.720 12.720 1.420 1.420M1 12h2m18 0h2M4.220 19.780l1.420-1.420M18.360 5.640l1.420-1.420',
  moon: 'M21 12.790A9 9 0 1 1 11.210 3 7 7 0 0 0 21 12.790z',
  cart: 'M1 1h4l2.700 13.400a2 2 0 0 0 2 1.600h9.700a2 2 0 0 0 2-1.600L23 6H6M9 21a1 1 0 1 0 0 .01M20 21a1 1 0 1 0 0 .01',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
};

export default function Icon({ name, className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name] || PATHS.dashboard} />
    </svg>
  );
}
