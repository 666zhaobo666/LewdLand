'use strict';

const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.LEWDLAND_DATA
  ? path.resolve(process.env.LEWDLAND_DATA)
  : path.join(__dirname, '..', 'data');

const DB_PATH = path.join(DATA_DIR, 'app.sqlite');
const THUMBS_DIR = path.join(DATA_DIR, 'thumbs');

fs.mkdirSync(THUMBS_DIR, { recursive: true });

module.exports = {
  DATA_DIR,
  DB_PATH,
  THUMBS_DIR,
  PORT: Number(process.env.PORT) || 3000,
  SESSION_SECRET: process.env.SESSION_SECRET || 'lewland-dev-secret-change-me',
  ADMIN_DEFAULT_PASSWORD: process.env.ADMIN_DEFAULT_PASSWORD || 'admin',
  // Max bytes to buffer when downloading a remote (webdav) file just to make a thumbnail.
  THUMB_SOURCE_MAX_BYTES: 80 * 1024 * 1024
};
