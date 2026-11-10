import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api/client.js';

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
    setUnauthorizedHandler(() => setUser(null));
    api.get('/auth/me').then((r) => setSession(r.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, [setSession]);

  const login = useCallback(async (email, password) => { const r = await api.post('/auth/login', { email, password }); setSession(r.user); return r.user; }, [setSession]);
  const register = useCallback(async (data) => { const r = await api.post('/auth/register', data); setSession(r.user); return r.user; }, [setSession]);
  const logout = useCallback(async () => { try { await api.post('/auth/logout'); } finally { setUser(null); } }, []);
  const updateProfile = useCallback(async (data) => { const r = await api.put('/auth/profile', data); setUser(r.user); return r.user; }, []);
  const setTheme = useCallback(async (theme) => {
    applyTheme(theme);
    setUser((u) => (u ? { ...u, theme } : u));
    try { await api.put('/auth/theme', { theme }); } catch { /* UI already updated; will resync next login */ }
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout, updateProfile, setTheme }), [user, loading, login, register, logout, updateProfile, setTheme]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
