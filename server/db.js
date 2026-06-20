'use strict';

const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const { DB_PATH, ADMIN_DEFAULT_PASSWORD } = require('./config');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  cover TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('local','webdav')),
  label TEXT,
  local_path TEXT,
  webdav_url TEXT,
  webdav_username TEXT,
  webdav_password TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  source_chat TEXT,
  message_id INTEGER,
  rel_dir TEXT NOT NULL,
  title TEXT,
  description TEXT,
  tags_text TEXT,
  publish_date TEXT,
  main_files TEXT,
  comment_files TEXT,
  thumb_path TEXT,
  media_count INTEGER DEFAULT 0,
  scanned_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_unique ON messages(source_id, rel_dir);
CREATE INDEX IF NOT EXISTS idx_messages_theme ON messages(theme_id);
CREATE INDEX IF NOT EXISTS idx_messages_pub ON messages(theme_id, publish_date);
CREATE INDEX IF NOT EXISTS idx_messages_src ON messages(source_id);

CREATE TABLE IF NOT EXISTS message_tags (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY(message_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON message_tags(tag);
`;
db.exec(SCHEMA);

function getSetting(key) {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return r ? r.value : null;
}

function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

function initAdmin() {
  if (!getSetting('admin_password_hash')) {
    const hash = bcrypt.hashSync(ADMIN_DEFAULT_PASSWORD, 10);
    setSetting('admin_password_hash', hash);
    setSetting('admin_username', 'admin');
    console.log(`[init] Created default admin user "admin" with password "${ADMIN_DEFAULT_PASSWORD}". Change it from the admin panel.`);
  }
}

module.exports = { db, getSetting, setSetting, initAdmin };
