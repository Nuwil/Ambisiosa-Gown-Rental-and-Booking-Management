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

async function request(method, path, { body, params, form } = {}) {
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
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized();
    const detail = data?.details?.map((d) => `${d.field}: ${d.message}`).join('; ');
    throw new ApiError(res.status, detail ? `${data.message} — ${detail}` : data?.message || 'Request failed', data?.details);
  }
  return data;
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
  const res = await fetch(`/api${path}${toQuery(params)}`, { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.message || 'Download failed');
  }
  const cd = res.headers.get('content-disposition') || '';
  const name = /filename="?([^";]+)"?/.exec(cd)?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
