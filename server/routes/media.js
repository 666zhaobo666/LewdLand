'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');
const { THUMBS_DIR } = require('../config');
const { getAdapter } = require('../services/scanner');
const { safeJoin, mimeFor, isImage, getExt } = require('../util');

const router = express.Router();

let sharpLoader = null;
async function getSharp() {
  if (!sharpLoader) sharpLoader = import('sharp').then((mod) => mod.default);
  return sharpLoader;
}

router.get('/thumb/:sid/:name', (req, res) => {
  const file = path.join(THUMBS_DIR, String(req.params.sid), path.basename(req.params.name));
  if (!file.startsWith(THUMBS_DIR)) return res.status(400).end();
  if (!fs.existsSync(file)) return res.status(404).end();
  res.type('image/webp').sendFile(file);
});

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
  const full = safeJoin(msg.rel_dir, fileRel);
  return { msg, source, adapter, fileRel: full, fileName: fileRel.split('/').pop(), kind: isImage(fileRel) ? 'image' : 'video' };
}

async function sendConvertedImage(res, filePath) {
  const sharp = await getSharp();
  const buffer = await sharp(filePath).rotate().jpeg({ quality: 90 }).toBuffer();
  res.type('image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}

function shouldConvertImage(fileName) {
  const ext = getExt(fileName);
  return ext === 'heic' || ext === 'heif' || ext === 'avif' || ext === 'tif' || ext === 'tiff';
}

router.get('/:messageId/:index', async (req, res) => {
  const info = resolveMessageMedia(req.params.messageId, req.params.index);
  if (!info) return res.status(404).json({ error: 'not found' });
  const { adapter, fileRel, fileName } = info;

  if (adapter.kind === 'local') {
    const filePath = path.join(info.source.local_path, fileRel);
    if (!fs.existsSync(filePath)) return res.status(404).end();

    if (isImage(fileName) && shouldConvertImage(fileName)) {
      try {
        await sendConvertedImage(res, filePath);
        return;
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }

    const stat = fs.statSync(filePath);
    res.type(mimeFor(fileName));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (req.query.download) {
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    }
    if (req.headers.range) {
      const match = /bytes=(\d*)-(\d*)/.exec(req.headers.range);
      let start = match && match[1] ? parseInt(match[1], 10) : 0;
      let end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1;
      if (end >= stat.size) end = stat.size - 1;
      res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end - start + 1);
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(filePath).pipe(res);
    }
    return;
  }

  try {
    res.type(mimeFor(fileName));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (req.query.download) {
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    }
    if (req.headers.range) {
      const match = /bytes=(\d*)-(\d*)/.exec(req.headers.range);
      const start = match && match[1] ? parseInt(match[1], 10) : 0;
      const end = match && match[2] ? parseInt(match[2], 10) : undefined;
      const stream = adapter.createReadStream(fileRel, { start, end });
      stream.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
      stream.pipe(res);
    } else {
      const stream = adapter.createReadStream(fileRel);
      stream.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
      stream.pipe(res);
    }
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

module.exports = router;
