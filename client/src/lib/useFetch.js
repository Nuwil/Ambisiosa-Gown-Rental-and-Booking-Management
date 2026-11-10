import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

/** GET helper with loading/error/reload. Ignores stale responses when params change quickly. */
export function useFetch(path, params, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const seq = useRef(0);
  const key = JSON.stringify([path, params]);

  const load = useCallback(async () => {
    if (!enabled || !path) return;
    const id = ++seq.current;
    setLoading(true); setError(null);
    try {
      const res = await api.get(path, params);
      if (id === seq.current) setData(res);
    } catch (e) {
      if (id === seq.current) setError(e);
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

/** Debounce a rapidly changing value (search boxes). */
export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
