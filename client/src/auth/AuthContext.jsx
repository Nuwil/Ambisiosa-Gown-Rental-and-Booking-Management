import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api/client.js';
import { clearDemoUser, DEMO_MODE, getDemoUser, setDemoUser as selectDemoUser } from '../demo/session.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export const HOME = { admin: '/admin/dashboard', owner: '/owner/dashboard', staff: '/owner/dashboard', renter: '/renter/dashboard' };

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try { localStorage.setItem('theme', theme); } catch { /* storage unavailable */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const setSession = useCallback((u) => { setUser(u); if (u) applyTheme(u.theme); }, []);

  useEffect(() => {
    if (DEMO_MODE) {
      setSession(getDemoUser());
      setLoading(false);
      return;
    }
    setUnauthorizedHandler(() => setUser(null));
    api.get('/auth/me').then((r) => setSession(r.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, [setSession]);

  const login = useCallback(async (email, password) => { const r = await api.post('/auth/login', { email, password }); setSession(r.user); return r.user; }, [setSession]);
  const demoLogin = useCallback((role) => { const u = selectDemoUser(role); setSession(u); return u; }, [setSession]);
  const register = useCallback(async (data) => { const r = await api.post('/auth/register', data); setSession(r.user); return r.user; }, [setSession]);
  const logout = useCallback(async () => {
    if (DEMO_MODE) { clearDemoUser(); setUser(null); return; }
    try { await api.post('/auth/logout'); } finally { setUser(null); }
  }, []);
  const updateProfile = useCallback(async (data) => {
    if (DEMO_MODE) { const updated = { ...user, ...data }; setUser(updated); return updated; }
    const r = await api.put('/auth/profile', data); setUser(r.user); return r.user;
  }, [user]);
  const setTheme = useCallback(async (theme) => {
    applyTheme(theme);
    setUser((u) => (u ? { ...u, theme } : u));
    if (DEMO_MODE) return;
    try { await api.put('/auth/theme', { theme }); } catch { /* UI already updated; will resync next login */ }
  }, []);

  const value = useMemo(() => ({ user, loading, login, demoLogin, register, logout, updateProfile, setTheme }), [user, loading, login, demoLogin, register, logout, updateProfile, setTheme]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
