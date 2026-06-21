const BASE = '/api';

async function req(path, opts = {}) {
  const response = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error((data && data.error) || `HTTP ${response.status}`);
  }
  return data;
}

export const api = {
  themes: () => req('/themes'),
  themeMessages: (id, { page = 1, limit = 20, q = '' } = {}) =>
    req(`/themes/${id}/messages?page=${page}&limit=${limit}&q=${encodeURIComponent(q)}`),
  message: (id) => req(`/messages/${id}`),
  tags: (themeId = null) => req('/tags' + (themeId ? `?theme_id=${themeId}` : '')),
  mediaUrl: (messageId, index) => `${BASE}/media/${messageId}/${index}`,
  posterUrl: (messageId, index) => `${BASE}/media/poster/${messageId}/${index}`,
  posterHealth: () => req('/media/poster/health'),
  thumbUrl: (thumbPath) => (thumbPath ? `${BASE}/media/thumb/${thumbPath}` : null),

  me: () => req('/auth/me'),
  login: (password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => req('/auth/logout', { method: 'POST' }),
  changePassword: (current, next) =>
    req('/auth/password', { method: 'POST', body: JSON.stringify({ current, next }) }),

  adminThemes: () => req('/admin/themes'),
  createTheme: (name, sortOrder = 0) =>
    req('/admin/themes', { method: 'POST', body: JSON.stringify({ name, sort_order: sortOrder }) }),
  updateTheme: (id, patch) => req(`/admin/themes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTheme: (id) => req(`/admin/themes/${id}`, { method: 'DELETE' }),
  sources: (themeId) => req(`/admin/themes/${themeId}/sources`),
  addSource: (themeId, source) =>
    req(`/admin/themes/${themeId}/sources`, { method: 'POST', body: JSON.stringify(source) }),
  updateSource: (id, patch) => req(`/admin/sources/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteSource: (id) => req(`/admin/sources/${id}`, { method: 'DELETE' }),
  scanTheme: (id, force = false) =>
    req(`/admin/scan/theme/${id}`, { method: 'POST', body: JSON.stringify({ force }) }),
  scanSource: (id, force = false) =>
    req(`/admin/scan/source/${id}`, { method: 'POST', body: JSON.stringify({ force }) }),
  enqueueScan: (scope, id, force = false) =>
    req(`/admin/scan/queue/${scope}/${id}`, { method: 'POST', body: JSON.stringify({ force }) }),
  enqueueAllScan: (force = false) =>
    req('/admin/scan/queue/all', { method: 'POST', body: JSON.stringify({ force }) }),
  listScanJobs: () => req('/admin/scan/jobs'),
  getScanJob: (id) => req(`/admin/scan/job/${id}`),
  cancelScanJob: (id) => req(`/admin/scan/job/${id}`, { method: 'DELETE' }),
  clearFinishedScanJobs: () => req('/admin/scan/jobs/finished', { method: 'DELETE' }),
  scanJobsStream: (onEvent) => {
    const url = `${BASE}/admin/scan/stream/jobs`;
    const eventSource = new EventSource(url);
    eventSource.onmessage = (event) => {
      try { onEvent(JSON.parse(event.data)); }
      catch (_) { /* ignore */ }
    };
    eventSource.onerror = () => onEvent({ type: 'error', message: '连接中断' });
    return () => eventSource.close();
  },
  scanJobStream: (id, onEvent) => {
    const url = `${BASE}/admin/scan/stream/job/${id}`;
    const eventSource = new EventSource(url);
    eventSource.onmessage = (event) => {
      try { onEvent(JSON.parse(event.data)); }
      catch (_) { /* ignore */ }
    };
    eventSource.onerror = () => onEvent({ type: 'error', message: '连接中断' });
    return () => eventSource.close();
  },
  exportConfig: (includeSecrets = false) =>
    fetch(`${BASE}/admin/config/export?include_secrets=${includeSecrets ? 1 : 0}`, { credentials: 'same-origin' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); }),
  importConfig: (payload, { dryRun = false, createMissing = false } = {}) =>
    req('/admin/config/import', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        dry_run: dryRun,
        create_missing_themes: createMissing
      })
    }),
  scanStream: (scope, id, force, onEvent) => {
    const url = `${BASE}/admin/scan/stream/${scope}/${id}?force=${force ? 1 : 0}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      onEvent(payload);
      if (payload.type === 'done' || payload.type === 'error') {
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      onEvent({ type: 'error', message: '连接中断' });
      eventSource.close();
    };

    return () => eventSource.close();
  },
  testSource: (source) => req('/admin/sources/test', { method: 'POST', body: JSON.stringify(source) })
};
