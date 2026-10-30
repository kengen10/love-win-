const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const r = express.Router();
const COOKIE = 'lw_admin';
const prod = process.env.NODE_ENV === 'production';

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' } });

r.post('/login', loginLimit, (req, res) => {
  const a = db.prepare('SELECT * FROM admins WHERE username=?').get(String(req.body.username || '').trim());
  if (!a || !bcrypt.compareSync(String(req.body.password || ''), a.password_hash))
    return res.status(401).json({ error: 'Incorrect username or password.' });
  const token = jwt.sign({ id: a.id, u: a.username }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: prod, maxAge: 8 * 3600 * 1000 });
  res.json({ ok: true, username: a.username });
});
r.post('/logout', (_req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }); });

function auth(req, res, next) {
  try { req.admin = jwt.verify(req.cookies[COOKIE], process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Please sign in.' }); }
}
r.use(auth);

r.get('/me', (req, res) => res.json({ username: req.admin.u }));

r.get('/summary', (_req, res) => {
  const one = (sql) => db.prepare(sql).get();
  res.json({
    paidTotal: one("SELECT COALESCE(SUM(amount),0) v FROM donations WHERE status='paid'").v,
    paidCount: one("SELECT COUNT(*) v FROM donations WHERE status='paid'").v,
    pendingCount: one("SELECT COUNT(*) v FROM donations WHERE status='pending'").v,
    newMessages: one('SELECT COUNT(*) v FROM messages WHERE handled=0').v,
    subscribers: one('SELECT COUNT(*) v FROM subscribers').v,
  });
});

r.get('/donations', (_req, res) => res.json(db.prepare('SELECT * FROM donations ORDER BY id DESC LIMIT 500').all()));
r.get('/messages', (_req, res) => res.json(db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 500').all()));
r.get('/subscribers', (_req, res) => res.json(db.prepare('SELECT * FROM subscribers ORDER BY id DESC LIMIT 2000').all()));
r.patch('/messages/:id', (req, res) => {
  db.prepare('UPDATE messages SET handled=? WHERE id=?').run(req.body.handled ? 1 : 0, Number(req.params.id));
  res.json({ ok: true });
});

// Stories & reports: simple CRUD
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const httpUrl = (u) => /^https?:\/\/\S+$/i.test(u);
function crud(table, fields, validate) {
  r.get('/' + table, (_req, res) => res.json(db.prepare(`SELECT * FROM ${table} ORDER BY id DESC`).all()));
  r.post('/' + table, (req, res) => {
    const row = {}; for (const [k, max] of Object.entries(fields)) row[k] = clean(req.body[k], max);
    const err = validate(row); if (err) return res.status(400).json({ error: err });
    row.published = req.body.published ? 1 : 0;
    const cols = Object.keys(row);
    const info = db.prepare(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map((c) => '@' + c).join(',')})`).run(row);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  r.patch('/' + table + '/:id', (req, res) => {
    db.prepare(`UPDATE ${table} SET published=? WHERE id=?`).run(req.body.published ? 1 : 0, Number(req.params.id));
    res.json({ ok: true });
  });
  r.delete('/' + table + '/:id', (req, res) => {
    db.prepare(`DELETE FROM ${table} WHERE id=?`).run(Number(req.params.id));
    res.json({ ok: true });
  });
}
crud('stories', { title: 200, tag: 40, summary: 1000, image_url: 500 }, (s) =>
  !s.title || !s.summary ? 'Title and summary are required.' : s.image_url && !httpUrl(s.image_url) ? 'Image URL must start with http(s)://' : null);
crud('reports', { title: 200, year: 10, url: 500 }, (s) =>
  !s.title || !httpUrl(s.url) ? 'Title and a valid link (http/https) are required.' : null);

// CSV exports
const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
function csv(res, name, rows) {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  res.type('text/csv').attachment(name)
    .send([cols.join(',')].concat(rows.map((x) => cols.map((c) => csvCell(x[c])).join(','))).join('\n'));
}
r.get('/export/donations.csv', (_req, res) => csv(res, 'donations.csv', db.prepare('SELECT * FROM donations ORDER BY id DESC').all()));
r.get('/export/subscribers.csv', (_req, res) => csv(res, 'subscribers.csv', db.prepare('SELECT * FROM subscribers ORDER BY id DESC').all()));

module.exports = r;
