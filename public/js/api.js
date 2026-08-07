/** Thin wrapper over the IPChek HTTP API. */

const TOKEN_KEY = 'ipchek.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (value) => localStorage.setItem(TOKEN_KEY, value || '');

async function request(path, { method = 'GET', body, signal } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw Object.assign(new Error(payload.error || `HTTP ${response.status}`), { status: response.status });
  }
  return payload;
}

const query = (params) =>
  Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

export const api = {
  meta: () => request('/api/meta'),
  stats: () => request('/api/stats'),

  countries: (params = {}) => request(`/api/countries?${query(params)}`),
  country: (code, params = {}) => request(`/api/countries/${code}?${query(params)}`),
  spacemap: (code, params = {}) => request(`/api/spacemap/${code}?${query(params)}`),

  preview: (code, params = {}, signal) => request(`/api/preview/${code}?${query(params)}`, { signal }),
  exportUrl: (code, format, params = {}) => `/api/export/${code}/${format}?${query(params)}`,

  monitors: () => request('/api/monitors'),
  addMonitor: (body) => request('/api/monitors', { method: 'POST', body }),
  patchMonitor: (id, body) => request(`/api/monitors/${id}`, { method: 'PATCH', body }),
  deleteMonitor: (id) => request(`/api/monitors/${id}`, { method: 'DELETE' }),
  syncMonitor: (id) => request(`/api/monitors/${id}/sync`, { method: 'POST' }),

  sync: (body) => request('/api/sync', { method: 'POST', body }),

  events: (params = {}) => request(`/api/events?${query(params)}`),
  event: (id) => request(`/api/events/${id}`),

  testNotify: () => request('/api/notify/test', { method: 'POST' }),
};
