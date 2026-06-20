'use strict';

const { createClient } = require('webdav');

const _cache = new Map();

function makeClient(source) {
  const key = source.id;
  const cached = _cache.get(key);
  if (cached) return cached;
  const client = createClient(source.webdav_url, {
    username: source.webdav_username || undefined,
    password: source.webdav_password || undefined
  });
  _cache.set(key, client);
  return client;
}

function dropClient(sourceId) { _cache.delete(sourceId); }

// Convert a path relative to the webdav base into a webdav path. '' -> '/'.
function wdPath(rel) {
  if (!rel) return '/';
  return '/' + String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
}

module.exports = { makeClient, dropClient, wdPath };
