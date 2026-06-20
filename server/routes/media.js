'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');
const { THUMBS_DIR } = require('../config');
const { getAdapter } = require('../services/scanner');
const { safeJoin, mimeFor, isImage } = require('../util');

const router = express.Router();

// Thumb: GET /api/media/thumb/3/<hash>.webp  (generated covers, no auth)
router.get('/thumb/:sid/:name', (req, res) => {
  const file = path.join(THUMBS_DIR, String(req.params.sid), path.basename(req.params.name));
  if (!file.startsWith(THUMBS_DIR)) return res.status(400).end();
  if (!fs.existsSync(file)) return res.status(404).end();
  res.type('image/webp').sendFile(file);
});

// Find a message + adapter + resolve a relative media path safely.
function resolveMessageMedia(messageId, index) {
  const msg = db.prepare('SELECT * FROM messages WHERE id=?').get(Number(messageId));
  if (!msg) return null;
  const main = JSON.parse(msg.main_files || '[]');
  const comments = JSON.parse(msg.comment_files || '[]');
  const all = [...main, ...comments];
  const idx = Number(index);
  if (Number.isNaN(idx) || idx < 0 || idx >= all.length) return null;
  const fileRel = all[idx];
  const source = db.prepare('SELECT * FROM data_sources WHERE id=?').get(msg.source_id);
  if (!source) return null;
  const adapter = getAdapter(source);
  // meta.json paths are relative to the message folder (rel_dir).
  const full = safeJoin(msg.rel_dir, fileRel);
  return { msg, source, adapter, fileRel: full, fileName: fileRel.split('/').pop(), kind: isImage(fileRel) ? 'image' : 'video' };
}

// GET /api/media/:messageId/:index?download=1
router.get('/:messageId/:index', async (req, res) => {
  const info = resolveMessageMedia(req.params.messageId, req.params.index);
  if (!info) return res.status(404).json({ error: 'not found' });
  const { adapter, fileRel, fileName, kind } = info;

  if (adapter.kind === 'local') {
    // Local: stream file with HTTP Range support.
    const p = path.join(info.source.local_path, fileRel);
    if (!fs.existsSync(p)) return res.status(404).end();
    const stat = fs.statSync(p);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    if (req.headers.range) {
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (end >= stat.size) end = stat.size - 1;
      res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end - start + 1);
      fs.createReadStream(p, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(p).pipe(res);
    }
    return;
  }

  // WebDAV: pipe through, honoring Range for videos.
  try {
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    if (req.headers.range) {
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range);
      const start = m && m[1] ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : undefined;
      const stream = adapter.createReadStream(fileRel, { start, end });
      stream.on('error', (e) => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
      stream.pipe(res);
    } else {
      const stream = adapter.createReadStream(fileRel);
      stream.on('error', (e) => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
      stream.pipe(res);
    }
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

module.exports = router;
