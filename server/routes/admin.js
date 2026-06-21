'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('./auth');
const { scanTheme, scanSource } = require('../services/scanner');
const { createScanManager } = require('../services/scanJobs');
const { makeClient } = require('../services/webdavClient');
const fs = require('fs');
const path = require('path');

const router = express.Router();
router.use(requireAuth);
const scanManager = createScanManager({ maxConcurrent: Number(process.env.SCAN_CONCURRENCY) || 2 });

// ---------- Themes ----------
router.get('/themes', (req, res) => {
  const themes = db.prepare('SELECT id,name,cover,sort_order,created_at FROM themes ORDER BY sort_order, id').all();
  for (const t of themes) {
    t.source_count = db.prepare('SELECT COUNT(*) c FROM data_sources WHERE theme_id=?').get(t.id).c;
    t.message_count = db.prepare('SELECT COUNT(*) c FROM messages WHERE theme_id=?').get(t.id).c;
  }
  res.json(themes);
});

router.post('/themes', (req, res) => {
  const { name, sort_order } = req.body || {};
  const n = String(name || '').trim();
  if (!n) return res.status(400).json({ error: 'name required' });
  try {
    const ins = db.prepare('INSERT INTO themes(name, sort_order) VALUES(?,?)').run(n, Number(sort_order) || 0);
    res.json(db.prepare('SELECT id,name,cover,sort_order,created_at FROM themes WHERE id=?').get(Number(ins.lastInsertRowid)));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'theme name must be unique' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/themes/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, sort_order } = req.body || {};
  try {
    db.prepare('UPDATE themes SET name=COALESCE(?,name), sort_order=COALESCE(?,sort_order) WHERE id=?')
      .run(name ? String(name).trim() : null, sort_order == null ? null : Number(sort_order), id);
    res.json(db.prepare('SELECT id,name,cover,sort_order,created_at FROM themes WHERE id=?').get(id));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'theme name must be unique' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/themes/:id', (req, res) => {
  db.prepare('DELETE FROM themes WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Data sources ----------
router.get('/themes/:id/sources', (req, res) => {
  res.json(db.prepare('SELECT * FROM data_sources WHERE theme_id=? ORDER BY id').all(Number(req.params.id)));
});

router.post('/themes/:id/sources', (req, res) => {
  const themeId = Number(req.params.id);
  const b = req.body || {};
  const type = b.type === 'webdav' ? 'webdav' : 'local';
  if (type === 'local' && !b.local_path) return res.status(400).json({ error: 'local_path required' });
  if (type === 'webdav' && !b.webdav_url) return res.status(400).json({ error: 'webdav_url required' });
  const ins = db.prepare(`INSERT INTO data_sources
    (theme_id,type,label,local_path,webdav_url,webdav_username,webdav_password,enabled)
    VALUES (?,?,?,?,?,?,?,1)`)
    .run(themeId, type, b.label || null,
      type === 'local' ? String(b.local_path) : null,
      type === 'webdav' ? String(b.webdav_url) : null,
      b.webdav_username || null, b.webdav_password || null);
  res.json(db.prepare('SELECT * FROM data_sources WHERE id=?').get(Number(ins.lastInsertRowid)));
});

router.patch('/sources/:id', (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM data_sources WHERE id=?').get(id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const type = b.type || cur.type;
  db.prepare(`UPDATE data_sources SET type=?, label=?, local_path=?, webdav_url=?, webdav_username=?,
    webdav_password=?, enabled=? WHERE id=?`)
    .run(type, b.label != null ? b.label : cur.label,
      b.local_path != null ? b.local_path : cur.local_path,
      b.webdav_url != null ? b.webdav_url : cur.webdav_url,
      b.webdav_username != null ? b.webdav_username : cur.webdav_username,
      b.webdav_password != null ? b.webdav_password : cur.webdav_password,
      b.enabled == null ? cur.enabled : (b.enabled ? 1 : 0), id);
  res.json(db.prepare('SELECT * FROM data_sources WHERE id=?').get(id));
});

router.delete('/sources/:id', (req, res) => {
  db.prepare('DELETE FROM data_sources WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Scan ----------
router.post('/scan/theme/:id', async (req, res) => {
  try {
    const results = await scanTheme(Number(req.params.id), { forceThumb: !!req.body.force });
    res.json({ results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/scan/source/:id', async (req, res) => {
  try {
    const src = db.prepare('SELECT * FROM data_sources WHERE id=?').get(Number(req.params.id));
    if (!src) return res.status(404).json({ error: 'source not found' });
    const result = await scanSource(src, { forceThumb: !!req.body.force });
    res.json({ results: [result] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Scan with progress (SSE) ----------
// GET /api/admin/scan/stream/theme/:id?force=1
// GET /api/admin/scan/stream/source/:id?force=1
// Server-Sent Events: pushes {type, ...} JSON lines so the UI can show a progress bar.
function sseScan(res, runFn) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('\n');
  const send = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch (_) {} };
  const onProgress = (type, payload) => {
    if (typeof payload === 'object') send({ type, ...payload });
    else send({ type, message: String(payload) });
  };
  runFn(onProgress)
    .then((results) => { send({ type: 'done', results }); })
    .catch((e) => { send({ type: 'error', message: e.message }); })
    .finally(() => { try { res.end(); } catch (_) {} });
}

router.get('/scan/stream/theme/:id', (req, res) => {
  sseScan(res, (onProgress) => scanTheme(Number(req.params.id), {
    forceThumb: req.query.force === '1' || req.query.force === 'true',
    onProgress
  }));
});

router.get('/scan/stream/source/:id', (req, res) => {
  sseScan(res, async (onProgress) => {
    const src = db.prepare('SELECT * FROM data_sources WHERE id=?').get(Number(req.params.id));
    if (!src) throw new Error('source not found');
    return [await scanSource(src, {
      forceThumb: req.query.force === '1' || req.query.force === 'true',
      onProgress
    })];
  });
});

// ---------- Test connection ----------
router.post('/sources/test', async (req, res) => {
  const b = req.body || {};
  try {
    if (b.type === 'local') {
      const ok = fs.existsSync(b.local_path) && fs.statSync(b.local_path).isDirectory();
      return res.json({ ok, message: ok ? 'directory accessible' : 'not a directory' });
    }
    if (b.type === 'webdav') {
      const { createClient } = require('webdav');
      const client = createClient(b.webdav_url, { username: b.webdav_username || undefined, password: b.webdav_password || undefined });
      await client.getDirectoryContents('/');
      return res.json({ ok: true, message: 'webdav reachable' });
    }
    res.status(400).json({ ok: false, message: 'unknown type' });
  } catch (e) { res.status(200).json({ ok: false, message: e.message }); }
});


// ---------- Scan queue (background, multi-job) ----------

router.post('/scan/queue/theme/:id', (req, res) => {
  const id = Number(req.params.id);
  const theme = db.prepare('SELECT id, name FROM themes WHERE id=?').get(id);
  if (!theme) return res.status(404).json({ error: 'theme not found' });
  const job = scanManager.enqueue({
    scope: 'theme',
    targetId: id,
    force: !!(req.body && req.body.force),
    label: `主题 "${theme.name}"`
  });
  res.json(job);
});

router.post('/scan/queue/source/:id', (req, res) => {
  const id = Number(req.params.id);
  const src = db.prepare('SELECT * FROM data_sources WHERE id=?').get(id);
  if (!src) return res.status(404).json({ error: 'source not found' });
  const job = scanManager.enqueue({
    scope: 'source',
    targetId: id,
    force: !!(req.body && req.body.force),
    label: src.label || `源 #${id}`
  });
  res.json(job);
});

router.post('/scan/queue/all', (req, res) => {
  const sources = db.prepare('SELECT * FROM data_sources WHERE enabled=1 ORDER BY id').all();
  const jobs = sources.map((s) => scanManager.enqueue({
    scope: 'source',
    targetId: s.id,
    force: !!(req.body && req.body.force),
    label: s.label || `源 #${s.id}`
  }));
  res.json({ jobs });
});

router.get('/scan/jobs', (req, res) => {
  res.json({
    jobs: scanManager.listJobs(),
    max_concurrent: scanManager.getMaxConcurrent()
  });
});

router.get('/scan/job/:id', (req, res) => {
  const job = scanManager.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json(job);
});

router.delete('/scan/job/:id', (req, res) => {
  const list = scanManager.listJobs();
  const job = list.find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  if (job.status === 'running') return res.status(409).json({ error: 'job is already running' });
  scanManager.clearFinished();
  res.json({ ok: true });
});

router.get('/scan/stream/job/:id', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('\n');
  const hb = setInterval(() => { try { res.write(':\n\n'); } catch (_) {} }, 15000);
  res.on('close', () => clearInterval(hb));
  scanManager.attach(req.params.id, res);
});

router.get('/scan/stream/jobs', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('\n');
  let alive = true;
  const send = () => {
    if (!alive) return;
    try {
      const payload = JSON.stringify({ type: 'list', jobs: scanManager.listJobs() });
      res.write('data: ' + payload + '\n\n');
    } catch (_) {}
  };
  send();
  const tick = setInterval(send, 1500);
  const hb = setInterval(() => { try { res.write(':\n\n'); } catch (_) {} }, 15000);
  res.on('close', () => { alive = false; clearInterval(tick); clearInterval(hb); });
});

// ---------- Config export / import ----------

router.get('/config/export', (req, res) => {
  const includeSecrets = req.query.include_secrets === '1' || req.query.include_secrets === 'true';
  const themes = db.prepare('SELECT id,name,cover,sort_order,created_at FROM themes ORDER BY sort_order, id').all();
  const sources = db.prepare('SELECT * FROM data_sources ORDER BY id').all();
  for (const s of sources) {
    if (!includeSecrets) {
      s.webdav_username = null;
      s.webdav_password = null;
    }
  }
  res.setHeader('Content-Disposition', 'attachment; filename="lewdland-config.json"');
  res.json({
    version: 1,
    exported_at: new Date().toISOString(),
    include_secrets: includeSecrets,
    themes,
    data_sources: sources
  });
});

router.post('/config/import', (req, res) => {
  const body = req.body || {};
  const dryRun = !!body.dry_run;
  const createMissing = !!body.create_missing_themes;
  const themesIn = Array.isArray(body.themes) ? body.themes : [];
  const sourcesIn = Array.isArray(body.data_sources) ? body.data_sources : [];

  const report = { themes: { created: [], reused: [], skipped: [] }, sources: { created: [], skipped: [] }, errors: [] };

  function getOrCreateThemeId(t) {
    if (!t || !t.name) return null;
    const existing = db.prepare('SELECT id, name FROM themes WHERE name=?').get(String(t.name));
    if (existing) {
      report.themes.reused.push({ name: t.name, id: existing.id });
      return existing.id;
    }
    if (dryRun || !createMissing) {
      report.themes.skipped.push({ name: t.name, reason: dryRun ? 'would create (dry-run)' : 'missing and create_missing_themes=false' });
      return null;
    }
    try {
      const ins = db.prepare('INSERT INTO themes(name, sort_order, cover) VALUES(?,?,?)')
        .run(String(t.name), Number(t.sort_order) || 0, t.cover || null);
      const id = Number(ins.lastInsertRowid);
      report.themes.created.push({ name: t.name, id });
      return id;
    } catch (e) {
      report.errors.push(`theme ${t.name}: ${e.message}`);
      return null;
    }
  }

  const themeIdMap = new Map();
  for (const t of themesIn) {
    const payloadId = t.id;
    const realId = getOrCreateThemeId(t);
    if (realId && payloadId != null) themeIdMap.set(payloadId, realId);
  }

  for (const s of sourcesIn) {
    if (s.theme_id == null && s.theme_name) {
      const t = themesIn.find((x) => x.name === s.theme_name);
      if (t && themeIdMap.has(t.id)) s.theme_id = themeIdMap.get(t.id);
    }
  }

  for (const s of sourcesIn) {
    const targetThemeId = themeIdMap.get(s.theme_id) || (s.theme_id != null ? Number(s.theme_id) : null);
    if (!targetThemeId) {
      report.sources.skipped.push({ label: s.label, reason: 'unresolved theme_id' });
      continue;
    }
    const existing = db.prepare(`SELECT id FROM data_sources
      WHERE theme_id=? AND type=? AND COALESCE(label,'')=COALESCE(?,'') AND
        ((? IS NULL AND local_path IS NULL) OR local_path=?) AND
        ((? IS NULL AND webdav_url IS NULL) OR webdav_url=?)`)
      .get(targetThemeId, s.type === 'webdav' ? 'webdav' : 'local',
           s.label || null,
           s.local_path || null, s.local_path || null,
           s.webdav_url || null, s.webdav_url || null);
    if (existing) {
      report.sources.skipped.push({ id: existing.id, label: s.label, reason: 'already exists' });
      continue;
    }
    if (dryRun) {
      report.sources.created.push({ label: s.label, theme_id: targetThemeId, would_create: true });
      continue;
    }
    try {
      const ins = db.prepare(`INSERT INTO data_sources
        (theme_id,type,label,local_path,webdav_url,webdav_username,webdav_password,enabled)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(targetThemeId, s.type === 'webdav' ? 'webdav' : 'local',
             s.label || null,
             s.local_path || null,
             s.webdav_url || null,
             s.webdav_username || null,
             s.webdav_password || null,
             s.enabled == null ? 1 : (s.enabled ? 1 : 0));
      report.sources.created.push({ id: Number(ins.lastInsertRowid), label: s.label, theme_id: targetThemeId });
    } catch (e) {
      report.errors.push(`source ${s.label || s.id}: ${e.message}`);
    }
  }

  res.json({ dry_run: dryRun, ...report });
});

module.exports = router;
