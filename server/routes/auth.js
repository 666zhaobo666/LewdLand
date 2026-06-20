'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { db, getSetting, setSetting } = require('../db');

const router = express.Router();

function isAuthed(req) { return !!(req.session && req.session.admin); }

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  const hash = getSetting('admin_password_hash');
  if (!hash) return res.status(500).json({ error: 'admin not initialized' });
  if (!password || !bcrypt.compareSync(String(password), hash)) {
    return res.status(401).json({ error: 'invalid password' });
  }
  req.session.admin = true;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.admin = false;
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ authed: isAuthed(req), username: getSetting('admin_username') || 'admin' });
});

router.post('/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  const hash = getSetting('admin_password_hash');
  if (!bcrypt.compareSync(String(current), hash)) return res.status(401).json({ error: 'current password wrong' });
  if (!next || String(next).length < 4) return res.status(400).json({ error: 'new password too short' });
  setSetting('admin_password_hash', bcrypt.hashSync(String(next), 10));
  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'login required' });
}

module.exports = { router, requireAuth };
