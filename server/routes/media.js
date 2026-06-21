'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');
const { THUMBS_DIR } = require('../config');
const { getAdapter } = require('../services/scanner');
const { getSharp, generateVideoThumbFromFile, generateVideoThumbFromStream } = require('../services/thumbnail');
const { safeJoin, mimeFor, isImage, getExt } = require('../util');

const router = express.Router();

router.get('/thumb/:sid/:name', (req, res) => {
  const file = path.join(THUMBS_DIR, String(req.params.sid), path.basename(req.params.name));
  if (!file.startsWith(THUMBS_DIR)) return res.status(400).end();
  if (!fs.existsSync(file)) return res.status(404).end();
  res.type('image/webp').sendFile(file);
});

async function writePosterFromJpeg(tempPath, res) {
  const sharp = await getSharp();
  const buffer = await sharp(tempPath)
    .rotate()
    .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
  res.type('image/webp');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}

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
  const slot = idx < main.length ? 'main' : 'comment';
  return { msg, source, adapter, fileRel: full, rawFileRel: fileRel, fileName: fileRel.split('/').pop(), kind: isImage(fileRel) ? 'image' : 'video', slot };
}

async function resolveExistingMediaPath(info) {
  const candidates = [info.fileRel];
  if (info.slot === 'main' && !String(info.rawFileRel).includes('/')) {
    candidates.push(safeJoin(info.msg.rel_dir, 'main', info.rawFileRel));
  }
  for (const candidate of candidates) {
    try {
      if (info.adapter.kind === 'local') {
        const fullPath = path.join(info.source.local_path, candidate);
        if (fs.existsSync(fullPath)) return { rel: candidate, localPath: fullPath };
      } else {
        const stream = info.adapter.createReadStream(candidate, { start: 0, end: 0 });
        await new Promise((resolve, reject) => {
          let settled = false;
          stream.on('response', () => {
            if (!settled) { settled = true; resolve(); }
          });
          stream.on('data', () => {
            if (!settled) { settled = true; resolve(); }
            try { stream.destroy(); } catch (_) {}
          });
          stream.on('close', () => {
            if (!settled) { settled = true; resolve(); }
          });
          stream.on('error', (error) => {
            if (!settled) { settled = true; reject(error); }
          });
        });
        return { rel: candidate };
      }
    } catch (_) {
      // Try next candidate.
    }
  }
  return null;
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

function parseRangeHeader(rangeHeader, size) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return null;

  let start;
  let end;
  if (match[1] === '' && match[2] === '') return null;

  if (match[1] === '') {
    const suffixLength = parseInt(match[2], 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = parseInt(match[1], 10);
    end = match[2] ? parseInt(match[2], 10) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

function sendRangeNotSatisfiable(res, size) {
  res.status(416);
  res.setHeader('Content-Range', `bytes */${size}`);
  res.end();
}

router.get('/poster/:messageId/:index', async (req, res) => {
  const info = resolveMessageMedia(req.params.messageId, req.params.index);
  if (!info || info.kind !== 'video') return res.status(404).json({ error: 'not found' });

  const resolved = await resolveExistingMediaPath(info);
  if (!resolved) return res.status(404).json({ error: 'not found' });

  const tempDir = path.join(THUMBS_DIR, '_posters');
  const tempFile = path.join(tempDir, `${info.msg.id}-${req.params.index}-${Date.now()}.jpg`);
  await fs.promises.mkdir(tempDir, { recursive: true });

  try {
    if (info.adapter.kind === 'local') {
      await generateVideoThumbFromFile(resolved.localPath, tempFile, 1);
    } else {
      const stream = info.adapter.createReadStream(resolved.rel);
      await generateVideoThumbFromStream(stream, tempFile, 1);
    }
    await writePosterFromJpeg(tempFile, res);
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: error.message });
  } finally {
    await fs.promises.unlink(tempFile).catch(() => {});
  }
});

router.get('/:messageId/:index', async (req, res) => {
  const info = resolveMessageMedia(req.params.messageId, req.params.index);
  if (!info) return res.status(404).json({ error: 'not found' });
  const { adapter, fileName } = info;
  const resolved = await resolveExistingMediaPath(info);
  if (!resolved) return res.status(404).json({ error: 'not found' });

  if (adapter.kind === 'local') {
    const filePath = resolved.localPath;
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).end();

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
      const range = parseRangeHeader(req.headers.range, stat.size);
      if (!range) return sendRangeNotSatisfiable(res, stat.size);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
      res.setHeader('Content-Length', range.end - range.start + 1);
      fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
    } else {
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(filePath).pipe(res);
    }
    return;
  }

  try {
    const size = await adapter.size(resolved.rel).catch(() => null);
    res.type(mimeFor(fileName));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (size != null) res.setHeader('Content-Length', size);
    if (req.query.download) {
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    }
    if (req.headers.range) {
      if (size == null) {
        return res.status(500).json({ error: 'unable to determine media size for range request' });
      }
      const range = parseRangeHeader(req.headers.range, size);
      if (!range) return sendRangeNotSatisfiable(res, size);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      res.setHeader('Content-Length', range.end - range.start + 1);
      const stream = adapter.createReadStream(resolved.rel, { start: range.start, end: range.end });
      stream.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
      stream.pipe(res);
    } else {
      const stream = adapter.createReadStream(resolved.rel);
      stream.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
      stream.pipe(res);
    }
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

module.exports = router;
