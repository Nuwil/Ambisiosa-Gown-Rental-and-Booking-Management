export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

const toQuery = (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') sp.set(k, v); });
  const s = sp.toString();
  return s ? `?${s}` : '';
};

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

/** Turns a response (real or demo) into data, or throws ApiError. Shared so both backends behave identically. */
function settle(status, data, path) {
  if (status === 204) return null;
  if (status >= 400) {
    if (status === 401 && !path.startsWith('/auth/login')) onUnauthorized();
    const detail = data?.details?.map((d) => `${d.field}: ${d.message}`).join('; ');
    throw new ApiError(status, detail ? `${data.message} — ${detail}` : data?.message || 'Request failed', data?.details);
  }
  return data;
}

async function request(method, path, { body, params, form } = {}) {
  if (DEMO) { // static showcase: an in-memory mock of the API, never the network
    const { dispatch } = await import('./demo/index.js');
    const r = await dispatch(method, path, { body, params, form });
    return settle(r.status, r.data, path);
  }
  let res;
  try {
    res = await fetch(`/api${path}${toQuery(params)}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  return settle(res.status, res.status === 204 ? null : await res.json().catch(() => null), path);
}

export const api = {
  get: (path, params) => request('GET', path, { params }),
  post: (path, body) => request('POST', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  del: (path) => request('DELETE', path),
  upload: (path, form) => request('POST', path, { form }),
};

/** Download a binary endpoint (reports, backups) via the authenticated session. */
export async function download(path, params, fallbackName = 'download') {
  if (DEMO) {
    const { dispatch } = await import('./demo/index.js');
    const r = await dispatch('GET', path, { params });
    if (r.status >= 400) throw new ApiError(r.status, r.data?.message || 'Download failed');
    return saveBlob(r.blob, r.filename || fallbackName);
  }
  const res = await fetch(`/api${path}${toQuery(params)}`, { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.message || 'Download failed');
  }
  const cd = res.headers.get('content-disposition') || '';
  const name = /filename="?([^";]+)"?/.exec(cd)?.[1] || fallbackName;
  saveBlob(await res.blob(), name);
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
