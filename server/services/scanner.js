'use strict';

const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const { parseReadme } = require('../parse/readme');
const { ensureThumb } = require('./thumbnail');
const { makeClient, wdPath } = require('./webdavClient');

// ---- Adapters: present a uniform interface over local fs and webdav ----

function localAdapter(source) {
  const root = source.local_path;
  return {
    kind: 'local',
    root,
    async list(relDir) {
      const dir = relDir ? path.join(root, relDir) : root;
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const dirs = [], files = [];
      for (const e of entries) {
        if (e.isDirectory()) dirs.push(e.name);
        else if (e.isFile()) files.push(e.name);
      }
      return { dirs, files };
    },
    async readText(relFile) { return fs.promises.readFile(path.join(root, relFile), 'utf8'); },
    async readBuffer(relFile) { return fs.promises.readFile(path.join(root, relFile)); },
    async size(relFile) { return (await fs.promises.stat(path.join(root, relFile))).size; },
    getLocalPath(relFile) { return path.join(root, relFile); },
    createReadStream(relFile, range) {
      const p = path.join(root, relFile);
      return range ? fs.createReadStream(p, { start: range.start, end: range.end }) : fs.createReadStream(p);
    }
  };
}

function webdavAdapter(source) {
  const client = makeClient(source);
  return {
    kind: 'webdav',
    async list(relDir) {
      const items = await client.getDirectoryContents(wdPath(relDir));
      const dirs = [], files = [];
      for (const it of items) {
        if (it.type === 'directory') dirs.push(it.basename);
        else files.push(it.basename);
      }
      return { dirs, files };
    },
    async readText(relFile) { return client.getFileContents(wdPath(relFile), { format: 'text' }); },
    async readBuffer(relFile) {
      const r = await client.getFileContents(wdPath(relFile), { format: 'binary' });
      return Buffer.isBuffer(r) ? r : Buffer.from(r);
    },
    async size(relFile) {
      const s = await client.stat(wdPath(relFile));
      const o = Array.isArray(s) ? s[0] : s;
      return o ? o.size : null;
    },
    createReadStream(relFile, range) {
      return client.createReadStream(wdPath(relFile), range ? { range } : {});
    }
  };
}

function getAdapter(source) {
  if (source.type === 'local') {
    if (!source.local_path) throw new Error('local source missing local_path');
    return localAdapter(source);
  }
  if (source.type === 'webdav') {
    if (!source.webdav_url) throw new Error('webdav source missing url');
    return webdavAdapter(source);
  }
  throw new Error('unknown source type: ' + source.type);
}

// Recursively find folders that contain a meta.json (message folders).
async function findMessageDirs(adapter, onProgress) {
  const found = [];
  async function walk(relDir) {
    let listing;
    try { listing = await adapter.list(relDir); }
    catch (e) { onProgress && onProgress('warn', `list failed: ${relDir || '<root>'} -> ${e.message}`); return; }
    if (listing.files.includes('meta.json')) { found.push(relDir); return; }
    for (const d of listing.dirs) {
      await walk(relDir ? relDir + '/' + d : d);
    }
  }
  await walk('');
  return found;
}

function upsertMessage(source, relDir, meta, readme, mainFiles, commentFiles, thumbKey) {
  const themeId = source.theme_id;
  const sourceId = source.id;
  const title = readme.title || meta.title || relDir;
  const description = readme.description || '';
  const tagsText = readme.tags_text || '';
  const sourceChat = readme.source_chat || meta.source_chat || null;
  const messageId = readme.message_id || meta.message_id || null;
  const publishDate = readme.publish_date || null;
  const mainJson = JSON.stringify(mainFiles);
  const commentJson = JSON.stringify(commentFiles);
  const mediaCount = mainFiles.length + commentFiles.length;

  const existing = db.prepare('SELECT id FROM messages WHERE source_id=? AND rel_dir=?').get(sourceId, relDir);
  let msgId;
  let isUpdate = false;
  db.exec('BEGIN');
  try {
    if (existing) {
      db.prepare(`UPDATE messages SET theme_id=?, source_chat=?, message_id=?, title=?, description=?,
        tags_text=?, publish_date=?, main_files=?, comment_files=?, thumb_path=?, media_count=?,
        scanned_at=datetime('now') WHERE id=?`)
        .run(themeId, sourceChat, messageId, title, description, tagsText, publishDate,
          mainJson, commentJson, thumbKey, mediaCount, existing.id);
      msgId = existing.id;
      isUpdate = true;
    } else {
      const ins = db.prepare(`INSERT INTO messages
       (theme_id, source_id, source_chat, message_id, rel_dir, title, description, tags_text,
        publish_date, main_files, comment_files, thumb_path, media_count)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(themeId, sourceId, sourceChat, messageId, relDir, title, description, tagsText,
          publishDate, mainJson, commentJson, thumbKey, mediaCount);
      msgId = Number(ins.lastInsertRowid);
    }
    db.prepare('DELETE FROM message_tags WHERE message_id=?').run(msgId);
    if (readme.tags && readme.tags.length) {
      const stmt = db.prepare('INSERT OR IGNORE INTO message_tags(message_id, tag) VALUES(?,?)');
      for (const t of readme.tags) stmt.run(msgId, t);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return isUpdate;
}

async function scanSource(source, opts) {
  opts = opts || {};
  const { onProgress, forceThumb = false, prune = true } = opts;
  const adapter = getAdapter(source);
  onProgress && onProgress('start', { source_id: source.id, source_type: source.type, label: source.label || '' });
  const dirs = await findMessageDirs(adapter, onProgress);
  onProgress && onProgress('scan_done', { total: dirs.length });

  let inserted = 0, updated = 0, failed = 0;
  const scanned = new Set();
  for (let i = 0; i < dirs.length; i++) {
    const relDir = dirs[i];
    scanned.add(relDir);
    onProgress && onProgress('progress', { current: i + 1, total: dirs.length, dir: relDir });
    try {
      const meta = JSON.parse(await adapter.readText(relDir + '/meta.json'));
      let readme = {};
      try { readme = parseReadme(await adapter.readText(relDir + '/README.md')); } catch (_) {}
      const mainFiles = Array.isArray(meta.main_files) ? meta.main_files : [];
      const commentFiles = Array.isArray(meta.comment_files) ? meta.comment_files : [];
      let thumbKey = null;
      try { thumbKey = await ensureThumb(adapter, source.id, relDir, mainFiles, commentFiles, forceThumb); }
      catch (e) { onProgress && onProgress('warn', `thumb failed: ${relDir} -> ${e.message}`); }
      const isUpdate = upsertMessage(source, relDir, meta, readme, mainFiles, commentFiles, thumbKey);
      if (isUpdate) updated++; else inserted++;
    } catch (e) {
      failed++;
      onProgress && onProgress('warn', `msg failed: ${relDir} -> ${e.message}`);
    }
  }
  onProgress && onProgress('process_done', { inserted, updated, failed });

  let prunedCount = 0;
  if (prune && dirs.length > 0) {
    const rows = db.prepare('SELECT id, rel_dir FROM messages WHERE source_id=?').all(source.id);
    const delIds = [];
    for (const r of rows) if (!scanned.has(r.rel_dir)) delIds.push(r.id);
    if (delIds.length) {
      const stmt = db.prepare('DELETE FROM messages WHERE id=?');
      db.exec('BEGIN');
      try { for (const id of delIds) stmt.run(id); db.exec('COMMIT'); prunedCount = delIds.length; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  }

  return {
    source_id: source.id, type: source.type, messages: dirs.length,
    inserted, updated, failed, pruned: prunedCount
  };
}

async function scanTheme(themeId, opts) {
  const sources = db.prepare('SELECT * FROM data_sources WHERE theme_id=? AND enabled=1').all(themeId);
  const results = [];
  for (const s of sources) {
    try { results.push(await scanSource(s, opts)); }
    catch (e) { results.push({ source_id: s.id, error: e.message }); }
  }
  return results;
}

async function scanAll(opts) {
  const sources = db.prepare('SELECT * FROM data_sources WHERE enabled=1').all();
  const results = [];
  for (const s of sources) {
    try { results.push(await scanSource(s, opts)); }
    catch (e) { results.push({ source_id: s.id, error: e.message }); }
  }
  return results;
}

module.exports = { getAdapter, scanSource, scanTheme, scanAll };
