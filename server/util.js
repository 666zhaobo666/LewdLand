'use strict';

const crypto = require('crypto');

const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','avif','heic','heif','tif','tiff']);
const VIDEO_EXTS = new Set(['mp4','mkv','webm','mov','avi','flv','m4v','ts','wmv','m2ts','3gp']);

const MIME = {
  jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp',
  bmp:'image/bmp', avif:'image/avif', heic:'image/heic', heif:'image/heif', tif:'image/tiff', tiff:'image/tiff',
  mp4:'video/mp4', mkv:'video/x-matroska', webm:'video/webm', mov:'video/quicktime', avi:'video/x-msvideo',
  flv:'video/x-flv', m4v:'video/x-m4v', ts:'video/mp2t', wmv:'video/x-ms-wmv', m2ts:'video/mp2t', '3gp':'video/3gpp'
};

function getExt(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}
function isImage(name) { return IMAGE_EXTS.has(getExt(name)); }
function isVideo(name) { return VIDEO_EXTS.has(getExt(name)); }
function mediaKind(name) { return isVideo(name) ? 'video' : (isImage(name) ? 'image' : 'other'); }
function mimeFor(name) { return MIME[getExt(name)] || 'application/octet-stream'; }

// Join relative segments, normalize, and reject traversal / absolute paths.
function safeJoin(...parts) {
  const joined = parts.filter(Boolean).join('/').replace(/\\/g, '/');
  const segs = [];
  for (const s of joined.split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') { if (segs.length) segs.pop(); else throw new Error('path traversal denied'); }
    else segs.push(s);
  }
  return segs.join('/');
}

function sha1(str) { return crypto.createHash('sha1').update(str).digest('hex'); }

module.exports = { IMAGE_EXTS, VIDEO_EXTS, getExt, isImage, isVideo, mediaKind, mimeFor, safeJoin, sha1 };
