const BASE = '/api';

async function req(path, opts = {}) {
  const r = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error((data && data.error) || `HTTP ${r.status}`);
  return data;
}

export const api = {
  themes: () => req('/themes'),
  themeMessages: (id, { page = 1, limit = 20, q = '' } = {}) =>
    req(`/themes/${id}/messages?page=${page}&limit=${limit}&q=${encodeURIComponent(q)}`),
  message: (id) => req(`/messages/${id}`),
  tags: (themeId = null) => req('/tags' + (themeId ? `?theme_id=${themeId}` : '')),
  mediaUrl: (messageId, index) => `${BASE}/media/${messageId}/${index}`,
  thumbUrl: (thumbPath) => thumbPath ? `${BASE}/media/thumb/${thumbPath}` : null,

  // auth
  me: () => req('/auth/me'),
  login: (password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => req('/auth/logout', { method: 'POST' }),
  changePassword: (current, next) => req('/auth/password', { method: 'POST', body: JSON.stringify({ current, next }) }),

  // admin
  adminThemes: () => req('/admin/themes'),
  createTheme: (name, sortOrder = 0) => req('/admin/themes', { method: 'POST', body: JSON.stringify({ name, sort_order: sortOrder }) }),
  updateTheme: (id, patch) => req(`/admin/themes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTheme: (id) => req(`/admin/themes/${id}`, { method: 'DELETE' }),
  sources: (themeId) => req(`/admin/themes/${themeId}/sources`),
  addSource: (themeId, src) => req(`/admin/themes/${themeId}/sources`, { method: 'POST', body: JSON.stringify(src) }),
  updateSource: (id, patch) => req(`/admin/sources/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteSource: (id) => req(`/admin/sources/${id}`, { method: 'DELETE' }),
  scanTheme: (id, force = false) => req(`/admin/scan/theme/${id}`, { method: 'POST', body: JSON.stringify({ force }) }),
  scanSource: (id, force = false) => req(`/admin/scan/source/${id}`, { method: 'POST', body: JSON.stringify({ force }) }),
  testSource: (src) => req('/admin/sources/test', { method: 'POST', body: JSON.stringify(src) })
};
