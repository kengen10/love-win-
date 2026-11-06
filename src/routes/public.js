const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const pay = require('../payments');

const r = express.Router();
// Express 4 does not forward rejected promises to the error handler on its own.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const formLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' } });

const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const siteUrl = () => (process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

r.post('/contact', formLimit, ah(async (req, res) => {
  const name = clean(req.body.name, 120), email = clean(req.body.email, 254).toLowerCase();
  const topic = clean(req.body.topic, 80), message = clean(req.body.message, 4000);
  if (!name || !isEmail(email) || message.length < 3) return res.status(400).json({ error: 'Please enter your name, a valid email and a message.' });
  await db.insert('messages', { name, email, topic, message, handled: 0 });
  res.json({ ok: true, message: 'Thank you. Your message has been received and the team will reply soon.' });
}));

r.post('/newsletter', formLimit, ah(async (req, res) => {
  const email = clean(req.body.email, 254).toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const subscribers = await db.get('subscribers');
  if (!(await subscribers.findOne({ email }, { projection: { _id: 1 } }))) await db.insert('subscribers', { email });
  res.json({ ok: true, message: 'Thank you for subscribing.' });
}));

r.get('/stories', ah(async (_req, res) => {
  res.json(await db.list('stories', { published: 1 }, { projection: { id: 1, title: 1, tag: 1, summary: 1, image_url: 1 } }));
}));
r.get('/reports', ah(async (_req, res) => {
  res.json(await db.list('reports', { published: 1 }, { projection: { id: 1, title: 1, year: 1, url: 1 } }));
}));

// ---- Donations ----
r.get('/payment-methods', ah(async (_req, res) => {
  res.json(await db.list('payment_methods', { enabled: 1 },
    { sort: { id: 1 }, projection: { id: 1, code: 1, label: 1, type: 1, blurb: 1, instructions: 1, details: 1 } }));
}));

r.post('/donations', formLimit, ah(async (req, res) => {
  const name = clean(req.body.name, 120), email = clean(req.body.email, 254).toLowerCase();
  const amount = Math.round(Number(req.body.amount));
  const frequency = req.body.frequency === 'monthly' ? 'monthly' : 'once';
  const region = req.body.region === 'international' ? 'international' : 'uganda';
  if (!name || !isEmail(email)) return res.status(400).json({ error: 'Please enter your name and a valid email.' });
  if (!Number.isFinite(amount) || amount < 1000 || amount > 50000000)
    return res.status(400).json({ error: 'Please enter an amount between UGX 1,000 and UGX 50,000,000.' });

  const method = await (await db.get('payment_methods')).findOne(
    { code: clean(req.body.method, 20).toLowerCase(), enabled: 1 },
    { projection: { _id: 0, code: 1, label: 1, type: 1, instructions: 1, details: 1 } });
  if (!method) return res.status(400).json({ error: 'Please choose how you would like to give.' });

  const tx_ref = 'LW-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
  const d = { tx_ref, name, email, amount, currency: 'UGX', frequency, region, method: method.code, status: 'pending' };
  await db.insert('donations', d);

  // Bank transfers are settled outside the payment provider, so we hand the
  // donor the account details instead of a checkout link.
  if (method.type === 'bank') {
    return res.json({ bank: true, message: method.instructions, details: method.details });
  }

  if (!pay.enabled()) {
    return res.json({ demo: true, message: 'Payments are not switched on yet, so no money was taken. Your pledge was recorded for follow-up.' });
  }
  const donations = await db.get('donations');
  try {
    res.json({ url: await pay.createPayment(d, siteUrl()) });
  } catch (e) {
    console.error('createPayment failed:', e.message);
    await donations.updateOne({ tx_ref }, { $set: { status: 'failed' } });
    res.status(502).json({ error: 'We could not start the payment. Please try again shortly.' });
  }
}));

async function settle(tx_ref) {
  const donations = await db.get('donations');
  const d = await donations.findOne({ tx_ref });
  if (!d || d.status === 'paid') return d;
  const v = await pay.verifyByRef(tx_ref);
  const ok = v && v.status === 'successful' && v.currency === d.currency && Number(v.amount) >= d.amount;
  const status = ok ? 'paid' : (v && v.status === 'failed' ? 'failed' : 'pending');
  const set = { status, provider_id: v ? String(v.id) : null };
  if (ok) set.paid_at = db.now();
  await donations.updateOne({ tx_ref }, { $set: set });
  return { ...d, status };
}

r.get('/donations/callback', ah(async (req, res) => {
  const ref = clean(req.query.tx_ref, 80);
  let status = 'pending';
  try {
    if (req.query.status === 'cancelled') {
      await (await db.get('donations')).updateOne({ tx_ref: ref, status: 'pending' }, { $set: { status: 'cancelled' } });
      status = 'cancelled';
    } else {
      const d = await settle(ref);
      status = d ? d.status : 'pending';
    }
  } catch (e) { console.error('callback verify failed:', e.message); }
  res.redirect(`/thank-you.html?status=${encodeURIComponent(status)}`);
}));

r.post('/webhooks/flutterwave', ah(async (req, res) => {
  const hash = process.env.FLW_WEBHOOK_HASH;
  if (!hash || req.get('verif-hash') !== hash) return res.sendStatus(401);
  try { const ref = req.body?.data?.tx_ref; if (ref) await settle(String(ref)); }
  catch (e) { console.error('webhook settle failed:', e.message); }
  res.sendStatus(200);
}));

module.exports = r;
