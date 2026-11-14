const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const pay = require('../pesapal');

const r = express.Router();
// Express 4 does not forward rejected promises to the error handler on its own.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const formLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' } });
// Starting a payment is expensive and abusable, so it is limited harder than
// the ordinary forms; the thank-you page polls the status frequently instead.
const donateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' } });
const statusLimit = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' } });

const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;

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

r.get('/payment-methods', ah(async (_req, res) => {
  res.json(await db.list('payment_methods', {
    code: { $in: ['mtn', 'airtel', 'bank'] },
    enabled: 1,
    account_name: { $exists: true, $ne: '' },
    account_number: { $exists: true, $ne: '' },
  }, {
    sort: { id: 1 },
    projection: { code: 1, label: 1, type: 1, blurb: 1, instructions: 1, details: 1, account_name: 1, account_number: 1 },
  }));
}));

// ---- Donations (Pesapal: MTN, Airtel, card and bank) ----
const MIN_AMOUNT = 1000;      // UGX
const MAX_AMOUNT = 20000000;  // UGX, sanity cap

// Ask Pesapal for the real status and update our record. Never trust the
// browser redirect or the IPN body on its own.
async function reconcile(d) {
  if (!d.order_tracking_id) return d;
  const s = await pay.getStatus(d.order_tracking_id);
  if (s.merchant_reference && s.merchant_reference !== d.reference) {
    console.warn('Pesapal reference mismatch for', d.reference);
    return d;
  }
  const set = {};
  if (s.status_code === 1) {
    set.status = Number(s.amount) >= d.amount && s.currency === d.currency ? 'successful' : 'review';
  } else if (s.status_code === 2) {
    if (d.status !== 'successful') set.status = 'failed';
  } else if (s.status_code === 3) {
    set.status = 'reversed';
  } // status_code 0 = not paid yet / invalid: leave it pending
  if (set.status === 'successful') set.paid_at = db.now();
  if (s.payment_method) set.payment_method = String(s.payment_method);
  if (s.confirmation_code) set.confirmation_code = String(s.confirmation_code);
  if (Object.keys(set).length) await (await db.get('donations')).updateOne({ reference: d.reference }, { $set: set });
  return { ...d, ...set };
}

r.post('/donate', donateLimit, ah(async (req, res) => {
  const name = clean(req.body.name, 100), email = clean(req.body.email, 254).toLowerCase();
  const amount = Number(req.body.amount);
  if (name.length < 2 || !isEmail(email) || !Number.isInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT)
    return res.status(400).json({ error: 'Enter your name, a valid email address and a whole-number amount between UGX 1,000 and UGX 20,000,000.' });
  if (!pay.enabled())
    return res.status(503).json({ error: 'Online giving is not switched on yet. Please contact us and we will help you give another way.' });

  const reference = 'LW-' + crypto.randomUUID();
  await db.insert('donations', { reference, name, email, amount, currency: 'UGX', status: 'pending' });

  const donations = await db.get('donations');
  try {
    const { orderTrackingId, redirectUrl } = await pay.submitOrder({
      reference, amount, currency: 'UGX',
      description: 'Donation to Love Wins — Rukundo Nesinga Initiative', name, email,
    });
    await donations.updateOne({ reference }, { $set: { order_tracking_id: orderTrackingId } });
    res.json({ redirectUrl });
  } catch (e) {
    console.error('Pesapal submitOrder failed:', e.message);
    await donations.updateOne({ reference }, { $set: { status: 'failed' } });
    res.status(502).json({ error: 'We could not start the payment. Please try again shortly.' });
  }
}));

// Pesapal calls this when a payment changes. We still re-check with Pesapal
// before updating anything, so a forged IPN cannot mark a gift as paid.
async function ipn(req, res) {
  const src = { ...req.body, ...req.query };
  const orderTrackingId = src.OrderTrackingId;
  const ref = String(src.OrderMerchantReference || '');
  try {
    const donations = await db.get('donations');
    const d = await donations.findOne({ reference: ref });
    if (d && !d.order_tracking_id && orderTrackingId) {
      d.order_tracking_id = String(orderTrackingId);
      await donations.updateOne({ reference: ref }, { $set: { order_tracking_id: d.order_tracking_id } });
    }
    if (d) await reconcile(d);
  } catch (e) { console.error('Pesapal ipn failed:', e.message); }
  res.json({ orderNotificationType: 'IPNCHANGE', orderTrackingId, orderMerchantReference: ref, status: 200 });
}
r.get('/pesapal/ipn', ipn);
r.post('/pesapal/ipn', ipn);

// The thank-you page polls this. It returns only status, amount and currency —
// nothing personal — and re-checks a pending payment with Pesapal.
r.get('/donation-status', statusLimit, ah(async (req, res) => {
  const donations = await db.get('donations');
  const d = await donations.findOne({ reference: clean(req.query.ref, 80) },
    { projection: { _id: 0, reference: 1, status: 1, amount: 1, currency: 1, order_tracking_id: 1 } });
  if (!d) return res.status(404).json({ error: 'Not found' });
  const settled = d.status === 'pending'
    ? await reconcile(d).catch((e) => { console.error('Pesapal reconcile failed:', e.message); return d; })
    : d;
  res.json({ status: settled.status, amount: settled.amount, currency: settled.currency });
}));

module.exports = r;
