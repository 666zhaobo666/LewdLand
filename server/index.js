'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const { PORT, SESSION_SECRET } = require('./config');
const { initAdmin } = require('./db');
const { router: authRouter } = require('./routes/auth');
const adminRouter = require('./routes/admin');
const { router: publicRouter } = require('./routes/public');
const mediaRouter = require('./routes/media');

initAdmin();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'lewd_sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, sameSite: 'lax' }
}));

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api', publicRouter);      // /api/themes, /api/themes/:id/messages, /api/messages/:id, /api/tags
app.use('/api/media', mediaRouter); // /api/media/:messageId/:index, /api/media/thumb/:sid/:name

// Serve built client if present.
const distDir = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(distDir, { index: false, maxAge: '1h' }));
app.get(/^\/(?!api).*/, (req, res, next) => {
  const idx = path.join(distDir, 'index.html');
  if (require('fs').existsSync(idx)) return res.sendFile(idx);
  next();
});

app.listen(PORT, () => {
  console.log(`LewdLand server listening on http://localhost:${PORT}`);
});
