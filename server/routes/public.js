'use strict';

const express = require('express');
const { db } = require('../db');
const { safeJoin, mediaKind } = require('../util');

const router = express.Router();

router.get('/themes', (req, res) => {
  const themes = db.prepare(`
    SELECT
      t.id,
      t.name,
      COALESCE(
        t.cover,
        (
          SELECT m.thumb_path
          FROM messages m
          WHERE m.theme_id = t.id AND m.thumb_path IS NOT NULL
          ORDER BY COALESCE(m.publish_date, '') DESC, m.id DESC
          LIMIT 1
        )
      ) AS cover,
      t.sort_order
    FROM themes t
    ORDER BY t.sort_order, t.id
  `).all();
  for (const t of themes) {
    t.message_count = db.prepare('SELECT COUNT(*) c FROM messages WHERE theme_id=?').get(t.id).c;
  }
  res.json(themes);
});

// Build a flat media list (main first, then comments) for the detail view,
// with stable indices and kind hints for the gallery / player.
function buildMediaList(msg) {
  const main = JSON.parse(msg.main_files || '[]');
  const comments = JSON.parse(msg.comment_files || '[]');
  let idx = 0;
  const list = [];
  for (const f of main) list.push({ index: idx++, path: f, slot: 'main', kind: mediaKind(f) });
  for (const f of comments) list.push({ index: idx++, path: f, slot: 'comment', kind: mediaKind(f) });
  return list;
}

function buildDisplayMedia(msg) {
  const media = buildMediaList(msg);
  const firstMainImage = media.find((item) => item.slot === 'main' && item.kind === 'image');
  const firstCommentImage = media.find((item) => item.slot === 'comment' && item.kind === 'image');
  return {
    media,
    cover_index: firstMainImage ? firstMainImage.index : (firstCommentImage ? firstCommentImage.index : null)
  };
}

router.get('/themes/:id/messages', (req, res) => {
  const themeId = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM themes WHERE id=?').get(themeId)) return res.status(404).json({ error: 'theme not found' });
  const limit = Math.min(Number(req.query.limit) || 20, 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * limit;
  const q = req.query.q ? String(req.query.q).trim() : '';

  let where = 'theme_id=?';
  let params = [themeId];
  if (q) {
    where += ' AND (title LIKE ? OR description LIKE ? OR tags_text LIKE ? OR source_chat LIKE ?)';
    const like = '%' + q + '%';
    params.push(like, like, like, like);
  }

  const total = db.prepare(`SELECT COUNT(*) c FROM messages WHERE ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT id,theme_id,source_chat,message_id,title,description,tags_text,
    publish_date,thumb_path,media_count,
    json_array_length(main_files) AS main_count,
    json_array_length(comment_files) AS comment_count
    FROM messages WHERE ${where}
    ORDER BY COALESCE(publish_date,'') DESC, id DESC
    LIMIT ? OFFSET ?`).all(...params, limit, offset);

  res.json({ page, limit, total, items: rows });
});

router.get('/messages/:id', (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id=?').get(Number(req.params.id));
  if (!msg) return res.status(404).json({ error: 'not found' });
  const theme = db.prepare('SELECT id,name FROM themes WHERE id=?').get(msg.theme_id);
  const display = buildDisplayMedia(msg);
  res.json({
    id: msg.id,
    theme_id: msg.theme_id,
    theme_name: theme ? theme.name : null,
    source_chat: msg.source_chat,
    message_id: msg.message_id,
    title: msg.title,
    description: msg.description,
    tags_text: msg.tags_text,
    publish_date: msg.publish_date,
    thumb_path: msg.thumb_path,
    media_count: msg.media_count,
    cover_index: display.cover_index,
    media: display.media
  });
});

router.get('/tags', (req, res) => {
  const themeId = req.query.theme_id ? Number(req.query.theme_id) : null;
  let rows;
  if (themeId) {
    rows = db.prepare(`SELECT mt.tag, COUNT(*) c FROM message_tags mt
      JOIN messages m ON m.id=mt.message_id WHERE m.theme_id=?
      GROUP BY mt.tag ORDER BY c DESC LIMIT 200`).all(themeId);
  } else {
    rows = db.prepare(`SELECT tag, COUNT(*) c FROM message_tags GROUP BY tag ORDER BY c DESC LIMIT 200`).all();
  }
  res.json(rows.map((r) => ({ tag: r.tag, count: r.c })));
});

module.exports = { router, buildMediaList, safeJoin };
