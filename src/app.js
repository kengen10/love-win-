require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const prod = process.env.NODE_ENV === 'production';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  if (prod) throw new Error('JWT_SECRET must be set (32+ chars). See .env.example');
  process.env.JWT_SECRET = 'dev-only-secret-change-me-dev-only-secret-change-me';
}

const app = express();
app.set('trust proxy', 1); // behind Nginx / Vercel's proxy
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: prod ? [] : null,
  } },
}));
app.use(compression());
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());

app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/public'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// On Vercel the files in public/ are served straight from the CDN and this
// middleware is ignored; it is what serves them locally and on a VPS.
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: prod ? '1h' : 0 }));
app.use((_req, res) => res.status(404).sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });

module.exports = app;
