'use strict';

const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('./auth');
const { scanTheme, scanSource } = require('../services/scanner');
const { makeClient } = require('../services/webdavClient');
const fs = require('fs');
const path = require('path');

const router = express.Router();
router.use(requireAuth);

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

module.exports = router;
