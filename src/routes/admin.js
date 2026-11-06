const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const r = express.Router();
// Express 4 does not forward rejected promises to the error handler on its own.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const COOKIE = 'lw_admin';
const prod = process.env.NODE_ENV === 'production';

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' } });

r.post('/login', loginLimit, ah(async (req, res) => {
  const a = await (await db.get('admins')).findOne({ username: String(req.body.username || '').trim() });
  if (!a || !bcrypt.compareSync(String(req.body.password || ''), a.password_hash))
    return res.status(401).json({ error: 'Incorrect username or password.' });
  const token = jwt.sign({ id: a.id, u: a.username }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: prod, maxAge: 8 * 3600 * 1000 });
  res.json({ ok: true, username: a.username });
}));
r.post('/logout', (_req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }); });

function auth(req, res, next) {
  try { req.admin = jwt.verify(req.cookies[COOKIE], process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Please sign in.' }); }
}
r.use(auth);

r.get('/me', (req, res) => res.json({ username: req.admin.u }));

r.get('/summary', ah(async (_req, res) => {
  const [donations, messages, subscribers] = await Promise.all([
    db.get('donations'), db.get('messages'), db.get('subscribers')]);
  const [totals] = await donations.aggregate([
    { $group: { _id: null, paidTotal: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } } } },
  ]).toArray();
  const [paidCount, pendingCount, newMessages, subCount] = await Promise.all([
    donations.countDocuments({ status: 'paid' }),
    donations.countDocuments({ status: 'pending' }),
    messages.countDocuments({ handled: 0 }),
    subscribers.countDocuments({}),
  ]);
  res.json({ paidTotal: totals ? totals.paidTotal : 0, paidCount, pendingCount, newMessages, subscribers: subCount });
}));

r.get('/donations', ah(async (_req, res) => res.json(await db.list('donations', {}, { limit: 500 }))));
r.get('/messages', ah(async (_req, res) => res.json(await db.list('messages', {}, { limit: 500 }))));
r.get('/subscribers', ah(async (_req, res) => res.json(await db.list('subscribers', {}, { limit: 2000 }))));
r.patch('/messages/:id', ah(async (req, res) => {
  await (await db.get('messages')).updateOne({ id: Number(req.params.id) }, { $set: { handled: req.body.handled ? 1 : 0 } });
  res.json({ ok: true });
}));

// Stories & reports: simple CRUD
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const httpUrl = (u) => /^https?:\/\/\S+$/i.test(u);
function crud(table, fields, validate) {
  r.get('/' + table, ah(async (_req, res) => res.json(await db.list(table))));
  r.post('/' + table, ah(async (req, res) => {
    const row = {}; for (const [k, max] of Object.entries(fields)) row[k] = clean(req.body[k], max);
    const err = validate(row); if (err) return res.status(400).json({ error: err });
    row.published = req.body.published ? 1 : 0;
    const saved = await db.insert(table, row);
    res.json({ ok: true, id: saved.id });
  }));
  r.patch('/' + table + '/:id', ah(async (req, res) => {
    await (await db.get(table)).updateOne({ id: Number(req.params.id) }, { $set: { published: req.body.published ? 1 : 0 } });
    res.json({ ok: true });
  }));
  r.delete('/' + table + '/:id', ah(async (req, res) => {
    await (await db.get(table)).deleteOne({ id: Number(req.params.id) });
    res.json({ ok: true });
  }));
}
crud('stories', { title: 200, tag: 40, summary: 1000, image_url: 500 }, (s) =>
  !s.title || !s.summary ? 'Title and summary are required.' : s.image_url && !httpUrl(s.image_url) ? 'Image URL must start with http(s)://' : null);
crud('reports', { title: 200, year: 10, url: 500 }, (s) =>
  !s.title || !httpUrl(s.url) ? 'Title and a valid link (http/https) are required.' : null);

// Payment methods: labels, instructions and bank details the owner can edit.
r.get('/payment-methods', ah(async (_req, res) => res.json(await db.list('payment_methods', {}, { sort: { id: 1 } }))));
r.patch('/payment-methods/:id', ah(async (req, res) => {
  const set = {};
  for (const k of ['label', 'blurb', 'instructions']) if (req.body[k] != null) set[k] = clean(req.body[k], 500);
  if (req.body.details != null) set.details = clean(req.body.details, 2000);
  if (req.body.enabled != null) set.enabled = req.body.enabled ? 1 : 0;
  if (!Object.keys(set).length) return res.status(400).json({ error: 'Nothing to update.' });
  await (await db.get('payment_methods')).updateOne({ id: Number(req.params.id) }, { $set: set });
  res.json({ ok: true });
}));

// CSV exports
const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
function csv(res, name, rows) {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  res.type('text/csv').attachment(name)
    .send([cols.join(',')].concat(rows.map((x) => cols.map((c) => csvCell(x[c])).join(','))).join('\n'));
}
r.get('/export/donations.csv', ah(async (_req, res) => csv(res, 'donations.csv', await db.list('donations'))));
r.get('/export/subscribers.csv', ah(async (_req, res) => csv(res, 'subscribers.csv', await db.list('subscribers'))));

module.exports = r;
