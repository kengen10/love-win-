const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const pay = require('../payments');

const r = express.Router();
const formLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' } });

const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const siteUrl = () => (process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

r.post('/contact', formLimit, (req, res) => {
  const name = clean(req.body.name, 120), email = clean(req.body.email, 254).toLowerCase();
  const topic = clean(req.body.topic, 80), message = clean(req.body.message, 4000);
  if (!name || !isEmail(email) || message.length < 3) return res.status(400).json({ error: 'Please enter your name, a valid email and a message.' });
  db.prepare('INSERT INTO messages(name,email,topic,message) VALUES(?,?,?,?)').run(name, email, topic, message);
  res.json({ ok: true, message: 'Thank you. Your message has been received and the team will reply soon.' });
});

r.post('/newsletter', formLimit, (req, res) => {
  const email = clean(req.body.email, 254).toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  db.prepare('INSERT OR IGNORE INTO subscribers(email) VALUES(?)').run(email);
  res.json({ ok: true, message: 'Thank you for subscribing.' });
});

r.get('/stories', (_req, res) => {
  res.json(db.prepare('SELECT id,title,tag,summary,image_url FROM stories WHERE published=1 ORDER BY id DESC').all());
});
r.get('/reports', (_req, res) => {
  res.json(db.prepare('SELECT id,title,year,url FROM reports WHERE published=1 ORDER BY id DESC').all());
});

// ---- Donations ----
r.post('/donations', formLimit, async (req, res) => {
  const name = clean(req.body.name, 120), email = clean(req.body.email, 254).toLowerCase();
  const amount = Math.round(Number(req.body.amount));
  const frequency = req.body.frequency === 'monthly' ? 'monthly' : 'once';
  const region = req.body.region === 'international' ? 'international' : 'uganda';
  if (!name || !isEmail(email)) return res.status(400).json({ error: 'Please enter your name and a valid email.' });
  if (!Number.isFinite(amount) || amount < 1000 || amount > 50000000)
    return res.status(400).json({ error: 'Please enter an amount between UGX 1,000 and UGX 50,000,000.' });

  const tx_ref = 'LW-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
  const d = { tx_ref, name, email, amount, currency: 'UGX', frequency, region };
  db.prepare('INSERT INTO donations(tx_ref,name,email,amount,currency,frequency,region) VALUES(@tx_ref,@name,@email,@amount,@currency,@frequency,@region)').run(d);

  if (!pay.enabled()) {
    return res.json({ demo: true, message: 'Payments are not switched on yet, so no money was taken. Your pledge was recorded for follow-up.' });
  }
  try {
    res.json({ url: await pay.createPayment(d, siteUrl()) });
  } catch (e) {
    console.error('createPayment failed:', e.message);
    db.prepare("UPDATE donations SET status='failed' WHERE tx_ref=?").run(tx_ref);
    res.status(502).json({ error: 'We could not start the payment. Please try again shortly.' });
  }
});

async function settle(tx_ref) {
  const d = db.prepare('SELECT * FROM donations WHERE tx_ref=?').get(tx_ref);
  if (!d || d.status === 'paid') return d;
  const v = await pay.verifyByRef(tx_ref);
  const ok = v && v.status === 'successful' && v.currency === d.currency && Number(v.amount) >= d.amount;
  const status = ok ? 'paid' : (v && v.status === 'failed' ? 'failed' : 'pending');
  db.prepare("UPDATE donations SET status=?, provider_id=?, paid_at=CASE WHEN ?=1 THEN datetime('now') ELSE paid_at END WHERE tx_ref=?")
    .run(status, v ? String(v.id) : null, ok ? 1 : 0, tx_ref);
  return { ...d, status };
}

r.get('/donations/callback', async (req, res) => {
  const ref = clean(req.query.tx_ref, 80);
  let status = 'pending';
  try {
    if (req.query.status === 'cancelled') {
      db.prepare("UPDATE donations SET status='cancelled' WHERE tx_ref=? AND status='pending'").run(ref);
      status = 'cancelled';
    } else {
      const d = await settle(ref);
      status = d ? d.status : 'pending';
    }
  } catch (e) { console.error('callback verify failed:', e.message); }
  res.redirect(`/thank-you.html?status=${encodeURIComponent(status)}`);
});

r.post('/webhooks/flutterwave', async (req, res) => {
  const hash = process.env.FLW_WEBHOOK_HASH;
  if (!hash || req.get('verif-hash') !== hash) return res.sendStatus(401);
  try { const ref = req.body?.data?.tx_ref; if (ref) await settle(String(ref)); }
  catch (e) { console.error('webhook settle failed:', e.message); }
  res.sendStatus(200);
});

module.exports = r;
