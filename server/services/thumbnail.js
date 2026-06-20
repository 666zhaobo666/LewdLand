'use strict';

const fs = require('fs');
const path = require('path');
const { THUMBS_DIR } = require('../config');
const { isImage, sha1 } = require('../util');

let _sharp = null;
async function getSharp() {
  if (_sharp) return _sharp;
  _sharp = (await import('sharp')).default;
  return _sharp;
}

function firstImage(files) {
  return Array.isArray(files) ? files.find((f) => isImage(f)) : null;
}

// Generate a 640px webp cover for a message folder. Returns the thumb path
// relative to THUMBS_DIR (e.g. "3/<hash>.webp"), or null when not possible.
async function ensureThumb(adapter, sourceId, relDir, mainFiles, commentFiles, force) {
  const candidate = firstImage(mainFiles) || firstImage(commentFiles);
  if (!candidate) return null;
  const sub = String(sourceId);
  const file = `${sha1(relDir)}.webp`;
  const rel = `${sub}/${file}`;
  const dest = path.join(THUMBS_DIR, sub, file);
  if (!force && fs.existsSync(dest)) return rel;

  const fileRel = relDir ? `${relDir}/${candidate}` : candidate;
  let buf;
  try { buf = await adapter.readBuffer(fileRel); }
  catch (e) { return null; }

  try {
    fs.mkdirSync(path.join(THUMBS_DIR, sub), { recursive: true });
    const sharp = await getSharp();
    await sharp(buf)
      .rotate()
      .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(dest);
    return rel;
  } catch (e) {
    // sharp may fail on exotic formats (heic without libvips support). Drop silently.
    try { fs.unlinkSync(dest); } catch (_) {}
    return null;
  }
}

module.exports = { ensureThumb, firstImage, getSharp };
