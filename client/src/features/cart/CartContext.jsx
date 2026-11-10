import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const Ctx = createContext({ count: 0, setCount: () => {}, refresh: () => {} });
export const useCart = () => useContext(Ctx);

/** Cart badge state. Only renters have a cart; other roles never hit the endpoint. */
export function CartProvider({ children }) {
  const { user } = useAuth();
  const isRenter = user?.role === 'renter';
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => (isRenter ? api.get('/cart/count').then((r) => setCount(r.count)).catch(() => {}) : undefined), [isRenter]);
  useEffect(() => { refresh(); }, [refresh]);
  const value = useMemo(() => ({ count, setCount, refresh }), [count, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
